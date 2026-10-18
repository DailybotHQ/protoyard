import { createRuntimeId, parseInput, ValidationError } from '@protoyard/core';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import { z } from 'zod';
import {
  OAUTH_PROVIDER_REGISTRY,
  OAuthIdentitySchema,
  type OAuthOutcome,
  type OAuthProviderScenarios,
  parseOAuthProviderScenarios,
} from './providers.ts';
import {
  type LinkedProvider,
  type SaasAccount,
  SaasAccountSchema,
  type SaasProvider,
  SaasProviderSchema,
  type SaasSessionLog,
  type SaasToken,
  SaasTokenSchema,
} from './schema.ts';

const ACCOUNTS = 'saas_accounts';
const TOKENS = 'saas_tokens';
const LOG = 'saas_sessions_log';
const STATE_TTL_MS = 10 * 60_000;

export const OAuthIntentSchema = z.enum(['sign-in', 'sign-up', 'link']);
export type OAuthIntent = z.infer<typeof OAuthIntentSchema>;

export const OAuthStartSchema = z.object({
  provider: SaasProviderSchema,
  intent: OAuthIntentSchema,
});

interface TableLike<T> {
  get(id: string): Promise<T | undefined>;
  put(row: T): Promise<unknown>;
  add(row: T): Promise<unknown>;
  where(index: string): {
    equals(value: string): { first(): Promise<T | undefined>; toArray(): Promise<T[]> };
  };
  toArray(): Promise<T[]>;
}

interface DatabaseLike {
  table<T>(name: string): TableLike<T>;
  transaction<R>(mode: 'rw', tables: string[], scope: () => Promise<R>): Promise<R>;
}

interface OAuthPayload {
  provider: SaasProvider;
  intent: OAuthIntent;
  identity: z.infer<typeof OAuthIdentitySchema>;
  outcome: OAuthOutcome;
}

const OAuthPayloadSchema = z.object({
  provider: SaasProviderSchema,
  intent: OAuthIntentSchema,
  identity: OAuthIdentitySchema,
  outcome: z.enum(['success', 'consent-denied', 'email-not-shared', 'provider-error']),
});

export type OAuthResult =
  | { status: 'signed-in'; provider: SaasProvider; account: SaasAccount; route: '#/' }
  | { status: 'signed-up'; provider: SaasProvider; account: SaasAccount; route: '#/onboarding' }
  | { status: 'account-linking'; provider: SaasProvider; email: string; route: string }
  | { status: 'denied'; provider: SaasProvider; reason: 'consent-denied' }
  | { status: 'error'; provider: SaasProvider; reason: 'email-not-shared' | 'provider-error' };

export interface OAuthSimulator {
  start(
    provider: SaasProvider,
    intent: OAuthIntent
  ): Promise<{
    state: string;
    route: string;
    provider: (typeof OAUTH_PROVIDER_REGISTRY)[SaasProvider];
  }>;
  approve(state: string): Promise<OAuthResult>;
  deny(state: string): Promise<{ status: 'denied'; provider: SaasProvider }>;
}

/**
 * In-app OAuth simulation for the five supported providers. It never contacts
 * a provider or leaves the current origin; all profiles use fictional email.
 */
export function createOAuthSimulator(
  runtime: ProtoyardRuntime,
  providers: OAuthProviderScenarios = {}
): OAuthSimulator {
  const db = runtime.db as unknown as DatabaseLike;
  const scenarios = parseOAuthProviderScenarios(providers);
  const now = () => runtime.clock.now();
  const accounts = () => db.table<SaasAccount>(ACCOUNTS);
  const tokens = () => db.table<SaasToken>(TOKENS);
  const logs = () => db.table<SaasSessionLog>(LOG);

  async function loadState(state: string): Promise<{ token: SaasToken; payload: OAuthPayload }> {
    if (!state || state.length > 256)
      throw new ValidationError({ state: 'This sign-in link is not valid.' });
    const token = await tokens().get(state);
    if (token?.kind !== 'oauth-state') {
      throw new ValidationError({ state: 'This sign-in link is not valid.' });
    }
    if (token.consumedAt)
      throw new ValidationError({ state: 'This sign-in link was already used.' });
    if (Date.parse(token.expiresAt) <= now().getTime()) {
      throw new ValidationError({ state: 'This sign-in link has expired. Start again.' });
    }
    const parsed = OAuthPayloadSchema.safeParse(token.payload);
    if (!parsed.success) throw new ValidationError({ state: 'This sign-in link is not valid.' });
    return { token, payload: parsed.data };
  }

  async function consume(token: SaasToken): Promise<void> {
    const current = await tokens().get(token.id);
    if (current?.kind !== 'oauth-state') {
      throw new ValidationError({ state: 'This sign-in link is not valid.' });
    }
    if (current.consumedAt) {
      throw new ValidationError({ state: 'This sign-in link was already used.' });
    }
    if (Date.parse(current.expiresAt) <= now().getTime()) {
      throw new ValidationError({ state: 'This sign-in link has expired. Start again.' });
    }
    await tokens().put(SaasTokenSchema.parse({ ...current, consumedAt: now().toISOString() }));
  }

  async function log(input: {
    accountId?: string | null;
    personaId?: string | null;
    provider: SaasProvider;
    outcome: 'success' | 'failure';
    reason: string | null;
  }): Promise<void> {
    await logs().add({
      id: createRuntimeId('signin'),
      accountId: input.accountId ?? null,
      personaId: input.personaId ?? null,
      method: 'oauth',
      provider: input.provider,
      outcome: input.outcome,
      reason: input.reason,
      at: now().toISOString(),
    });
  }

  return {
    async start(rawProvider, rawIntent) {
      const { provider, intent } = parseInput(OAuthStartSchema, {
        provider: rawProvider,
        intent: rawIntent,
      });
      if (intent === 'link' && !runtime.session.principal()) {
        throw new ValidationError({ form: 'Sign in before linking a provider.' });
      }
      const scenario = scenarios[provider];
      const identity = scenario.identity;
      const profile = parseInput(OAuthIdentitySchema, identity);
      const routeData = await runtime.environment.run('oauth.start', () =>
        db.transaction('rw', [TOKENS], async () => {
          const existing = (await tokens().where('kind').equals('oauth-state').toArray()).length;
          const state = `oauth_${provider}_${now().getTime().toString(36)}_${(existing + 1).toString(36)}`;
          const createdAt = now();
          const row = SaasTokenSchema.parse({
            id: state,
            kind: 'oauth-state',
            email: profile.email,
            accountId: null,
            payload: {
              provider,
              intent,
              identity: profile,
              outcome: scenario.outcome,
            } satisfies OAuthPayload,
            createdAt: createdAt.toISOString(),
            expiresAt: new Date(createdAt.getTime() + STATE_TTL_MS).toISOString(),
            consumedAt: null,
          });
          await tokens().add(row);
          return state;
        })
      );
      return {
        state: routeData,
        route: `#/oauth/${provider}/consent?state=${encodeURIComponent(routeData)}`,
        provider: OAUTH_PROVIDER_REGISTRY[provider],
      };
    },

    async approve(state) {
      const { token, payload } = await loadState(state);
      const result = await runtime.environment.run('oauth.approve', async () => {
        if (payload.outcome !== 'success') {
          await db.transaction('rw', [TOKENS, LOG], async () => {
            await consume(token);
            await log({ provider: payload.provider, outcome: 'failure', reason: payload.outcome });
          });
          return payload.outcome === 'consent-denied'
            ? ({ status: 'denied', provider: payload.provider, reason: payload.outcome } as const)
            : ({ status: 'error', provider: payload.provider, reason: payload.outcome } as const);
        }
        if (!payload.identity.emailShared) {
          await db.transaction('rw', [TOKENS, LOG], async () => {
            await consume(token);
            await log({
              provider: payload.provider,
              outcome: 'failure',
              reason: 'email-not-shared',
            });
          });
          return {
            status: 'error',
            provider: payload.provider,
            reason: 'email-not-shared',
          } as const;
        }

        if (payload.intent === 'link') {
          return runtime.identity.write(
            async () => {
              const personaId = runtime.session.principal()?.persona.id;
              if (!personaId)
                throw new ValidationError({ form: 'Sign in before linking a provider.' });
              const account = await accounts().where('personaId').equals(personaId).first();
              if (!account)
                throw new ValidationError({ form: 'No sign-in account is available to link.' });
              const existing = account.providers.find((item) => item.provider === payload.provider);
              if (existing && existing.subject !== payload.identity.subject) {
                throw new ValidationError({
                  provider: 'Another account is already linked to this provider.',
                });
              }
              const linked = SaasAccountSchema.parse({
                ...account,
                providers: [
                  ...account.providers.filter((item) => item.provider !== payload.provider),
                  providerLink(payload.provider, payload.identity, now().toISOString()),
                ],
              });
              await consume(token);
              await accounts().put(linked);
              await log({
                accountId: linked.id,
                personaId,
                provider: payload.provider,
                outcome: 'success',
                reason: null,
              });
              return {
                status: 'signed-in',
                provider: payload.provider,
                account: linked,
                route: '#/',
              } as const;
            },
            { tables: [TOKENS, ACCOUNTS, LOG] }
          );
        }

        const account = await accounts().where('email').equals(payload.identity.email).first();
        if (account) {
          const linked = account.providers.find(
            (item) =>
              item.provider === payload.provider && item.subject === payload.identity.subject
          );
          if (!linked) {
            await db.transaction('rw', [TOKENS, LOG], async () => {
              await consume(token);
              await log({
                accountId: account.id,
                personaId: account.personaId,
                provider: payload.provider,
                outcome: 'failure',
                reason: 'account-link-required',
              });
            });
            return {
              status: 'account-linking',
              provider: payload.provider,
              email: account.email,
              route: `#/oauth/${payload.provider}/link?email=${encodeURIComponent(account.email)}`,
            } as const;
          }
          if (account.status !== 'active') {
            await db.transaction('rw', [TOKENS, LOG], async () => {
              await consume(token);
              await log({
                accountId: account.id,
                personaId: account.personaId,
                provider: payload.provider,
                outcome: 'failure',
                reason: account.status,
              });
            });
            return {
              status: 'error',
              provider: payload.provider,
              reason: 'provider-error',
            } as const;
          }
          const signedIn = SaasAccountSchema.parse({
            ...account,
            lastSignInAt: now().toISOString(),
          });
          await db.transaction('rw', [TOKENS, ACCOUNTS, LOG], async () => {
            await consume(token);
            await accounts().put(signedIn);
            await log({
              accountId: signedIn.id,
              personaId: signedIn.personaId,
              provider: payload.provider,
              outcome: 'success',
              reason: null,
            });
          });
          await runtime.session.signIn(signedIn.personaId);
          return {
            status: 'signed-in',
            provider: payload.provider,
            account: signedIn,
            route: '#/',
          } as const;
        }

        return runtime.identity
          .write(
            async (ops) => {
              const persona = await ops.putPersona({
                name: payload.identity.name,
                email: payload.identity.email,
                onboardingComplete: false,
              });
              const organization = await ops.putOrganization({
                name: `${payload.identity.name}'s workspace`,
              });
              await ops.putMembership({
                personaId: persona.id,
                organizationId: organization.id,
                role: 'owner',
              });
              const created = SaasAccountSchema.parse({
                id: createRuntimeId('acct'),
                personaId: persona.id,
                email: payload.identity.email,
                emailVerified: true,
                simulatedPassword: null,
                providers: [providerLink(payload.provider, payload.identity, now().toISOString())],
                status: 'active',
                failedAttempts: 0,
                createdAt: now().toISOString(),
                lastSignInAt: now().toISOString(),
              });
              await consume(token);
              await accounts().add(created);
              await log({
                accountId: created.id,
                personaId: persona.id,
                provider: payload.provider,
                outcome: 'success',
                reason: null,
              });
              return created;
            },
            { tables: [TOKENS, ACCOUNTS, LOG] }
          )
          .then(async (created) => {
            await runtime.session.signIn(created.personaId);
            return {
              status: 'signed-up',
              provider: payload.provider,
              account: created,
              route: '#/onboarding',
            } as const;
          });
      });
      return result;
    },

    async deny(state) {
      const { token, payload } = await loadState(state);
      await runtime.environment.run('oauth.deny', () =>
        db.transaction('rw', [TOKENS, LOG], async () => {
          await consume(token);
          await log({ provider: payload.provider, outcome: 'failure', reason: 'consent-denied' });
        })
      );
      return { status: 'denied', provider: payload.provider };
    },
  };
}

function providerLink(
  provider: SaasProvider,
  identity: OAuthPayload['identity'],
  linkedAt: string
): LinkedProvider {
  return {
    provider,
    subject: identity.subject,
    email: identity.email,
    linkedAt,
  };
}
