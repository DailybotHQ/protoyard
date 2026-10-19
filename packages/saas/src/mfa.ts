import {
  createRuntimeId,
  hashString,
  isExampleEmail,
  parseInput,
  ValidationError,
} from '@protoyard/core';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import { z } from 'zod';
import { type AuthOptions, checkPasswordAttempt } from './auth.ts';
import type { SaasAccount, SaasMfa, SaasSessionLog, SaasToken } from './schema.ts';
import { SaasMfaSchema } from './schema.ts';

/**
 * Simulated MFA (TOTP-style codes + recovery codes). UX only — NOT real TOTP
 * or security. Codes are a deterministic function of a stored seed and the
 * 30-second window of `clock.now()`. Show them in a "simulated authenticator"
 * panel; never claim cryptographic strength.
 */

/** 30-second windows, matching common authenticator UX (simulation only). */
export const MFA_WINDOW_MS = 30_000;

const ACCOUNTS = 'saas_accounts';
const MFA = 'saas_mfa';
const LOG = 'saas_sessions_log';
const TOKENS = 'saas_tokens';

/** How long an `mfa-challenge` token stays valid on the simulated clock (10 minutes). */
export const MFA_CHALLENGE_TTL_MS = 10 * 60_000;

interface TableLike<T> {
  get(id: string): Promise<T | undefined>;
  put(row: T): Promise<unknown>;
  add(row: T): Promise<unknown>;
  delete(id: string): Promise<unknown>;
  where(index: string): { equals(value: string): { first(): Promise<T | undefined> } };
}
interface DatabaseLike {
  table<T>(name: string): TableLike<T>;
  transaction<R>(mode: 'rw', tables: string[], scope: () => Promise<R>): Promise<R>;
}

export interface MfaOptions extends Pick<AuthOptions, 'lockoutThreshold' | 'requireVerifiedEmail'> {
  /** How many one-time recovery codes to mint at enroll (default 8). */
  recoveryCodeCount?: number;
  productName?: string;
  /** Minutes an MFA challenge stays valid on the simulated clock (default 10). */
  challengeTtlMinutes?: number;
}

/**
 * The handle a first factor (password, magic link, OAuth) returns when MFA
 * is active. Pass `id` to `completeChallenge`. It is single-use and expires;
 * an account id is never accepted in its place.
 */
export interface MfaChallenge {
  id: string;
  expiresAt: string;
}

/** Which first factor minted a challenge (kept in the token payload). */
export type MfaChallengeMethod = 'password' | 'magic-link' | 'oauth';

/**
 * Builds the `saas_tokens` row for a fresh MFA challenge. The caller adds it
 * inside the same transaction that verified the first factor.
 */
export function createMfaChallengeToken(
  account: Pick<SaasAccount, 'id' | 'email'>,
  method: MfaChallengeMethod,
  at: Date,
  ttlMs: number = MFA_CHALLENGE_TTL_MS
): SaasToken {
  return {
    id: createRuntimeId('mfachallenge'),
    kind: 'mfa-challenge',
    email: account.email,
    accountId: account.id,
    payload: { method },
    createdAt: at.toISOString(),
    expiresAt: new Date(at.getTime() + ttlMs).toISOString(),
    consumedAt: null,
  };
}

/** The kit's MFA screen route for a challenge (hash router), with an optional `next`. */
export function mfaChallengeHref(challengeId: string, next?: string): string {
  const query = `challenge=${encodeURIComponent(challengeId)}`;
  return `#/auth/mfa?${query}${next ? `&next=${encodeURIComponent(next)}` : ''}`;
}

const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email'))
  .refine(isExampleEmail, 'Use a fictional address at example.com');

export const MfaCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit simulated code');

export const RecoveryCodeInputSchema = z.string().trim().min(6, 'Enter a recovery code').max(32);

export const PasswordSignInSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Enter your password'),
});
export type PasswordSignInInput = z.input<typeof PasswordSignInSchema>;

export type MfaSignInResult =
  | { status: 'signed-in'; account: SaasAccount }
  | { status: 'mfa-required'; account: SaasAccount; challenge: MfaChallenge };

/** What the MFA screen may show for a live challenge (simulation only). */
export interface MfaChallengeView {
  email: string;
  expiresAt: string;
  /** Current simulated code for the challenge's account only. */
  code: string;
  secondsRemaining: number;
  simulated: true;
}

type ProofIssues = { error: Record<string, string> };

/** Deterministic 6-digit code for a seed at a given instant (simulation only). */
export function simulatedTotpCode(seed: string, nowMs: number): string {
  const window = Math.floor(nowMs / MFA_WINDOW_MS);
  const value = hashString(`${seed}:window:${window}`) % 1_000_000;
  return value.toString().padStart(6, '0');
}

/** Seconds remaining in the current 30s window (for the authenticator panel). */
export function simulatedTotpSecondsRemaining(nowMs: number): number {
  const elapsed = nowMs % MFA_WINDOW_MS;
  return Math.ceil((MFA_WINDOW_MS - elapsed) / 1000);
}

function mintRecoveryCodes(seed: string, count: number): SaasMfa['recoveryCodes'] {
  return Array.from({ length: count }, (_, index) => {
    const raw = hashString(`${seed}:recovery:${index}`)
      .toString(16)
      .toUpperCase()
      .padStart(8, '0')
      .slice(0, 8);
    return { code: raw, usedAt: null };
  });
}

function mintSeed(accountId: string, nowIso: string): string {
  return `sim-mfa-${hashString(`${accountId}:${nowIso}`).toString(16)}`;
}

/**
 * Simulated MFA services bound to a prototype runtime.
 *
 * ```ts
 * const mfa = createMfaServices(runtime);
 * const { currentCode, recoveryCodes } = await mfa.enroll();
 * await mfa.confirmEnroll(currentCode);
 * const result = await mfa.signInWithPassword({ email, password });
 * if (result.status === 'mfa-required') {
 *   await mfa.completeChallenge(result.challenge.id, { code: mfa.currentCode(seed) });
 * }
 * ```
 */
export function createMfaServices(runtime: ProtoyardRuntime, options: MfaOptions = {}) {
  const db = runtime.db as unknown as DatabaseLike;
  const { session, environment, clock } = runtime;
  const recoveryCount = options.recoveryCodeCount ?? 8;
  const challengeTtlMs = (options.challengeTtlMinutes ?? 10) * 60_000;
  const now = () => clock.now().toISOString();
  const nowMs = () => clock.now().getTime();

  const accounts = () => db.table<SaasAccount>(ACCOUNTS);
  const mfaTable = () => db.table<SaasMfa>(MFA);
  const tokens = () => db.table<SaasToken>(TOKENS);
  const findAccountByEmail = (email: string) => accounts().where('email').equals(email).first();
  const findMfa = (accountId: string) => mfaTable().where('accountId').equals(accountId).first();

  const log = (entry: Omit<SaasSessionLog, 'id' | 'at' | 'provider'>) =>
    db.table<SaasSessionLog>(LOG).add({
      id: createRuntimeId('signin'),
      at: now(),
      provider: null,
      ...entry,
    });

  function requirePersonaId(): string {
    const id = session.principal()?.persona.id;
    if (!id) throw new ValidationError({ form: 'Sign in before managing MFA.' });
    return id;
  }

  async function requireAccount(personaId = requirePersonaId()): Promise<SaasAccount> {
    const account = await accounts().where('personaId').equals(personaId).first();
    if (!account) throw new ValidationError({ form: 'No account is linked to this persona.' });
    return account;
  }

  function codeFor(seed: string): string {
    return simulatedTotpCode(seed, nowMs());
  }

  /**
   * Checks a code or recovery code against an active MFA row. A wrong proof
   * is logged and RETURNED (not thrown): throwing inside the transaction
   * would roll the failure row back. Callers throw after the commit.
   */
  async function checkProof(
    row: SaasMfa,
    proof: { code: string } | { recoveryCode: string },
    personaId: string | null
  ): Promise<ProofIssues | null> {
    if (row.status !== 'active') {
      return { error: { form: 'MFA is not active on this account.' } };
    }
    if ('code' in proof) {
      const code = parseInput(MfaCodeSchema, proof.code);
      if (codeFor(row.seed) === code) return null;
      await log({
        accountId: row.accountId,
        personaId,
        method: 'mfa',
        outcome: 'failure',
        reason: 'wrong-code',
      });
      return { error: { code: 'That simulated code is not correct.' } };
    }
    const code = parseInput(RecoveryCodeInputSchema, proof.recoveryCode).toUpperCase();
    const match = row.recoveryCodes.find((entry) => entry.code === code && !entry.usedAt);
    if (!match) {
      await log({
        accountId: row.accountId,
        personaId,
        method: 'mfa',
        outcome: 'failure',
        reason: 'bad-recovery',
      });
      return { error: { recoveryCode: 'That recovery code is not valid.' } };
    }
    const at = now();
    await mfaTable().put({
      ...row,
      recoveryCodes: row.recoveryCodes.map((entry) =>
        entry.code === code ? { ...entry, usedAt: at } : entry
      ),
    });
    return null;
  }

  /** A live (known, unused, unexpired) challenge token, or an inline error. */
  async function loadChallenge(
    challengeId: string
  ): Promise<{ token: SaasToken & { accountId: string } } | ProofIssues> {
    const invalid = { error: { form: 'This verification step is not valid. Sign in again.' } };
    if (typeof challengeId !== 'string' || !challengeId || challengeId.length > 256) {
      return invalid;
    }
    const token = await tokens().get(challengeId);
    if (token?.kind !== 'mfa-challenge' || !token.accountId) return invalid;
    if (token.consumedAt) {
      return { error: { form: 'This verification step was already used. Sign in again.' } };
    }
    if (Date.parse(token.expiresAt) <= nowMs()) {
      return { error: { form: 'This verification step has expired. Sign in again.' } };
    }
    return { token: { ...token, accountId: token.accountId } };
  }

  return {
    /** Current 6-digit code for the panel (simulation only). */
    currentCode(seedOrAccountSeed?: string): string {
      if (seedOrAccountSeed) return codeFor(seedOrAccountSeed);
      throw new ValidationError({ form: 'Pass the MFA seed from enroll or status.' });
    },

    /** Panel helper: code + seconds left in this window for a seed. */
    authenticatorPanel(seed: string): {
      code: string;
      secondsRemaining: number;
      windowMs: number;
      simulated: true;
    } {
      return {
        code: codeFor(seed),
        secondsRemaining: simulatedTotpSecondsRemaining(nowMs()),
        windowMs: MFA_WINDOW_MS,
        simulated: true,
      };
    },

    async status(accountId?: string): Promise<'none' | 'pending' | 'active'> {
      const id = accountId ?? (await requireAccount()).id;
      const row = await findMfa(id);
      if (!row) return 'none';
      return row.status;
    },

    async get(accountId?: string): Promise<SaasMfa | undefined> {
      const id = accountId ?? (await requireAccount()).id;
      return findMfa(id);
    },

    async isActive(accountId?: string): Promise<boolean> {
      return (await this.status(accountId)) === 'active';
    },

    /**
     * Start enrollment: stores a pending MFA row with a fresh seed and recovery
     * codes. Returns the current simulated code so the UI can confirm.
     */
    async enroll() {
      const account = await requireAccount();
      return environment.run('mfa.enroll', () =>
        db.transaction('rw', [MFA], async () => {
          const existing = await findMfa(account.id);
          if (existing?.status === 'active') {
            throw new ValidationError({ form: 'MFA is already active on this account.' });
          }
          if (existing) await mfaTable().delete(existing.id);
          const seed = mintSeed(account.id, now());
          const row = SaasMfaSchema.parse({
            id: createRuntimeId('mfa'),
            accountId: account.id,
            method: 'totp-sim',
            seed,
            status: 'pending',
            enrolledAt: now(),
            recoveryCodes: mintRecoveryCodes(seed, recoveryCount),
          });
          await mfaTable().add(row);
          return {
            mfa: row,
            /** Show in the simulated authenticator — not a real TOTP secret. */
            currentCode: codeFor(seed),
            recoveryCodes: row.recoveryCodes.map((entry) => entry.code),
            panel: {
              code: codeFor(seed),
              secondsRemaining: simulatedTotpSecondsRemaining(nowMs()),
              windowMs: MFA_WINDOW_MS,
              simulated: true as const,
            },
          };
        })
      );
    },

    /** Activate pending MFA after the person enters the current simulated code. */
    async confirmEnroll(code: string) {
      const account = await requireAccount();
      const parsed = parseInput(MfaCodeSchema, code);
      return environment.run('mfa.confirmEnroll', () =>
        db.transaction('rw', [MFA, LOG], async () => {
          const row = await findMfa(account.id);
          if (!row || row.status !== 'pending') {
            throw new ValidationError({ form: 'Start MFA enrollment first.' });
          }
          if (codeFor(row.seed) !== parsed) {
            throw new ValidationError({ code: 'That simulated code is not correct.' });
          }
          const active: SaasMfa = { ...row, status: 'active', enrolledAt: now() };
          await mfaTable().put(active);
          await log({
            accountId: account.id,
            personaId: account.personaId,
            method: 'mfa',
            outcome: 'success',
            reason: 'enrolled',
          });
          return active;
        })
      );
    },

    /**
     * Password sign-in that respects MFA. When MFA is active the session is
     * NOT opened until {@link completeChallenge} succeeds.
     */
    async signInWithPassword(input: PasswordSignInInput): Promise<MfaSignInResult> {
      const data = parseInput(PasswordSignInSchema, input);
      const outcome = await environment.run('mfa.signInWithPassword', () =>
        db.transaction(
          'rw',
          [ACCOUNTS, MFA, LOG, TOKENS],
          async (): Promise<MfaSignInResult | ProofIssues> => {
            // Same attempt counter, lockout and verified-email rule as auth.signIn.
            const checked = await checkPasswordAttempt(
              {
                putAccount: (row) => accounts().put(row),
                logFailure: (account, reason) =>
                  log({
                    accountId: account?.id ?? null,
                    personaId: account?.personaId ?? null,
                    method: 'password',
                    outcome: 'failure',
                    reason,
                  }),
                lockoutThreshold: options.lockoutThreshold,
                requireVerifiedEmail: options.requireVerifiedEmail,
              },
              await findAccountByEmail(data.email),
              data.password
            );
            if (!checked.ok) return { error: checked.issues };
            const account = checked.account;
            const mfa = await findMfa(account.id);
            if (mfa?.status === 'active') {
              const token = createMfaChallengeToken(
                account,
                'password',
                clock.now(),
                challengeTtlMs
              );
              await tokens().add(token);
              await log({
                accountId: account.id,
                personaId: account.personaId,
                method: 'password',
                outcome: 'success',
                reason: 'mfa-required',
              });
              return {
                status: 'mfa-required',
                account,
                challenge: { id: token.id, expiresAt: token.expiresAt },
              };
            }
            const signedIn = { ...account, failedAttempts: 0, lastSignInAt: now() };
            await accounts().put(signedIn);
            await log({
              accountId: account.id,
              personaId: account.personaId,
              method: 'password',
              outcome: 'success',
              reason: null,
            });
            return { status: 'signed-in', account: signedIn };
          }
        )
      );
      if ('error' in outcome) throw new ValidationError(outcome.error);
      if (outcome.status === 'signed-in') {
        await session.signIn(outcome.account.personaId);
      }
      return outcome;
    },

    /**
     * What the MFA screen may show for a challenge: the account email and the
     * current simulated code of THAT account only. Read-only. Unknown, used
     * or expired challenges return `null` (the screen shows no code).
     */
    async describeChallenge(challengeId: string): Promise<MfaChallengeView | null> {
      const loaded = await loadChallenge(challengeId);
      if ('error' in loaded) return null;
      const row = await findMfa(loaded.token.accountId);
      if (row?.status !== 'active') return null;
      return {
        email: loaded.token.email,
        expiresAt: loaded.token.expiresAt,
        code: codeFor(row.seed),
        secondsRemaining: simulatedTotpSecondsRemaining(nowMs()),
        simulated: true,
      };
    },

    /**
     * Finish a password, magic-link or OAuth sign-in that required MFA.
     * `challengeId` is the single-use challenge the first factor returned
     * (`result.challenge.id`); the account comes from that token, never from
     * the caller. Unknown, used or expired challenges are refused. A wrong
     * code is logged and the challenge stays usable until it expires; the
     * session opens only after a valid code or recovery code.
     */
    async completeChallenge(
      challengeId: string,
      proof: { code: string } | { recoveryCode: string }
    ): Promise<SaasAccount> {
      if ('code' in proof) parseInput(MfaCodeSchema, proof.code);
      else parseInput(RecoveryCodeInputSchema, proof.recoveryCode);
      const outcome = await environment.run('mfa.completeChallenge', () =>
        db.transaction(
          'rw',
          [ACCOUNTS, MFA, LOG, TOKENS],
          async (): Promise<{ account: SaasAccount } | ProofIssues> => {
            const loaded = await loadChallenge(challengeId);
            if ('error' in loaded) return loaded;
            const { token } = loaded;
            const row = await accounts().get(token.accountId);
            if (!row) return { error: { form: 'This account no longer exists.' } };
            if (row.status !== 'active') {
              return { error: { form: 'This account is not available. Sign in again.' } };
            }
            const mfa = await findMfa(row.id);
            if (mfa?.status !== 'active') {
              return { error: { form: 'MFA is not required for this account. Sign in again.' } };
            }
            const failed = await checkProof(mfa, proof, row.personaId);
            if (failed) return failed;
            await tokens().put({ ...token, consumedAt: now() });
            const signedIn = { ...row, failedAttempts: 0, lastSignInAt: now() };
            await accounts().put(signedIn);
            await log({
              accountId: row.id,
              personaId: row.personaId,
              method: 'mfa',
              outcome: 'success',
              reason: 'code' in proof ? 'totp-sim' : 'recovery',
            });
            return { account: signedIn };
          }
        )
      );
      if ('error' in outcome) throw new ValidationError(outcome.error);
      await session.signIn(outcome.account.personaId);
      return outcome.account;
    },

    /** Disable active MFA after a valid simulated code or recovery code. */
    async disable(proof: { code: string } | { recoveryCode: string }) {
      const account = await requireAccount();
      if ('code' in proof) parseInput(MfaCodeSchema, proof.code);
      else parseInput(RecoveryCodeInputSchema, proof.recoveryCode);
      const outcome = await environment.run('mfa.disable', () =>
        db.transaction('rw', [MFA, LOG], async (): Promise<ProofIssues | null> => {
          const mfa = await findMfa(account.id);
          if (!mfa || mfa.status !== 'active') {
            return { error: { form: 'MFA is not active on this account.' } };
          }
          const failed = await checkProof(mfa, proof, account.personaId);
          if (failed) return failed;
          await mfaTable().delete(mfa.id);
          await log({
            accountId: account.id,
            personaId: account.personaId,
            method: 'mfa',
            outcome: 'success',
            reason: 'disabled',
          });
          return null;
        })
      );
      if (outcome) throw new ValidationError(outcome.error);
    },
  };
}

export type MfaServices = ReturnType<typeof createMfaServices>;
