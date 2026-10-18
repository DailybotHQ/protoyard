import {
  createRuntimeId,
  hashString,
  isExampleEmail,
  parseInput,
  ValidationError,
} from '@protoyard/core';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import { z } from 'zod';
import type { SaasAccount, SaasMfa, SaasSessionLog } from './schema.ts';
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

export interface MfaOptions {
  /** How many one-time recovery codes to mint at enroll (default 8). */
  recoveryCodeCount?: number;
  productName?: string;
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
  | { status: 'mfa-required'; account: SaasAccount };

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
 *   await mfa.completeChallenge(result.account.id, { code: mfa.currentCode() });
 * }
 * ```
 */
export function createMfaServices(runtime: ProtoyardRuntime, options: MfaOptions = {}) {
  const db = runtime.db as unknown as DatabaseLike;
  const { session, environment, clock } = runtime;
  const recoveryCount = options.recoveryCodeCount ?? 8;
  const now = () => clock.now().toISOString();
  const nowMs = () => clock.now().getTime();

  const accounts = () => db.table<SaasAccount>(ACCOUNTS);
  const mfaTable = () => db.table<SaasMfa>(MFA);
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

  async function assertActiveCode(row: SaasMfa, code: string): Promise<void> {
    if (row.status !== 'active') {
      throw new ValidationError({ form: 'MFA is not active on this account.' });
    }
    if (codeFor(row.seed) !== code) {
      await log({
        accountId: row.accountId,
        personaId: null,
        method: 'mfa',
        outcome: 'failure',
        reason: 'wrong-code',
      });
      throw new ValidationError({ code: 'That simulated code is not correct.' });
    }
  }

  async function consumeRecovery(row: SaasMfa, raw: string): Promise<SaasMfa> {
    const code = parseInput(RecoveryCodeInputSchema, raw).toUpperCase();
    const match = row.recoveryCodes.find((entry) => entry.code === code && !entry.usedAt);
    if (!match) {
      await log({
        accountId: row.accountId,
        personaId: null,
        method: 'mfa',
        outcome: 'failure',
        reason: 'bad-recovery',
      });
      throw new ValidationError({ recoveryCode: 'That recovery code is not valid.' });
    }
    const at = now();
    const next: SaasMfa = {
      ...row,
      recoveryCodes: row.recoveryCodes.map((entry) =>
        entry.code === code ? { ...entry, usedAt: at } : entry
      ),
    };
    await mfaTable().put(next);
    return next;
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
          [ACCOUNTS, MFA, LOG],
          async (): Promise<MfaSignInResult | { error: Record<string, string> }> => {
            const account = await findAccountByEmail(data.email);
            if (!account) {
              await log({
                accountId: null,
                personaId: null,
                method: 'password',
                outcome: 'failure',
                reason: 'unknown-email',
              });
              return { error: { email: 'No account uses this email' } };
            }
            if (account.status !== 'active') {
              await log({
                accountId: account.id,
                personaId: account.personaId,
                method: 'password',
                outcome: 'failure',
                reason: account.status,
              });
              return {
                error: {
                  form:
                    account.status === 'locked'
                      ? 'This account is locked after too many attempts.'
                      : 'This account is disabled.',
                },
              };
            }
            if (account.simulatedPassword !== data.password) {
              await log({
                accountId: account.id,
                personaId: account.personaId,
                method: 'password',
                outcome: 'failure',
                reason: 'wrong-password',
              });
              return { error: { password: 'Incorrect password.' } };
            }
            if (!account.emailVerified) {
              await log({
                accountId: account.id,
                personaId: account.personaId,
                method: 'password',
                outcome: 'failure',
                reason: 'unverified',
              });
              return { error: { form: 'Confirm your email first. Check your simulated inbox.' } };
            }
            const mfa = await findMfa(account.id);
            if (mfa?.status === 'active') {
              await log({
                accountId: account.id,
                personaId: account.personaId,
                method: 'password',
                outcome: 'success',
                reason: 'mfa-required',
              });
              return { status: 'mfa-required', account };
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
     * Finish a password or magic-link sign-in that required MFA.
     * Does not open the session until the code (or recovery code) is valid.
     */
    async completeChallenge(
      accountId: string,
      proof: { code: string } | { recoveryCode: string }
    ): Promise<SaasAccount> {
      const account = await environment.run('mfa.completeChallenge', () =>
        db.transaction('rw', [ACCOUNTS, MFA, LOG], async () => {
          const row = await accounts().get(accountId);
          if (!row) throw new ValidationError({ form: 'This account no longer exists.' });
          const mfa = await findMfa(accountId);
          if (!mfa || mfa.status !== 'active') {
            throw new ValidationError({ form: 'MFA is not required for this account.' });
          }
          if ('code' in proof) {
            const code = parseInput(MfaCodeSchema, proof.code);
            await assertActiveCode(mfa, code);
          } else {
            await consumeRecovery(mfa, proof.recoveryCode);
          }
          const signedIn = { ...row, failedAttempts: 0, lastSignInAt: now() };
          await accounts().put(signedIn);
          await log({
            accountId: row.id,
            personaId: row.personaId,
            method: 'mfa',
            outcome: 'success',
            reason: 'code' in proof ? 'totp-sim' : 'recovery',
          });
          return signedIn;
        })
      );
      await session.signIn(account.personaId);
      return account;
    },

    /** Disable active MFA after a valid simulated code or recovery code. */
    async disable(proof: { code: string } | { recoveryCode: string }) {
      const account = await requireAccount();
      return environment.run('mfa.disable', () =>
        db.transaction('rw', [MFA, LOG], async () => {
          const mfa = await findMfa(account.id);
          if (!mfa || mfa.status !== 'active') {
            throw new ValidationError({ form: 'MFA is not active on this account.' });
          }
          if ('code' in proof) {
            await assertActiveCode(mfa, parseInput(MfaCodeSchema, proof.code));
          } else {
            await consumeRecovery(mfa, proof.recoveryCode);
          }
          await mfaTable().delete(mfa.id);
          await log({
            accountId: account.id,
            personaId: account.personaId,
            method: 'mfa',
            outcome: 'success',
            reason: 'disabled',
          });
        })
      );
    },
  };
}

export type MfaServices = ReturnType<typeof createMfaServices>;
