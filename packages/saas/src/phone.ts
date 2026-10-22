import { createRuntimeId, hashString, parseInput, ValidationError } from '@protoyard/core';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import { z } from 'zod';
import type { SaasSessionLog, SaasToken } from './schema.ts';

/** A phone verification challenge lasts ten simulated minutes by default. */
export const PHONE_CODE_TTL_MS = 10 * 60_000;
/** A new simulated SMS can be requested after thirty simulated seconds. */
export const PHONE_RESEND_COOLDOWN_MS = 30_000;
export const PHONE_CODE_ATTEMPT_LIMIT = 5;
export const PHONE_CODE_TOAST_ID = 'saas-phone-otp-code';

const PHONE_TOKEN_KIND = 'phone-otp';
// SaasToken retains its email field for compatibility with the shared token table.
const PHONE_CHALLENGE_EMAIL = 'phone-otp@example.com';
const TOKENS = 'saas_tokens';
const LOG = 'saas_sessions_log';
const PHONE_RE = /^\+[1-9]\d{6,14}$/;

export const PhoneNumberSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s().-]/g, ''))
  .transform((value) => (value.startsWith('+') ? value : `+${value}`))
  .refine((value) => PHONE_RE.test(value), 'Enter a phone number with 7 to 15 digits.');

export const PhoneSignInInputSchema = z.object({
  phone: PhoneNumberSchema,
  name: z.string().trim().min(2, 'Enter your name').max(120, 'Keep it under 120 characters'),
});
export type PhoneSignInInput = z.input<typeof PhoneSignInInputSchema>;

export const VerifyPhoneCodeInputSchema = z.object({
  challengeId: z.string().trim().min(1).max(120),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit simulated code.'),
});
export type VerifyPhoneCodeInput = z.input<typeof VerifyPhoneCodeInputSchema>;

interface TableLike<T> {
  get(id: string): Promise<T | undefined>;
  put(row: T): Promise<unknown>;
  add(row: T): Promise<unknown>;
  where(index: string): {
    equals(value: string): {
      first(): Promise<T | undefined>;
      toArray(): Promise<T[]>;
    };
  };
}

interface DatabaseLike {
  table<T>(name: string): TableLike<T>;
  transaction<R>(mode: 'rw', tables: string[], scope: () => Promise<R>): Promise<R>;
}

interface PhoneChallengePayload {
  phone: string;
  name: string;
  attempts: number;
  personaId?: string;
}

export interface PhoneCodeIssue {
  challengeId: string;
  phone: string;
  code: string;
  sentAt: string;
  expiresAt: string;
  resendAt: string;
  returning: boolean;
  simulated: true;
}

export interface PhoneChallengeView extends Omit<PhoneCodeIssue, 'returning'> {
  secondsUntilResend: number;
  simulated: true;
}

function challengePayload(token: SaasToken): PhoneChallengePayload | null {
  const result = z
    .object({
      phone: z.string().regex(PHONE_RE),
      name: z.string().min(2).max(120),
      attempts: z.number().int().nonnegative(),
      personaId: z.string().optional(),
    })
    .safeParse(token.payload);
  return result.success ? result.data : null;
}

/** Deterministic six-digit code for a normalized phone number at a simulated instant. */
export function simulatedPhoneCode(phone: string, at: string | Date): string {
  const normalized = parseInput(PhoneNumberSchema, phone);
  const instant = at instanceof Date ? at.toISOString() : at;
  if (Number.isNaN(Date.parse(instant))) throw new RangeError('Expected a simulated ISO time.');
  return String(hashString(`${normalized}|${instant}`) % 1_000_000).padStart(6, '0');
}

/** Seconds until a resend is available, using only the provided simulated clock values. */
export function phoneResendSecondsRemaining(nowMs: number, sentAt: string | Date): number {
  const sentAtMs = sentAt instanceof Date ? sentAt.getTime() : Date.parse(sentAt);
  if (!Number.isFinite(nowMs) || Number.isNaN(sentAtMs)) return 0;
  return Math.max(0, Math.ceil((sentAtMs + PHONE_RESEND_COOLDOWN_MS - nowMs) / 1000));
}

/** Phone-only sign-up and sign-in for the browser simulation; this is not SMS delivery or security. */
export function createPhoneServices(
  runtime: ProtoyardRuntime,
  options: {
    challengeTtlMs?: number;
    resendCooldownMs?: number;
    attemptLimit?: number;
  } = {}
) {
  const db = runtime.db as unknown as DatabaseLike;
  const { environment, identity, session, clock } = runtime;
  const challengeTtlMs = options.challengeTtlMs ?? PHONE_CODE_TTL_MS;
  const resendCooldownMs = options.resendCooldownMs ?? PHONE_RESEND_COOLDOWN_MS;
  const attemptLimit = options.attemptLimit ?? PHONE_CODE_ATTEMPT_LIMIT;
  const tokens = () => db.table<SaasToken>(TOKENS);
  const logs = () => db.table<SaasSessionLog>(LOG);

  const listPhoneChallenges = async () =>
    (await tokens().where('kind').equals(PHONE_TOKEN_KIND).toArray()).filter(
      (token) => token.kind === PHONE_TOKEN_KIND
    );

  const issue = async (phone: string, name: string): Promise<PhoneCodeIssue> => {
    const data = parseInput(PhoneSignInInputSchema, { phone, name });
    const at = clock.now();
    const sentAt = at.toISOString();
    return environment.run('phone.sendCode', () =>
      db.transaction('rw', [TOKENS, LOG], async () => {
        const rows = await listPhoneChallenges();
        const prior = rows
          .filter((token) => {
            const payload = challengePayload(token);
            return (
              payload?.phone === data.phone &&
              !token.consumedAt &&
              Date.parse(token.expiresAt) > at.getTime()
            );
          })
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
        if (prior && at.getTime() < Date.parse(prior.createdAt) + resendCooldownMs) {
          const remaining = phoneResendSecondsRemaining(at.getTime(), prior.createdAt);
          throw new ValidationError({
            phone: `Wait ${remaining} seconds before requesting another code.`,
          });
        }

        const priorPersona = rows
          .map((token) => challengePayload(token))
          .find((payload) => payload?.phone === data.phone && payload.personaId)?.personaId;
        if (prior) await tokens().put({ ...prior, consumedAt: sentAt });

        const token: SaasToken = {
          id: createRuntimeId('phoneotp'),
          kind: PHONE_TOKEN_KIND,
          email: PHONE_CHALLENGE_EMAIL,
          accountId: null,
          payload: {
            phone: data.phone,
            name: data.name,
            attempts: 0,
            ...(priorPersona ? { personaId: priorPersona } : {}),
          },
          createdAt: sentAt,
          expiresAt: new Date(at.getTime() + challengeTtlMs).toISOString(),
          consumedAt: null,
        };
        await tokens().add(token);
        await logs().add({
          id: createRuntimeId('signin'),
          accountId: null,
          personaId: priorPersona ?? null,
          method: 'phone',
          provider: null,
          outcome: 'success',
          reason: 'code-sent',
          at: sentAt,
        });
        return {
          challengeId: token.id,
          phone: data.phone,
          code: simulatedPhoneCode(data.phone, sentAt),
          sentAt,
          expiresAt: token.expiresAt,
          resendAt: new Date(at.getTime() + resendCooldownMs).toISOString(),
          returning: Boolean(priorPersona),
          simulated: true as const,
        };
      })
    );
  };

  return {
    /** Starts sign-up or sign-in and returns the code for the simulated SMS banner. */
    sendCode(input: PhoneSignInInput): Promise<PhoneCodeIssue> {
      const data = parseInput(PhoneSignInInputSchema, input);
      return issue(data.phone, data.name);
    },

    /** Resends for an active challenge; the prior code is invalidated in the same transaction. */
    async resendCode(challengeId: string): Promise<PhoneCodeIssue> {
      const prior = await tokens().get(challengeId);
      const payload = prior?.kind === PHONE_TOKEN_KIND ? challengePayload(prior) : null;
      if (
        !prior ||
        !payload ||
        prior.consumedAt ||
        Date.parse(prior.expiresAt) <= clock.now().getTime()
      ) {
        throw new ValidationError({ phone: 'This code request is no longer active. Start again.' });
      }
      return issue(payload.phone, payload.name);
    },

    /** Rehydrates an active challenge for reloads; the code is explicitly simulated and local. */
    async describeChallenge(challengeId: string): Promise<PhoneChallengeView | null> {
      const token = await tokens().get(challengeId);
      const payload = token?.kind === PHONE_TOKEN_KIND ? challengePayload(token) : null;
      const now = clock.now();
      if (
        !token ||
        !payload ||
        token.consumedAt ||
        Date.parse(token.expiresAt) <= now.getTime() ||
        payload.attempts >= attemptLimit
      ) {
        return null;
      }
      return {
        challengeId: token.id,
        phone: payload.phone,
        code: simulatedPhoneCode(payload.phone, token.createdAt),
        sentAt: token.createdAt,
        expiresAt: token.expiresAt,
        resendAt: new Date(Date.parse(token.createdAt) + resendCooldownMs).toISOString(),
        secondsUntilResend: phoneResendSecondsRemaining(now.getTime(), token.createdAt),
        simulated: true,
      };
    },

    /** Verifies once, creates or reuses a persona, and opens the simulated session. */
    async verifyCode(
      input: VerifyPhoneCodeInput
    ): Promise<{ personaId: string; returning: boolean }> {
      const data = parseInput(VerifyPhoneCodeInputSchema, input);
      const now = clock.now();
      type Result =
        | { ok: true; personaId: string; returning: boolean }
        | { ok: false; reason: 'missing' | 'expired' | 'locked' | 'mismatch' };

      const result = await environment.run('phone.verifyCode', () =>
        identity.write(
          async (ops): Promise<Result> => {
            const token = await tokens().get(data.challengeId);
            const payload = token?.kind === PHONE_TOKEN_KIND ? challengePayload(token) : null;
            if (!token || !payload || token.consumedAt) return { ok: false, reason: 'missing' };
            if (Date.parse(token.expiresAt) <= now.getTime())
              return { ok: false, reason: 'expired' };
            if (payload.attempts >= attemptLimit) return { ok: false, reason: 'locked' };
            const sentCode = simulatedPhoneCode(payload.phone, token.createdAt);
            if (sentCode !== data.code) {
              const attempts = payload.attempts + 1;
              await tokens().put({ ...token, payload: { ...payload, attempts } });
              await logs().add({
                id: createRuntimeId('signin'),
                accountId: null,
                personaId: payload.personaId ?? null,
                method: 'phone',
                provider: null,
                outcome: 'failure',
                reason: attempts >= attemptLimit ? 'attempt-limit' : 'wrong-code',
                at: now.toISOString(),
              });
              return { ok: false, reason: attempts >= attemptLimit ? 'locked' : 'mismatch' };
            }

            const persona = payload.personaId
              ? await ops.getPersona(payload.personaId)
              : await ops.putPersona({ name: payload.name, onboardingComplete: false });
            if (!persona) return { ok: false, reason: 'missing' };
            await tokens().put({
              ...token,
              payload: { ...payload, personaId: persona.id },
              consumedAt: now.toISOString(),
            });
            await logs().add({
              id: createRuntimeId('signin'),
              accountId: null,
              personaId: persona.id,
              method: 'phone',
              provider: null,
              outcome: 'success',
              reason: null,
              at: now.toISOString(),
            });
            return { ok: true, personaId: persona.id, returning: Boolean(payload.personaId) };
          },
          { tables: [TOKENS, LOG] }
        )
      );

      if (!result.ok) {
        const messages = {
          missing: 'This code request is no longer active. Start again.',
          expired: 'This code has expired. Request a new one.',
          locked: 'Too many attempts. Request a new code.',
          mismatch: 'That code does not match. Try again.',
        } as const;
        throw new ValidationError({ code: messages[result.reason] });
      }
      await session.signIn(result.personaId);
      return { personaId: result.personaId, returning: result.returning };
    },
  };
}

export type PhoneServices = ReturnType<typeof createPhoneServices>;
