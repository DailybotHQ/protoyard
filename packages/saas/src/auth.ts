import { createRuntimeId, isExampleEmail, parseInput, ValidationError } from '@protoyard/core';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import { z } from 'zod';
import { createInbox } from './inbox.ts';
import type { SaasAccount, SaasSessionLog, SaasToken } from './schema.ts';

/**
 * Simulated email/password authentication (ADR-018). UX simulation, NOT
 * security: the "password" is stored as typed in IndexedDB (no hashing, on
 * purpose, so nobody mistakes this for real credential storage) and any
 * script on the same origin can read it or sign anyone in. Use fictional
 * `@example.com` addresses and throwaway passwords only.
 *
 * Every mutation runs through `environment.run('auth.<action>')` (DevTools
 * latency, offline and failure toggles apply) and writes in one transaction.
 * Sign-in failures are recorded (failed attempts, lockout, sign-in log) and
 * then reported as a `ValidationError` so forms show them inline.
 */

export interface AuthOptions {
  /** Failed password attempts before the account locks (default 5). */
  lockoutThreshold?: number;
  /** Refuse sign-in until the email is verified (default true). */
  requireVerifiedEmail?: boolean;
  /** Sign-up also creates a workspace with the new person as owner (default true). */
  createOrganization?: boolean;
  /** Role of the new person in that workspace (default `owner`). */
  ownerRole?: string;
  /** Hours a verification link stays valid (default 24, simulated clock). */
  verifyTtlHours?: number;
  /** In-app route that consumes a verification token (default `#/auth/verify?token=…`). */
  verifyHref?: (tokenId: string) => string;
  /** Product name used in messages (default "the prototype"). */
  productName?: string;
}

const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email'))
  .refine(isExampleEmail, 'Use a fictional address at example.com');

export const SignUpSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120, 'Keep it under 120 characters'),
  email: EmailSchema,
  password: z.string().min(8, 'Use at least 8 characters').max(128, 'Keep it under 128 characters'),
  organizationName: z.string().trim().min(2, 'Name your workspace').max(120).optional(),
});
export type SignUpInput = z.input<typeof SignUpSchema>;

export const SignInSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Enter your password'),
});
export type SignInInput = z.input<typeof SignInSchema>;

const ACCOUNTS = 'saas_accounts';
const TOKENS = 'saas_tokens';
const LOG = 'saas_sessions_log';
const INBOX = 'saas_inbox';

/** The Dexie surface the auth services use (the default storage adapter). */
interface TableLike<T> {
  get(id: string): Promise<T | undefined>;
  put(row: T): Promise<unknown>;
  add(row: T): Promise<unknown>;
  where(index: string): { equals(value: string): { first(): Promise<T | undefined> } };
}
interface DatabaseLike {
  table<T>(name: string): TableLike<T>;
  transaction<R>(mode: 'rw', tables: string[], scope: () => Promise<R>): Promise<R>;
}

type SignInOutcome =
  | { ok: true; account: SaasAccount }
  | { ok: false; issues: Record<string, string> };

export function createAuthServices(runtime: ProtoyardRuntime, options: AuthOptions = {}) {
  const db = runtime.db as unknown as DatabaseLike;
  const { session, environment, clock, identity } = runtime;
  const inbox = createInbox(runtime);
  const lockoutThreshold = options.lockoutThreshold ?? 5;
  const requireVerified = options.requireVerifiedEmail ?? true;
  const verifyTtlMs = (options.verifyTtlHours ?? 24) * 3_600_000;
  const verifyHref =
    options.verifyHref ??
    ((tokenId: string) => `#/auth/verify?token=${encodeURIComponent(tokenId)}`);
  const product = options.productName ?? 'the prototype';
  const now = () => clock.now().toISOString();

  const accounts = () => db.table<SaasAccount>(ACCOUNTS);
  const tokens = () => db.table<SaasToken>(TOKENS);
  const findByEmail = (email: string) => accounts().where('email').equals(email).first();

  const log = (entry: Omit<SaasSessionLog, 'id' | 'at' | 'provider'>) =>
    db.table<SaasSessionLog>(LOG).add({
      id: createRuntimeId('signin'),
      at: now(),
      provider: null,
      ...entry,
    });

  /** Creates a verify-email token and its inbox message (inside the caller's transaction). */
  const sendVerification = (account: SaasAccount, name: string) => {
    const at = clock.now();
    const token: SaasToken = {
      id: createRuntimeId('verify'),
      kind: 'verify-email',
      email: account.email,
      accountId: account.id,
      payload: {},
      createdAt: at.toISOString(),
      expiresAt: new Date(at.getTime() + verifyTtlMs).toISOString(),
      consumedAt: null,
    };
    // A Dexie promise chain (no extra async layer) keeps the caller's transaction zone.
    return tokens()
      .add(token)
      .then(() =>
        inbox.write({
          recipient: account.email,
          personaId: account.personaId,
          kind: 'verify-email',
          subject: `Confirm your email for ${product}`,
          body: `Hi ${name}, confirm your email address to finish creating your account. This is a simulated message: nothing was sent.`,
          action: { label: 'Confirm email', href: verifyHref(token.id) },
        })
      )
      .then(() => token);
  };

  return {
    /**
     * Creates a persona, its account, optionally a workspace, and a
     * verify-email message, all in one transaction. Signs in right away only
     * when verification is not required.
     */
    async signUp(input: SignUpInput) {
      const data = parseInput(SignUpSchema, input);
      const result = await environment.run('auth.signUp', () =>
        identity.write(
          async (ops) => {
            if (await findByEmail(data.email)) {
              throw new ValidationError({ email: 'An account with this email already exists' });
            }
            const persona = await ops.putPersona({
              name: data.name,
              email: data.email,
              onboardingComplete: false,
            });
            if (options.createOrganization !== false) {
              const organization = await ops.putOrganization({
                name: data.organizationName ?? `${data.name}'s workspace`,
              });
              await ops.putMembership({
                personaId: persona.id,
                organizationId: organization.id,
                role: options.ownerRole ?? 'owner',
              });
            }
            const account: SaasAccount = {
              id: createRuntimeId('acct'),
              personaId: persona.id,
              email: data.email,
              emailVerified: false,
              simulatedPassword: data.password,
              providers: [],
              status: 'active',
              failedAttempts: 0,
              createdAt: now(),
              lastSignInAt: null,
            };
            await accounts().add(account);
            await sendVerification(account, data.name);
            await log({
              accountId: account.id,
              personaId: persona.id,
              method: 'sign-up',
              outcome: 'success',
              reason: null,
            });
            return account;
          },
          { tables: [ACCOUNTS, TOKENS, LOG, INBOX] }
        )
      );
      if (!requireVerified) await session.signIn(result.personaId);
      return { account: result, needsVerification: requireVerified };
    },

    /** Consumes a verify-email token from the simulated inbox. */
    async verifyEmail(tokenId: string) {
      return environment.run('auth.verifyEmail', () =>
        db.transaction('rw', [ACCOUNTS, TOKENS], async () => {
          const token = await tokens().get(tokenId);
          if (token?.kind !== 'verify-email' || !token.accountId) {
            throw new ValidationError({ form: 'This confirmation link is not valid.' });
          }
          if (token.consumedAt) {
            throw new ValidationError({ form: 'This confirmation link was already used.' });
          }
          if (Date.parse(token.expiresAt) <= clock.now().getTime()) {
            throw new ValidationError({
              form: 'This confirmation link has expired. Ask for a new one.',
            });
          }
          const account = await accounts().get(token.accountId);
          if (!account) throw new ValidationError({ form: 'This account no longer exists.' });
          const at = now();
          await tokens().put({ ...token, consumedAt: at });
          const verified = { ...account, emailVerified: true };
          await accounts().put(verified);
          return verified;
        })
      );
    },

    /** Sends a fresh confirmation message. Unknown or verified emails are refused inline. */
    async resendVerification(email: string) {
      const address = parseInput(z.object({ email: EmailSchema }), { email }).email;
      return environment.run('auth.resendVerification', () =>
        db.transaction('rw', [ACCOUNTS, TOKENS, INBOX], async () => {
          const account = await findByEmail(address);
          if (!account) throw new ValidationError({ email: 'No account uses this email' });
          if (account.emailVerified) {
            throw new ValidationError({ email: 'This email is already confirmed' });
          }
          const persona = session.personas().find((p) => p.id === account.personaId);
          return sendVerification(account, persona?.name ?? address);
        })
      );
    },

    /**
     * Checks the simulated password and signs in. Wrong passwords count
     * toward the lockout; every attempt is logged. Failures throw a
     * `ValidationError` AFTER the attempt was recorded.
     */
    async signIn(input: SignInInput) {
      const data = parseInput(SignInSchema, input);
      const outcome = await environment.run(
        'auth.signIn',
        (): Promise<SignInOutcome> =>
          db.transaction('rw', [ACCOUNTS, LOG], async () => {
            const account = await findByEmail(data.email);
            const fail = async (reason: string, issues: Record<string, string>) => {
              await log({
                accountId: account?.id ?? null,
                personaId: account?.personaId ?? null,
                method: 'password',
                outcome: 'failure',
                reason,
              });
              return { ok: false as const, issues };
            };
            if (!account) return fail('unknown-email', { email: 'No account uses this email' });
            if (account.status !== 'active') {
              return fail(account.status, {
                form:
                  account.status === 'locked'
                    ? 'This account is locked after too many attempts. Reset your password to unlock it.'
                    : 'This account is disabled.',
              });
            }
            if (account.simulatedPassword !== data.password) {
              const failedAttempts = account.failedAttempts + 1;
              const locked = failedAttempts >= lockoutThreshold;
              await accounts().put({
                ...account,
                failedAttempts,
                status: locked ? 'locked' : 'active',
              });
              const left = lockoutThreshold - failedAttempts;
              return fail(locked ? 'locked' : 'wrong-password', {
                password: locked
                  ? 'Incorrect password. The account is now locked.'
                  : `Incorrect password. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`,
              });
            }
            if (requireVerified && !account.emailVerified) {
              return fail('unverified', {
                form: 'Confirm your email first. Check your simulated inbox.',
              });
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
            return { ok: true as const, account: signedIn };
          })
      );
      if (!outcome.ok) throw new ValidationError(outcome.issues);
      await session.signIn(outcome.account.personaId);
      return outcome.account;
    },

    /** Records the sign-out and ends the simulated session. */
    async signOut() {
      const personaId = session.principal()?.persona.id ?? null;
      await environment.run('auth.signOut', () =>
        db.transaction('rw', [LOG], () =>
          log({ accountId: null, personaId, method: 'sign-out', outcome: 'success', reason: null })
        )
      );
      await session.signOut();
    },

    /** The account for a persona (default: the signed-in one). Read-only. */
    async account(personaId: string | undefined = session.principal()?.persona.id) {
      if (!personaId) return undefined;
      return db.table<SaasAccount>(ACCOUNTS).where('personaId').equals(personaId).first();
    },
  };
}

export type AuthServices = ReturnType<typeof createAuthServices>;
