import {
  definePrototype,
  type PrototypeDefinition,
  parseManifest,
  ValidationError,
} from '@protoyard/core';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import { generateTeam } from '@protoyard/scenarios';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  createAuthServices,
  createMfaServices,
  createOAuthSimulator,
  OAUTH_PROVIDER_REGISTRY,
  type OAuthIdentity,
  type OAuthProviderScenarios,
  SAAS_PROVIDERS,
  type SaasAccount,
  type SaasSessionLog,
  saasIntegrity,
  saasStores,
  saasTables,
} from '../src/index.ts';

const REFERENCE_TIME = '2026-06-01T09:00:00.000Z';
const SEEDED = { email: 'ada.seed@example.com', password: 'correct horse' };
let generatedIdentity: OAuthIdentity;

const definition: PrototypeDefinition = definePrototype({
  manifest: parseManifest({
    id: 'example.saas-oauth',
    slug: 'saas-oauth',
    name: 'SaaS OAuth fixture',
    version: '0.1.0',
    defaultScenario: 'visitor',
    defaultTheme: 'violet',
    storage: { namespace: 'saas-oauth', schemaVersion: 1 },
    scenarios: ['visitor'],
  }),
  auth: { signedOutByDefault: true },
  database: { versions: [{ version: 1, stores: saasStores() }] },
  scenarios: [
    {
      id: 'visitor',
      extends: 'active-month',
      name: 'Signed-out visitor',
      seed: 19,
      referenceTime: REFERENCE_TIME,
    },
  ],
  integrity: saasIntegrity(),
  generate(ctx) {
    const team = generateTeam(ctx);
    const owner = team.personas[0];
    if (!owner) throw new Error('generateTeam returned no personas');
    const firstName = ctx.faker.person.firstName();
    const lastName = ctx.faker.person.lastName();
    generatedIdentity = {
      subject: ctx.ids.next('oauth'),
      name: `${firstName} ${lastName}`,
      email: ctx.faker.internet
        .email({ firstName, lastName, provider: 'example.com' })
        .toLowerCase(),
      emailShared: true,
    };
    const account: SaasAccount = {
      id: ctx.ids.next('acct'),
      personaId: owner.id,
      email: SEEDED.email,
      emailVerified: true,
      simulatedPassword: SEEDED.password,
      providers: [],
      status: 'active',
      failedAttempts: 0,
      createdAt: owner.joinedAt,
      lastSignInAt: null,
    };
    return {
      organizations: team.organizations,
      personas: team.personas,
      memberships: team.memberships,
      tables: saasTables({ saas_accounts: [account] }),
    };
  },
});

type Db = ProtoyardRuntime['db'];
let harness = createHarness<Db>(definition);
afterEach(() => {
  harness.closeAll();
  harness = createHarness<Db>(definition);
});

const asRuntime = (runtime: unknown) => runtime as ProtoyardRuntime;
const boot = async () => asRuntime(await harness.boot('visitor'));

function profileFor(provider: (typeof SAAS_PROVIDERS)[number]): OAuthIdentity {
  const local = generatedIdentity.email.split('@')[0] ?? 'guest';
  return {
    ...generatedIdentity,
    subject: `${provider}_${generatedIdentity.subject}`,
    email: `${provider}.${local}@example.com`,
  };
}

function scenariosFor(
  provider: (typeof SAAS_PROVIDERS)[number],
  identity: OAuthIdentity,
  outcome: 'success' | 'consent-denied' | 'email-not-shared' | 'provider-error' = 'success'
): OAuthProviderScenarios {
  return { [provider]: { identity, outcome } };
}

describe('createOAuthSimulator on the real runtime', () => {
  it('provides brand-neutral provider metadata and a deterministic in-app consent route', async () => {
    const runtime = await boot();
    const oauth = createOAuthSimulator(runtime, scenariosFor('google', profileFor('google')));
    const first = await oauth.start('google', 'sign-in');
    const second = await oauth.start('google', 'sign-in');

    expect(first.provider).toEqual({
      id: 'google',
      name: 'Google',
      scopes: 'basic profile and email',
    });
    expect(first.route).toBe(`#/oauth/google/consent?state=${encodeURIComponent(first.state)}`);
    expect(first.state).toMatch(/^oauth_google_[a-z0-9]+_1$/);
    expect(second.state).toMatch(/^oauth_google_[a-z0-9]+_2$/);
    expect(first.route).not.toMatch(/^https?:/);

    harness.closeAll();
    harness = createHarness<Db>(definition);
    const resetRuntime = await boot();
    const resetStart = await createOAuthSimulator(
      resetRuntime,
      scenariosFor('google', profileFor('google'))
    ).start('google', 'sign-in');
    expect(resetStart.state).toBe(first.state);
  });

  it('supports every provider with seeded, fictional identities and returns a sign-up link', async () => {
    const runtime = await boot();
    for (const provider of SAAS_PROVIDERS) {
      const oauth = createOAuthSimulator(runtime, scenariosFor(provider, profileFor(provider)));
      const started = await oauth.start(provider, 'sign-up');
      const result = await oauth.approve(started.state);
      expect(result).toMatchObject({ status: 'signed-up', provider, route: '#/onboarding' });
      if (result.status !== 'signed-up') throw new Error('Expected OAuth sign-up result');
      expect(result.account.providers[0]?.provider).toBe(provider);
      expect(result.account.email).toMatch(/@example\.com$/);
      expect(runtime.session.principal()?.persona.id).toBe(result.account.personaId);
    }
    expect(Object.keys(OAUTH_PROVIDER_REGISTRY)).toEqual(SAAS_PROVIDERS);
  });

  it('prompts to link an existing same-email account, then links after explicit sign-in intent', async () => {
    const runtime = await boot();
    const identity = { ...generatedIdentity, email: SEEDED.email };
    const oauth = createOAuthSimulator(runtime, scenariosFor('github', identity));
    const started = await oauth.start('github', 'sign-in');
    expect(await oauth.approve(started.state)).toMatchObject({
      status: 'account-linking',
      provider: 'github',
      email: SEEDED.email,
      route: expect.stringContaining('#/oauth/github/link'),
    });
    expect(runtime.session.isSignedIn()).toBe(false);

    await createAuthServices(runtime).signIn(SEEDED);
    const link = await oauth.start('github', 'link');
    const result = await oauth.approve(link.state);
    expect(result).toMatchObject({ status: 'signed-in', provider: 'github' });
    const persisted = await runtime.db
      .rows<SaasAccount>('saas_accounts')
      .where('email')
      .equals(SEEDED.email)
      .first();
    expect(persisted?.providers).toEqual([
      expect.objectContaining({
        provider: 'github',
        subject: identity.subject,
        email: SEEDED.email,
      }),
    ]);
  });

  it('handles consent denial, an unshared email and provider errors as scenario outcomes', async () => {
    const runtime = await boot();
    const denied = createOAuthSimulator(
      runtime,
      scenariosFor('google', profileFor('google'), 'consent-denied')
    );
    const deniedStart = await denied.start('google', 'sign-in');
    expect(await denied.approve(deniedStart.state)).toEqual({
      status: 'denied',
      provider: 'google',
      reason: 'consent-denied',
    });

    const hidden = { ...profileFor('apple'), emailShared: false };
    const emailNotShared = createOAuthSimulator(runtime, scenariosFor('apple', hidden));
    const hiddenStart = await emailNotShared.start('apple', 'sign-up');
    expect(await emailNotShared.approve(hiddenStart.state)).toEqual({
      status: 'error',
      provider: 'apple',
      reason: 'email-not-shared',
    });

    const failed = createOAuthSimulator(
      runtime,
      scenariosFor('microsoft', profileFor('microsoft'), 'provider-error')
    );
    const failedStart = await failed.start('microsoft', 'sign-in');
    expect(await failed.approve(failedStart.state)).toEqual({
      status: 'error',
      provider: 'microsoft',
      reason: 'provider-error',
    });
    expect(await runtime.db.rows('saas_accounts').count()).toBe(1);
  });

  it('records explicit denial and rejects a consumed state on replay', async () => {
    const runtime = await boot();
    const oauth = createOAuthSimulator(runtime, scenariosFor('slack', profileFor('slack')));
    const denied = await oauth.start('slack', 'sign-in');
    expect(await oauth.deny(denied.state)).toEqual({ status: 'denied', provider: 'slack' });
    await expect(oauth.approve(denied.state)).rejects.toBeInstanceOf(ValidationError);

    const approved = await oauth.start('slack', 'sign-up');
    expect((await oauth.approve(approved.state)).status).toBe('signed-up');
    await expect(oauth.approve(approved.state)).rejects.toBeInstanceOf(ValidationError);
    const token = await runtime.db.rows('saas_tokens').where('id').equals(approved.state).first();
    expect(token?.consumedAt).toBeTruthy();
  });

  it('serializes concurrent approvals so only one consumes the state', async () => {
    const runtime = await boot();
    const oauth = createOAuthSimulator(runtime, scenariosFor('google', profileFor('google')));
    const started = await oauth.start('google', 'sign-up');
    const results = await Promise.allSettled([
      oauth.approve(started.state),
      oauth.approve(started.state),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await runtime.db.rows('saas_accounts').count()).toBe(2);
  });
});

describe('OAuth sign-in and MFA (M7)', () => {
  /** Signs in with the password, links GitHub, optionally turns MFA on, then signs out. */
  async function linkedAccount(runtime: ProtoyardRuntime, withMfa: boolean) {
    const identity = { ...generatedIdentity, email: SEEDED.email };
    const oauth = createOAuthSimulator(runtime, scenariosFor('github', identity));
    await createAuthServices(runtime).signIn(SEEDED);
    const link = await oauth.start('github', 'link');
    expect((await oauth.approve(link.state)).status).toBe('signed-in');
    const mfa = createMfaServices(runtime);
    let seed = '';
    if (withMfa) {
      const enrollment = await mfa.enroll();
      await mfa.confirmEnroll(enrollment.currentCode);
      seed = enrollment.mfa.seed;
    }
    await runtime.session.signOut();
    return { oauth, mfa, seed };
  }

  it('requires the MFA challenge for a linked account with active MFA', async () => {
    const runtime = await boot();
    const { oauth, mfa, seed } = await linkedAccount(runtime, true);
    const started = await oauth.start('github', 'sign-in');
    const result = await oauth.approve(started.state);
    expect(result).toMatchObject({ status: 'mfa-required', provider: 'github' });
    if (result.status !== 'mfa-required') throw new Error('Expected an MFA challenge');
    expect(result.route).toBe(`#/auth/mfa?challenge=${encodeURIComponent(result.challenge.id)}`);
    expect(runtime.session.isSignedIn()).toBe(false);
    await expect(oauth.approve(started.state)).rejects.toBeInstanceOf(ValidationError);

    // The account id alone does not finish the sign-in; the challenge does.
    const code = mfa.authenticatorPanel(seed).code;
    await expect(mfa.completeChallenge(result.account.id, { code })).rejects.toBeInstanceOf(
      ValidationError
    );
    const account = await mfa.completeChallenge(result.challenge.id, { code });
    expect(runtime.session.principal()?.persona.id).toBe(account.personaId);
    const log = await runtime.db.rows<SaasSessionLog>('saas_sessions_log').toArray();
    expect(log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'oauth', provider: 'github', reason: 'mfa-required' }),
        expect.objectContaining({ method: 'mfa', outcome: 'success', reason: 'totp-sim' }),
      ])
    );
  });

  it('signs a linked account without MFA in directly', async () => {
    const runtime = await boot();
    const { oauth } = await linkedAccount(runtime, false);
    const started = await oauth.start('github', 'sign-in');
    const result = await oauth.approve(started.state);
    expect(result).toMatchObject({ status: 'signed-in', provider: 'github', route: '#/' });
    expect(runtime.session.isSignedIn()).toBe(true);
  });
});
