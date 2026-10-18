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
  createAuthServices,
  createMagicLinkServices,
  createMfaServices,
  createPasswordResetServices,
  createSettingsServices,
  type OAuthProviderScenarios,
  type SaasAccount,
  saasIntegrity,
  saasStores,
  saasTables,
} from '../../saas/src/index.ts';
import { generateTeam } from '../../scenarios/src/index.ts';
import { saasRoutes } from '../src/routes.ts';
import AuthHarness from './fixtures/AuthHarness.svelte';

const REFERENCE_TIME = '2026-10-17T09:00:00.000Z';
const EMAIL = 'ada@example.com';
const PASSWORD = 'simulated password';
const definition: PrototypeDefinition = definePrototype({
  manifest: parseManifest({
    id: 'example.saas-ui-auth',
    slug: 'saas-ui-auth',
    name: 'Auth screens fixture',
    version: '0.1.0',
    defaultScenario: 'active',
    defaultTheme: 'violet',
    storage: { namespace: 'saas-ui-auth', schemaVersion: 1 },
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
async function signInFixture(runtime: ProtoyardRuntime): Promise<SaasAccount> {
  const account = await runtime.db
    .rows<SaasAccount>('saas_accounts')
    .where('email')
    .equals(EMAIL)
    .first();
  if (!account) throw new Error('The auth fixture account was not created');
  await runtime.session.signIn(account.personaId);
  return account;
}
const type = (label: string, value: string) =>
  fireEvent.input(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
const submit = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('auth screens', () => {
  it('settings profile tab validates and saves persona details', async () => {
    const runtime = await boot();
    await signInFixture(runtime);
    render(AuthHarness, { props: { runtime, screen: 'settings', tab: 'profile' } });
    await type('Display name', 'Ada Byron');
    await type('Time zone', 'America/Bogota');
    await fireEvent.input(screen.getByLabelText('Avatar color'), { target: { value: '#123456' } });
    await submit('Save profile');
    await waitFor(() => expect(runtime.session.principal()?.persona.name).toBe('Ada Byron'));
    expect(runtime.session.principal()?.persona.timezone).toBe('America/Bogota');
    expect(runtime.session.principal()?.persona.avatarColor).toBe('#123456');
  });

  it('settings security tab changes a password through the settings service', async () => {
    const runtime = await boot();
    await signInFixture(runtime);
    render(AuthHarness, { props: { runtime, screen: 'settings', tab: 'security' } });
    await type('Current simulated password', PASSWORD);
    await type('New simulated password', 'changed simulated password');
    await submit('Change password');
    await waitFor(async () => {
      const updated = await createAuthServices(runtime).account();
      expect(updated?.simulatedPassword).toBe('changed simulated password');
    });
  });

  it('settings members tab creates and revokes a simulated invitation', async () => {
    const runtime = await boot();
    await signInFixture(runtime);
    const principal = runtime.session.principal();
    if (!principal) throw new Error('The members settings test needs a signed-in principal');
    if (!principal.membership || !principal.organization) {
      throw new Error('The members settings test needs an organization membership');
    }
    expect(principal.membership.role).toBe('owner');
    expect(
      runtime.session.can('members:invite', { organizationId: principal.organization.id })
    ).toBe(true);
    render(AuthHarness, { props: { runtime, screen: 'settings', tab: 'members' } });
    await type('Invite email', 'settings-member@example.com');
    await submit('Invite');
    await screen.findByRole('status');
    await screen.findByText(/settings-member@example.com · member/);
    const revokeButton = screen.getByRole('button', { name: 'Revoke' });
    await waitFor(() => expect((revokeButton as HTMLButtonElement).disabled).toBe(false));
    await fireEvent.click(revokeButton);
    await waitFor(async () => {
      const stored = await runtime.db
        .rows('saas_invitations')
        .where('email')
        .equals('settings-member@example.com')
        .first();
      expect(stored?.status).toBe('revoked');
    });
    await waitFor(() =>
      expect(screen.queryByText(/settings-member@example.com · member/)).toBeNull()
    );
    const stored = await runtime.db
      .rows('saas_invitations')
      .where('email')
      .equals('settings-member@example.com')
      .first();
    expect(stored?.status).toBe('revoked');
  });

  it('settings notification tab persists preferences through the settings service', async () => {
    const runtime = await boot();
    await signInFixture(runtime);
    render(AuthHarness, { props: { runtime, screen: 'settings', tab: 'notifications' } });
    const productUpdates = await screen.findByLabelText(/Product updates/);
    await fireEvent.click(productUpdates);
    await submit('Save preferences');
    await waitFor(async () => {
      const account = await createSettingsServices(runtime).account();
      expect(account.notificationPreferences?.productUpdates).toBe(true);
    });
  });

  it('completes the sso round trip and signs the simulated account in', async () => {
    const runtime = await boot();
    const scenarios: OAuthProviderScenarios = {
      google: {
        identity: { subject: 'google_ada', name: 'Ada Lovelace', email: EMAIL, emailShared: true },
        outcome: 'success',
      },
    };
    const existing = await runtime.db
      .rows<SaasAccount>('saas_accounts')
      .where('email')
      .equals(EMAIL)
      .first();
    if (!existing) throw new Error('The auth fixture account was not created');
    await runtime.db.rows<SaasAccount>('saas_accounts').put({
      ...existing,
      providers: [
        { provider: 'google', subject: 'google_ada', email: EMAIL, linkedAt: REFERENCE_TIME },
      ],
    });
    render(AuthHarness, { props: { runtime, screen: 'sso', scenarios } });
    await submit('Continue with Google');
    await waitFor(() => expect(location.hash).toContain('#/oauth/google/consent?state='));

    cleanup();
    render(AuthHarness, { props: { runtime, screen: 'oauth-consent', scenarios } });
    expect(screen.getByText(/nothing leaves your browser/i)).toBeTruthy();
    await submit('Approve');
    expect(await screen.findByRole('status')).toBeTruthy();
    await waitFor(() => expect(location.hash).toBe('#/'), { timeout: 2000 });
    expect(runtime.session.isSignedIn()).toBe(true);
  });

  it('denies sso consent and returns to sign in with an honest status', async () => {
    const runtime = await boot();
    render(AuthHarness, { props: { runtime, screen: 'sso' } });
    await submit('Continue with Google');
    await waitFor(() => expect(location.hash).toContain('#/oauth/google/consent?state='));

    cleanup();
    render(AuthHarness, { props: { runtime, screen: 'oauth-consent' } });
    await submit('Deny');
    expect(await screen.findByRole('status')).toBeTruthy();
    await waitFor(() => expect(location.hash).toBe('#/sign-in'), { timeout: 2000 });
    expect(runtime.session.isSignedIn()).toBe(false);
  });

  it('confirms an sso account link after the matching user signs in', async () => {
    const runtime = await boot();
    const account = await runtime.db
      .rows<SaasAccount>('saas_accounts')
      .where('email')
      .equals(EMAIL)
      .first();
    if (!account) throw new Error('The auth fixture account was not created');
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
    await waitFor(() => expect(location.hash).toContain('#/oauth/google/link?email='));

    await runtime.session.signIn(account.personaId);
    cleanup();
    render(AuthHarness, { props: { runtime, screen: 'oauth-link', scenarios } });
    expect(screen.getByText(EMAIL)).toBeTruthy();
    await submit('Continue to consent');
    await waitFor(() => expect(location.hash).toContain('#/oauth/google/consent?state='));
    cleanup();
    render(AuthHarness, { props: { runtime, screen: 'oauth-consent', scenarios } });
    await submit('Approve');
    await waitFor(async () => {
      const linked = await runtime.db.rows<SaasAccount>('saas_accounts').get(account.id);
      expect(linked?.providers.some((item) => item.provider === 'google')).toBe(true);
    });
  });

  it('shows inline sign-up validation, then hands off to the simulated inbox', async () => {
    const runtime = await boot();
    render(AuthHarness, { props: { runtime, screen: 'sign-up' } });
    await type('Name', 'Olivia Hart');
    await type('Email', 'olivia@gmail.com');
    await type('Password', 'throwaway password');
    await submit('Create account');
    expect(await screen.findByText(/Use a fictional address/)).toBeTruthy();
    expect(
      await runtime.db
        .rows<SaasAccount>('saas_accounts')
        .where('email')
        .equals('olivia@gmail.com')
        .first()
    ).toBeUndefined();

    await type('Email', 'olivia@example.com');
    await submit('Create account');
    expect((await screen.findByTestId('auth-handoff')).textContent).toMatch(
      /Check your simulated inbox/
    );
    expect(await runtime.db.rows('saas_tokens').where('kind').equals('verify-email').count()).toBe(
      1
    );
  });

  it('routes password sign-in through MFA and opens the session only after the challenge', async () => {
    const runtime = await boot();
    expect(
      saasRoutes({ session: runtime.session }).find((route) => route.path === '/auth/mfa')?.guard
    ).toBeUndefined();
    const account = await runtime.db
      .rows<SaasAccount>('saas_accounts')
      .where('email')
      .equals(EMAIL)
      .first();
    if (!account) throw new Error('The auth fixture account was not created');
    await runtime.session.signIn(account.personaId);
    const mfa = createMfaServices(runtime);
    const enrollment = await mfa.enroll();
    await mfa.confirmEnroll(enrollment.currentCode);
    await runtime.session.signOut();

    render(AuthHarness, { props: { runtime, screen: 'sign-in' } });
    await type('Email', EMAIL);
    await type('Password', PASSWORD);
    await submit('Sign in');
    await waitFor(() => expect(location.hash).toContain('#/auth/mfa?account='));
    expect(runtime.session.isSignedIn()).toBe(false);

    cleanup();
    render(AuthHarness, { props: { runtime, screen: 'mfa' } });
    await screen.findByTestId('auth-simulated-code');
    await type('Authenticator code', mfa.authenticatorPanel(enrollment.mfa.seed).code);
    await submit('Verify and sign in');
    await waitFor(() => expect(runtime.session.isSignedIn()).toBe(true));
  });

  it('preserves settings next paths through password sign-in and its MFA challenge', async () => {
    const runtime = await boot();
    const account = await runtime.db
      .rows<SaasAccount>('saas_accounts')
      .where('email')
      .equals(EMAIL)
      .first();
    if (!account) throw new Error('The auth fixture account was not created');
    await runtime.session.signIn(account.personaId);
    const mfa = createMfaServices(runtime);
    const enrollment = await mfa.enroll();
    await mfa.confirmEnroll(enrollment.currentCode);
    await runtime.session.signOut();

    const linkPath = `/oauth/google/link?email=${encodeURIComponent(EMAIL)}`;
    location.hash = `#/sign-in?next=${encodeURIComponent(linkPath)}`;
    render(AuthHarness, { props: { runtime, screen: 'sign-in' } });
    await type('Email', EMAIL);
    await type('Password', PASSWORD);
    await submit('Sign in');
    await waitFor(() => expect(location.hash).toContain('#/auth/mfa?account='));
    expect(new URLSearchParams(location.hash.split('?')[1]).get('next')).toBe(linkPath);

    cleanup();
    render(AuthHarness, { props: { runtime, screen: 'mfa' } });
    await screen.findByTestId('auth-simulated-code');
    await type('Authenticator code', mfa.authenticatorPanel(enrollment.mfa.seed).code);
    await submit('Verify and sign in');
    await waitFor(() => expect(location.hash).toContain('#/oauth/google/link?email='));
    expect(runtime.session.isSignedIn()).toBe(true);
  });

  it('consumes the inbox magic-link token and signs the account in', async () => {
    const runtime = await boot();
    const issued = await createMagicLinkServices(runtime).issue({ email: EMAIL });
    location.hash = `#/auth/magic?token=${issued.token!.id}`;
    render(AuthHarness, { props: { runtime, screen: 'magic' } });
    await waitFor(() => expect(runtime.session.isSignedIn()).toBe(true));
    expect(runtime.session.principal()?.persona.id).toBe(
      issued.token?.accountId &&
        (await runtime.db.rows<SaasAccount>('saas_accounts').get(issued.token.accountId))?.personaId
    );
    expect(location.hash).toBe('#/');
  });

  it('hands off magic-link and password-reset requests without revealing unknown accounts', async () => {
    const runtime = await boot();
    render(AuthHarness, { props: { runtime, screen: 'magic' } });
    await type('Email', 'unknown@example.com');
    await submit('Send sign-in link');
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/Check your simulated inbox/)
    );
    expect(
      await runtime.db.rows('saas_tokens').where('email').equals('unknown@example.com').count()
    ).toBe(0);

    cleanup();
    render(AuthHarness, { props: { runtime, screen: 'reset' } });
    await type('Email', 'unknown@example.com');
    await submit('Send reset link');
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/Check your simulated inbox/)
    );
    expect(
      await runtime.db.rows('saas_tokens').where('email').equals('unknown@example.com').count()
    ).toBe(0);
  });

  it('consumes reset and verification links with visible completion states', async () => {
    const runtime = await boot();
    const resetToken = await createPasswordResetServices(runtime).request({ email: EMAIL });
    location.hash = `#/auth/reset?token=${resetToken.token!.id}`;
    render(AuthHarness, { props: { runtime, screen: 'reset' } });
    await type('New password', 'updated simulated password');
    await type('Confirm password', 'updated simulated password');
    await submit('Save new password');
    expect(await screen.findByText(/password was updated/i)).toBeTruthy();
    expect(
      (await runtime.db.rows<SaasAccount>('saas_accounts').where('email').equals(EMAIL).first())
        ?.simulatedPassword
    ).toBe('updated simulated password');

    cleanup();
    const signup = await createAuthServices(runtime).signUp({
      name: 'Grace Hopper',
      email: 'grace@example.com',
      password: PASSWORD,
    });
    const verify = await runtime.db
      .rows('saas_tokens')
      .where('email')
      .equals(signup.account.email)
      .first();
    if (!verify) throw new Error('The verification token was not issued');
    location.hash = `#/auth/verify?token=${verify.id}`;
    render(AuthHarness, { props: { runtime, screen: 'verify' } });
    await submit('Confirm email');
    expect((await screen.findByTestId('auth-handoff')).textContent).toMatch(/account is ready/i);
    expect(
      (
        await runtime.db
          .rows<SaasAccount>('saas_accounts')
          .where('email')
          .equals(signup.account.email)
          .first()
      )?.emailVerified
    ).toBe(true);
  });

  it('shows offline errors and does not fake a successful account creation', async () => {
    const runtime = await boot();
    runtime.environment.set({ network: 'offline' });
    render(AuthHarness, { props: { runtime, screen: 'sign-up' } });
    await type('Name', 'Olivia Hart');
    await type('Email', 'olivia@example.com');
    await type('Password', 'throwaway password');
    await submit('Create account');
    expect((await screen.findByRole('alert')).textContent).toMatch(/offline/i);
    expect(
      await runtime.db
        .rows<SaasAccount>('saas_accounts')
        .where('email')
        .equals('olivia@example.com')
        .first()
    ).toBeUndefined();
  });
});
