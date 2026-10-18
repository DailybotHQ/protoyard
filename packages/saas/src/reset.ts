import { createRuntimeId, isExampleEmail, parseInput, ValidationError } from '@protoyard/core';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import { z } from 'zod';
import { createInbox } from './inbox.ts';
import type { SaasAccount, SaasInboxMessage, SaasToken } from './schema.ts';

const ACCOUNTS = 'saas_accounts';
const TOKENS = 'saas_tokens';
const INBOX = 'saas_inbox';

interface TableLike<T> {
  get(id: string): Promise<T | undefined>;
  add(row: T): Promise<unknown>;
  put(row: T): Promise<unknown>;
  where(index: string): { equals(value: string): { first(): Promise<T | undefined> } };
}
interface DatabaseLike {
  table<T>(name: string): TableLike<T>;
  transaction<R>(mode: 'rw', tables: string[], scope: () => Promise<R>): Promise<R>;
}

const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email'))
  .refine(isExampleEmail, 'Use a fictional address at example.com');

export const RequestPasswordResetSchema = z.object({ email: EmailSchema });
export type RequestPasswordResetInput = z.input<typeof RequestPasswordResetSchema>;

export const ConsumePasswordResetSchema = z.object({
  tokenId: z.string().min(1),
  password: z.string().min(8, 'Use at least 8 characters').max(128),
});
export type ConsumePasswordResetInput = z.input<typeof ConsumePasswordResetSchema>;

export interface PasswordResetOptions {
  ttlMinutes?: number;
  href?: (tokenId: string) => string;
  productName?: string;
}

/** Simulated password reset through the in-app inbox. This is not security or email delivery. */
export function createPasswordResetServices(
  runtime: ProtoyardRuntime,
  options: PasswordResetOptions = {}
) {
  const db = runtime.db as unknown as DatabaseLike;
  const inbox = createInbox(runtime);
  const ttlMs = (options.ttlMinutes ?? 30) * 60_000;
  const href =
    options.href ?? ((tokenId: string) => `#/auth/reset?token=${encodeURIComponent(tokenId)}`);
  const product = options.productName ?? 'the prototype';
  const accounts = () => db.table<SaasAccount>(ACCOUNTS);
  const tokens = () => db.table<SaasToken>(TOKENS);

  return {
    /** Unknown addresses produce the same response as known ones and write nothing. */
    async request(input: RequestPasswordResetInput): Promise<{
      delivered: boolean;
      token: SaasToken | null;
      message: SaasInboxMessage | null;
    }> {
      const data = parseInput(RequestPasswordResetSchema, input);
      return runtime.environment.run('passwordReset.request', () =>
        db.transaction('rw', [ACCOUNTS, TOKENS, INBOX], async () => {
          const account = await accounts().where('email').equals(data.email).first();
          if (!account || account.status === 'disabled') {
            return { delivered: false, token: null, message: null };
          }
          const at = runtime.clock.now();
          const token: SaasToken = {
            id: createRuntimeId('reset'),
            kind: 'password-reset',
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
            kind: 'password-reset',
            subject: `Reset your password for ${product}`,
            body: `Use the button below to choose a new simulated password for ${product}. This is a simulated message: nothing was emailed.`,
            action: { label: 'Reset password', href: href(token.id) },
          });
          return { delivered: true, token, message };
        })
      );
    },

    /** Consume one unexpired reset token and set the account's simulated password. */
    async consume(input: ConsumePasswordResetInput): Promise<SaasAccount> {
      const data = parseInput(ConsumePasswordResetSchema, input);
      return runtime.environment.run('passwordReset.consume', () =>
        db.transaction('rw', [ACCOUNTS, TOKENS], async () => {
          const token = await tokens().get(data.tokenId);
          if (token?.kind !== 'password-reset' || !token.accountId) {
            throw new ValidationError({ form: 'This password reset link is not valid.' });
          }
          if (token.consumedAt) {
            throw new ValidationError({ form: 'This password reset link was already used.' });
          }
          if (Date.parse(token.expiresAt) <= runtime.clock.now().getTime()) {
            throw new ValidationError({
              form: 'This password reset link has expired. Request a new one.',
            });
          }
          const account = await accounts().get(token.accountId);
          if (!account || account.status === 'disabled') {
            throw new ValidationError({ form: 'This account is not available.' });
          }
          const at = runtime.clock.now().toISOString();
          const updated = {
            ...account,
            simulatedPassword: data.password,
            failedAttempts: 0,
            status: 'active' as const,
          };
          await tokens().put({ ...token, consumedAt: at });
          await accounts().put(updated);
          return updated;
        })
      );
    },
  };
}

export type PasswordResetServices = ReturnType<typeof createPasswordResetServices>;
