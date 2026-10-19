import {
  definePolicy,
  definePrototype,
  type PrototypeDefinition,
  parseManifest,
} from '@protoyard/core';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  createMfaServices,
  type OAuthProviderScenarios,
  type SaasAccount,
  saasIntegrity,
  saasStores,
  saasTables,
} from '../../saas/src/index.ts';
import { generateTeam } from '../../scenarios/src/index.ts';
import AuthHarness from './fixtures/AuthHarness.svelte';

// Regression tests for the simulated MFA step (review findings H1, M4, M7).
// Simulation UX only: none of this is security.

const REFERENCE_TIME = '2026-10-17T09:00:00.000Z';
const EMAIL = 'ada@example.com';
const PASSWORD = 'simulated password';
const definition: PrototypeDefinition = definePrototype({
  manifest: parseManifest({
    id: 'example.saas-ui-mfa-challenge',
    slug: 'saas-ui-mfa-challenge',
    name: 'MFA challenge screens fixture',
    version: '0.1.0',
    defaultScenario: 'active',
    defaultTheme: 'violet',
    storage: { namespace: 'saas-ui-mfa-challenge', schemaVersion: 1 },
    scenarios: ['active'],
  }),
  auth: { signedOutByDefault: true },
  database: { versions: [{ version: 1, stores: saasStores() }] },
  scenarios: [
    {
      id: 'active',
      extends: 'active-month',
      name: 'Active workspace',
      seed: 721,
      referenceTime: REFERENCE_TIME,
    },
  ],
  policy: definePolicy({ roles: { owner: ['*'], admin: ['*'], member: [], viewer: [] } }),
  integrity: saasIntegrity(),
  generate(ctx) {
    const team = generateTeam(ctx);
    const owner = team.personas[0];
    if (!owner) throw new Error('The auth fixture needs a generated persona');
    const account: SaasAccount = {
      id: ctx.ids.next('acct'),
      personaId: owner.id,
      email: EMAIL,
      emailVerified: true,
      simulatedPassword: PASSWORD,
      providers: [],
      status: 'active',
      failedAttempts: 0,
      createdAt: owner.joinedAt,
      lastSignInAt: null,
    };
    return {
      organizations: team.organizations,
      personas: team.personas,
      memberships: team.memberships.map((membership, index) =>
        index === 0 ? { ...membership, role: 'owner' } : membership
      ),
      tables: saasTables({ saas_accounts: [account] }),
    };
  },
});

type Db = ProtoyardRuntime['db'];
let harness = createHarness<Db>(definition);
afterEach(() => {
  cleanup();
  harness.closeAll();
  harness = createHarness<Db>(definition);
  location.hash = '';
});

const boot = async () => (await harness.boot('active')) as ProtoyardRuntime;
const type = (label: string, value: string) =>
  fireEvent.input(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
const submit = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

async function fixtureAccount(runtime: ProtoyardRuntime): Promise<SaasAccount> {
  const account = await runtime.db
    .rows<SaasAccount>('saas_accounts')
    .where('email')
    .equals(EMAIL)
    .first();
  if (!account) throw new Error('The fixture account was not created');
  return account;
}

/** Turns simulated MFA on for the fixture account and signs out again. */
async function enableMfa(runtime: ProtoyardRuntime) {
  const account = await fixtureAccount(runtime);
  await runtime.session.signIn(account.personaId);
  const mfa = createMfaServices(runtime);
  const enrollment = await mfa.enroll();
  await mfa.confirmEnroll(enrollment.currentCode);
  await runtime.session.signOut();
  return { account, mfa, seed: enrollment.mfa.seed };
}

describe('MFA challenge screen', () => {
  it('never shows a code or signs in from a bare ?account= link', async () => {
    const runtime = await boot();
    const { account } = await enableMfa(runtime);
    location.hash = `#/auth/mfa?account=${encodeURIComponent(account.id)}`;
    render(AuthHarness, { props: { runtime, screen: 'mfa' } });
    expect(
      await screen.findByText('Open this challenge from a password, magic-link or SSO sign-in.')
    ).toBeTruthy();
    expect(screen.queryByTestId('auth-simulated-code')).toBeNull();
    const verify = screen.getByRole('button', { name: 'Verify and sign in' }) as HTMLButtonElement;
    expect(verify.disabled).toBe(true);
    expect(runtime.session.isSignedIn()).toBe(false);
  });

  it('refuses an account id passed as the challenge', async () => {
    const runtime = await boot();
    const { account, mfa, seed } = await enableMfa(runtime);
    location.hash = `#/auth/mfa?challenge=${encodeURIComponent(account.id)}`;
    render(AuthHarness, { props: { runtime, screen: 'mfa' } });
    expect(await screen.findByText(/not valid, was already used or has expired/)).toBeTruthy();
    expect(screen.queryByTestId('auth-simulated-code')).toBeNull();
    await type('Authenticator code', mfa.authenticatorPanel(seed).code);
    await submit('Verify and sign in');
    expect(
      await screen.findByText('This verification step is not valid. Sign in again.')
    ).toBeTruthy();
    expect(runtime.session.isSignedIn()).toBe(false);
  });

  it('shows the code of the challenge account and signs in once', async () => {
    const runtime = await boot();
    const { mfa, seed } = await enableMfa(runtime);
    const first = await mfa.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (first.status !== 'mfa-required') throw new Error('Expected an MFA challenge');
    location.hash = `#/auth/mfa?challenge=${encodeURIComponent(first.challenge.id)}`;
    render(AuthHarness, { props: { runtime, screen: 'mfa' } });
    const panel = await screen.findByTestId('auth-simulated-code');
    expect(panel.textContent).toContain(mfa.authenticatorPanel(seed).code);
    await type('Authenticator code', mfa.authenticatorPanel(seed).code);
    await submit('Verify and sign in');
    await waitFor(() => expect(runtime.session.isSignedIn()).toBe(true));
  });
});

describe('SSO with MFA', () => {
  it('routes an MFA-active linked account from consent to the challenge', async () => {
    const runtime = await boot();
    const { account, mfa, seed } = await enableMfa(runtime);
    await runtime.db.rows<SaasAccount>('saas_accounts').put({
      ...(await fixtureAccount(runtime)),
      providers: [
        { provider: 'google', subject: 'google_ada', email: EMAIL, linkedAt: REFERENCE_TIME },
      ],
    });
    const scenarios: OAuthProviderScenarios = {
      google: {
        identity: { subject: 'google_ada', name: 'Ada Lovelace', email: EMAIL, emailShared: true },
        outcome: 'success',
      },
    };
    render(AuthHarness, { props: { runtime, screen: 'sso', scenarios } });
    await submit('Continue with Google');
    await waitFor(() => expect(location.hash).toContain('#/oauth/google/consent?state='));
    cleanup();
    render(AuthHarness, { props: { runtime, screen: 'oauth-consent', scenarios } });
    await submit('Approve');
    await waitFor(() => expect(location.hash).toContain('#/auth/mfa?challenge='), {
      timeout: 2000,
    });
    expect(location.hash).not.toContain(account.id);
    expect(runtime.session.isSignedIn()).toBe(false);

    cleanup();
    render(AuthHarness, { props: { runtime, screen: 'mfa' } });
    await screen.findByTestId('auth-simulated-code');
    await type('Authenticator code', mfa.authenticatorPanel(seed).code);
    await submit('Verify and sign in');
    await waitFor(() => expect(runtime.session.isSignedIn()).toBe(true));
    expect(runtime.session.principal()?.persona.id).toBe(account.personaId);
  });
});

describe('sign-in lockout', () => {
  it('locks the account after five wrong passwords on the sign-in screen', async () => {
    const runtime = await boot();
    render(AuthHarness, { props: { runtime, screen: 'sign-in' } });
    await type('Email', EMAIL);
    for (let attempt = 1; attempt <= 5; attempt++) {
      await type('Password', `wrong password ${attempt}`);
      await submit('Sign in');
      await waitFor(async () =>
        expect((await fixtureAccount(runtime)).failedAttempts).toBe(attempt)
      );
    }
    expect((await fixtureAccount(runtime)).status).toBe('locked');
    expect(await screen.findByText('Incorrect password. The account is now locked.')).toBeTruthy();
    await type('Password', PASSWORD);
    await submit('Sign in');
    expect(await screen.findByText(/This account is locked after too many attempts/)).toBeTruthy();
    expect(runtime.session.isSignedIn()).toBe(false);
  });
});
