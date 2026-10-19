import { createRuntimeId, isExampleEmail, parseInput, ValidationError } from '@protoyard/core';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import { z } from 'zod';
import { createInbox } from './inbox.ts';
import { createMfaChallengeToken, createMfaServices, type MfaChallenge } from './mfa.ts';
import type { SaasAccount, SaasInboxMessage, SaasSessionLog, SaasToken } from './schema.ts';

/**
 * Simulated magic-link sign-in. Issues a single-use token, delivers it to the
 * in-app inbox, and consumes it against the simulated clock. MFA-active
 * accounts still require a second step via {@link createMfaServices}.
 *
 * Simulation only — not email delivery or security.
 */

const ACCOUNTS = 'saas_accounts';
const TOKENS = 'saas_tokens';
const LOG = 'saas_sessions_log';
const INBOX = 'saas_inbox';
const MFA = 'saas_mfa';

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

export interface MagicLinkOptions {
  /** Minutes until the link expires on the simulated clock (default 15). */
  ttlMinutes?: number;
  /** Build the in-app action href (default `#/auth/magic?token=…`). */
  href?: (tokenId: string) => string;
  /** Minutes the MFA challenge minted for MFA-active accounts stays valid (default 10). */
  challengeTtlMinutes?: number;
  productName?: string;
}

const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email'))
  .refine(isExampleEmail, 'Use a fictional address at example.com');

export const IssueMagicLinkSchema = z.object({
  email: EmailSchema,
});
export type IssueMagicLinkInput = z.input<typeof IssueMagicLinkSchema>;

export type MagicLinkConsumeResult =
  | { status: 'signed-in'; account: SaasAccount }
  | { status: 'mfa-required'; account: SaasAccount; challenge: MfaChallenge };

/**
 * Magic-link issue / consume bound to a prototype runtime.
 *
 * ```ts
 * const magic = createMagicLinkServices(runtime);
 * const { token } = await magic.issue({ email: 'ada@example.com' });
 * await magic.consume(token.id);
 * ```
 */
export function createMagicLinkServices(runtime: ProtoyardRuntime, options: MagicLinkOptions = {}) {
  const db = runtime.db as unknown as DatabaseLike;
  const { session, environment, clock } = runtime;
  const inbox = createInbox(runtime);
  const mfa = createMfaServices(runtime);
  const ttlMs = (options.ttlMinutes ?? 15) * 60_000;
  const href =
    options.href ?? ((tokenId: string) => `#/auth/magic?token=${encodeURIComponent(tokenId)}`);
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

  return {
    /**
     * Create a magic-link token and deliver it to the simulated inbox.
     * Unknown emails still look successful to the caller (no account oracle)
     * but write nothing — same pattern as many real passwordless UIs.
     */
    async issue(input: IssueMagicLinkInput): Promise<{
      delivered: boolean;
      token: SaasToken | null;
      message: SaasInboxMessage | null;
    }> {
      const data = parseInput(IssueMagicLinkSchema, input);
      return environment.run('magicLink.issue', () =>
        db.transaction('rw', [ACCOUNTS, TOKENS, INBOX], async () => {
          const account = await findByEmail(data.email);
          if (!account || account.status !== 'active') {
            return { delivered: false, token: null, message: null };
          }
          const at = clock.now();
          const token: SaasToken = {
            id: createRuntimeId('magic'),
            kind: 'magic-link',
            email: account.email,
            accountId: account.id,
            payload: {},
            createdAt: at.toISOString(),
            expiresAt: new Date(at.getTime() + ttlMs).toISOString(),
            consumedAt: null,
          };
          await tokens().add(token);
          const message = await inbox.write({
            recipient: account.email,
            personaId: account.personaId,
            kind: 'magic-link',
            subject: `Sign in to ${product}`,
            body: `Use the button below to finish signing in to ${product}. This is a simulated message: nothing was emailed.`,
            action: { label: 'Sign in', href: href(token.id) },
          });
          return { delivered: true, token, message };
        })
      );
    },

    /**
     * Consume a magic-link token (single-use, clock expiry). When MFA is
     * active, returns `mfa-required` with a single-use `challenge` for
     * `mfa.completeChallenge` and does not open the session.
     */
    async consume(tokenId: string): Promise<MagicLinkConsumeResult> {
      const result = await environment.run('magicLink.consume', () =>
        db.transaction('rw', [ACCOUNTS, TOKENS, LOG, MFA], async () => {
          const token = await tokens().get(tokenId);
          if (token?.kind !== 'magic-link' || !token.accountId) {
            throw new ValidationError({ form: 'This sign-in link is not valid.' });
          }
          if (token.consumedAt) {
            throw new ValidationError({ form: 'This sign-in link was already used.' });
          }
          if (Date.parse(token.expiresAt) <= clock.now().getTime()) {
            throw new ValidationError({
              form: 'This sign-in link has expired. Request a new one.',
            });
          }
          const account = await accounts().get(token.accountId);
          if (!account || account.status !== 'active') {
            throw new ValidationError({ form: 'This account is not available.' });
          }
          const at = now();
          await tokens().put({ ...token, consumedAt: at });

          const mfaActive = await mfa.isActive(account.id);
          if (mfaActive) {
            const challenge = createMfaChallengeToken(
              account,
              'magic-link',
              clock.now(),
              (options.challengeTtlMinutes ?? 10) * 60_000
            );
            await tokens().add(challenge);
            await log({
              accountId: account.id,
              personaId: account.personaId,
              method: 'magic-link',
              outcome: 'success',
              reason: 'mfa-required',
            });
            return {
              status: 'mfa-required' as const,
              account,
              challenge: { id: challenge.id, expiresAt: challenge.expiresAt },
            };
          }

          const signedIn = { ...account, failedAttempts: 0, lastSignInAt: at };
          await accounts().put(signedIn);
          await log({
            accountId: account.id,
            personaId: account.personaId,
            method: 'magic-link',
            outcome: 'success',
            reason: null,
          });
          return { status: 'signed-in' as const, account: signedIn };
        })
      );

      if (result.status === 'signed-in') {
        await session.signIn(result.account.personaId);
      }
      return result;
    },
  };
}

export type MagicLinkServices = ReturnType<typeof createMagicLinkServices>;
