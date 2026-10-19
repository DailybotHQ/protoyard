import {
  type Membership,
  PermissionDeniedError,
  type Persona,
  SimulatedServiceError,
  ValidationError,
} from '@protoyard/core';
import type { RouteMatch } from '@protoyard/renderer-svelte';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import {
  createAuthServices,
  createBilling,
  createInbox,
  createOnboarding,
  createSettingsServices,
  type SaasInvoice,
  type SaasOnboarding,
  type SaasSessionLog,
  type SaasSubscription,
} from '@protoyard/saas';
import { resolveEagerSaasScreens } from '@protoyard/saas-ui';
import { createGenerateContext, PRESETS, resolveScenarios } from '@protoyard/scenarios';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { latticeOnboardingSteps } from '../src/domain/onboarding.ts';
import {
  createPendingInboxServices,
  PENDING_INBOX_UNAVAILABLE,
} from '../src/domain/pending-inbox.ts';
import { LATTICE_PLANS } from '../src/domain/plans.ts';
import { definition } from '../src/prototype.ts';
import { inboxGuard, LATTICE_SSO_PROVIDERS, latticeRoutes } from '../src/saas.ts';
import { generateB2bSaasWorld } from '../src/scenarios/generators.ts';
import Inbox from '../src/screens/Inbox.svelte';
import Onboarding from '../src/screens/Onboarding.svelte';
import AppHarness from './fixtures/AppHarness.svelte';
import LatticeHarness from './fixtures/LatticeHarness.svelte';

/**
 * Regression tests for the five Lattice fixes, on the real runtime
 * (in-memory IndexedDB) and the real kit screens.
 */

let harness = createHarness(definition);
afterEach(() => {
  cleanup();
  harness.closeAll();
  harness = createHarness(definition);
  location.hash = '';
});

const boot = async (scenario: string) =>
  (await harness.boot(scenario)) as unknown as ProtoyardRuntime;
const kitScreens = () => resolveEagerSaasScreens();
const field = (label: string) => screen.getByLabelText(new RegExp(`^${label}`));
const type = (label: string, value: string) => fireEvent.input(field(label), { target: { value } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const match = (path: string, query = ''): RouteMatch => ({
  route: null,
  params: {},
  path,
  query: new URLSearchParams(query),
});

async function signUpRowan(runtime: ProtoyardRuntime) {
  return createAuthServices(runtime).signUp({
    name: 'Rowan Example',
    email: 'rowan@example.com',
    password: 'simulated-pass',
  });
}

describe('bug 1: a pending sign-up opens its own verification inbox', () => {
  it('shows only the pending account messages, then refuses once the email is confirmed', async () => {
    const runtime = await boot('signed-out');
    const { account } = await signUpRowan(runtime);
    expect(runtime.session.isSignedIn()).toBe(false);

    const kitInbox = createInbox(runtime);
    const other = await kitInbox.deliver({
      recipient: 'owner@example.com',
      kind: 'notification',
      subject: 'Someone else',
      body: 'Not for Rowan.',
    });

    const pending = await createPendingInboxServices(runtime).open(account.id);
    expect(pending.email).toBe('rowan@example.com');
    const messages = await pending.service.list();
    expect(messages.map((message) => message.kind)).toEqual(['verify-email']);
    expect(messages.every((message) => message.recipient === 'rowan@example.com')).toBe(true);
    await expect(pending.service.list({ recipient: 'owner@example.com' })).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(await pending.service.get(other.id)).toBeUndefined();
    await expect(pending.service.markRead(other.id)).rejects.toThrow(
      'This message is not in your simulated inbox.'
    );
    await expect(pending.service.archive(other.id)).rejects.toBeInstanceOf(ValidationError);
    expect((await kitInbox.get(other.id))?.readAt).toBeNull();

    // The confirmation link from the pending inbox verifies the account.
    const href = messages[0]?.action?.href ?? '';
    expect(href).toMatch(/^#\/auth\/verify\?token=/);
    const token = new URLSearchParams(href.split('?')[1]).get('token') ?? '';
    await createAuthServices(runtime).verifyEmail(token);
    await expect(createPendingInboxServices(runtime).open(account.id)).rejects.toThrow(
      PENDING_INBOX_UNAVAILABLE
    );
  });

  it('refuses unknown and already verified accounts', async () => {
    const runtime = await boot('signed-out');
    const inboxes = createPendingInboxServices(runtime);
    await expect(inboxes.open('acct_missing')).rejects.toThrow(PENDING_INBOX_UNAVAILABLE);
    await expect(inboxes.open('')).rejects.toBeInstanceOf(ValidationError);
    const seeded = await createAuthServices(runtime).account('user_0001');
    expect(seeded?.emailVerified).toBe(true);
    await expect(inboxes.open(seeded?.id ?? '')).rejects.toThrow(PENDING_INBOX_UNAVAILABLE);
  });

  it('lets a signed-out visitor reach /inbox only with a pending account link', async () => {
    const runtime = await boot('signed-out');
    const guard = inboxGuard(runtime.session);
    expect(guard(match('/inbox', 'account=acct_u123'))).toBe(true);
    expect(guard(match('/inbox'))).toBe('/sign-in?next=%2Finbox');
    const route = latticeRoutes(runtime.session, {
      dashboard: Inbox,
      projects: Inbox,
    }).find((candidate) => candidate.path === '/inbox');
    expect(route?.guard?.(match('/inbox', 'account=acct_u123'))).toBe(true);
    await runtime.session.signIn('user_0001');
    expect(guard(match('/inbox'))).toBe(true);
  });

  it('sign-up links to the pending inbox, which opens the confirmation link', async () => {
    const runtime = await boot('signed-out');
    const { signUp } = await kitScreens();
    render(LatticeHarness, { runtime, view: signUp });
    await type('Name', 'Rowan Example');
    await type('Email', 'rowan@example.com');
    await type('Password', 'simulated-pass');
    await click('Create account');
    const link = await screen.findByRole('link', { name: 'Open simulated inbox' });
    const href = link.getAttribute('href') ?? '';
    expect(href).toMatch(/^#\/inbox\?account=acct_/);
    expect(screen.getByRole('link', { name: 'Return to sign in' }).getAttribute('href')).toBe(
      '#/sign-in'
    );

    cleanup();
    const query = new URLSearchParams(href.split('?')[1]);
    render(LatticeHarness, { runtime, view: Inbox, viewProps: { query } });
    await screen.findByText('Confirm your email for the prototype');
    expect(screen.queryByLabelText('Fictional inbox email')).toBeNull();
    expect(screen.getByTestId('inbox-locked-recipient').textContent).toContain('rowan@example.com');
    await click('Open Confirm email');
    await waitFor(() => expect(location.hash).toMatch(/^#\/auth\/verify\?token=/));
    expect(runtime.session.isSignedIn()).toBe(false);
  });
});

describe('bug 2: simulated SSO on the sign-in and sign-up screens', () => {
  it('offers "Continue with …" buttons labelled Simulated, with in-app links', async () => {
    const runtime = await boot('signed-out');
    const { signIn, signUp } = await kitScreens();
    render(LatticeHarness, { runtime, view: signIn });
    for (const name of ['Google', 'Microsoft', 'GitHub']) {
      expect(screen.getByRole('button', { name: `Continue with ${name}` })).toBeTruthy();
    }
    const labels = screen.getAllByTestId('sso-simulated-label');
    expect(labels).toHaveLength(LATTICE_SSO_PROVIDERS.length);
    expect(labels.every((label) => label.textContent?.trim() === 'Simulated')).toBe(true);
    expect(screen.getByText(/Simulated sign-in: no provider is contacted/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Create account' }).getAttribute('href')).toBe(
      '#/sign-up'
    );
    expect(screen.getByRole('link', { name: 'Forgot password?' }).getAttribute('href')).toBe(
      '#/auth/reset'
    );

    cleanup();
    render(LatticeHarness, { runtime, view: signUp });
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'I already have an account' }).getAttribute('href')
    ).toBe('#/sign-in');
  });

  it('runs the consent round trip and lands a new account in onboarding', async () => {
    const runtime = await boot('signed-out');
    const { signUp, oauthConsent } = await kitScreens();
    render(LatticeHarness, { runtime, view: signUp });
    await click('Continue with Google');
    await waitFor(() => expect(location.hash).toContain('#/oauth/google/consent?state='));

    cleanup();
    render(LatticeHarness, {
      runtime,
      view: oauthConsent,
      viewProps: { params: { provider: 'google' } },
    });
    expect(screen.getByText(/nothing leaves your browser/i)).toBeTruthy();
    await click('Approve');
    await waitFor(() => expect(location.hash).toBe('#/onboarding'), { timeout: 2000 });
    const principal = runtime.session.principal();
    expect(principal?.persona.email).toBe('google.user@example.com');
    expect(principal?.persona.onboardingComplete).toBe(false);
    const app = latticeRoutes(runtime.session, { dashboard: Inbox, projects: Inbox }).find(
      (route) => route.path === '/app'
    );
    expect(app?.guard?.(match('/app'))).toBe('/onboarding');
  });
});

describe('bug 3: every signed-in persona can sign out', () => {
  it('a viewer signs out from the header without settings:security', async () => {
    const runtime = await boot('viewer');
    await runtime.session.signIn('user_0001');
    expect(runtime.session.principal()?.membership?.role).toBe('viewer');
    expect(runtime.session.can('settings:security')).toBe(false);
    // "Sign out everywhere" in Security stays admin-only.
    await expect(createSettingsServices(runtime).signOutEverywhere()).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    expect(runtime.session.isSignedIn()).toBe(true);

    render(AppHarness, { runtime });
    await click('Sign out');
    await waitFor(() => expect(runtime.session.isSignedIn()).toBe(false));
    await waitFor(() => expect(location.hash).toBe('#/sign-in'));
    const log = await runtime.db.rows<SaasSessionLog>('saas_sessions_log').toArray();
    expect(log.some((row) => row.method === 'sign-out' && row.personaId === 'user_0001')).toBe(
      true
    );
  });

  it('a member sees the header sign-out too', async () => {
    const runtime = await boot('pending-invite');
    const member = runtime.session
      .memberships()
      .find((membership: Membership) => membership.role === 'member');
    if (!member) throw new Error('The scenario needs a member');
    await runtime.session.signIn(member.personaId);
    render(AppHarness, { runtime });
    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeTruthy();
  });
});

describe('bug 4: one price source for plans and seeded subscriptions', () => {
  it('seeds every subscription and invoice at the catalog price (integer cents)', () => {
    expect(definition.generatorVersion).toBe(2);
    let checked = 0;
    for (const scenario of resolveScenarios(definition.scenarios, PRESETS)) {
      const world = generateB2bSaasWorld(createGenerateContext(scenario));
      const subscriptions = (world.tables.saas_subscriptions ?? []) as SaasSubscription[];
      const invoices = (world.tables.saas_invoices ?? []) as SaasInvoice[];
      for (const subscription of subscriptions) {
        const plan = LATTICE_PLANS.find((candidate) => candidate.id === subscription.planId);
        expect(plan, `${scenario.id}: ${subscription.planId}`).toBeDefined();
        expect(subscription.unitAmountCents).toBe(plan?.unitAmountCents);
        expect(Number.isInteger(subscription.unitAmountCents)).toBe(true);
        for (const invoice of invoices.filter((row) => row.subscriptionId === subscription.id)) {
          expect(invoice.amountCents).toBe(subscription.unitAmountCents * subscription.seats);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('the billing engine quotes the seeded Pro subscription at the Pro plan price', async () => {
    const runtime = await boot('past-due');
    await runtime.session.signIn('user_0001');
    const billing = createBilling(runtime, LATTICE_PLANS);
    const subscription = await billing.subscription();
    expect(subscription?.planId).toBe('pro');
    const plan = billing.plans().find((candidate) => candidate.id === subscription?.planId);
    expect(subscription?.unitAmountCents).toBe(1900);
    expect(subscription?.unitAmountCents).toBe(plan?.unitAmountCents);
  });
});

describe('bug 5: onboarding steps commit atomically through the service pipeline', () => {
  async function ownerWizard() {
    const runtime = await boot('signed-out');
    await runtime.session.signIn('user_0001');
    const onboarding = createOnboarding(runtime, { steps: latticeOnboardingSteps(runtime) });
    return { runtime, onboarding };
  }
  const row = (runtime: ProtoyardRuntime) =>
    runtime.db.rows<SaasOnboarding>('saas_onboarding').get('user_0001');
  const personas = (runtime: ProtoyardRuntime) => runtime.db.rows<Persona>('py_personas').toArray();

  it('offline writes neither the profile nor the step', async () => {
    const { runtime, onboarding } = await ownerWizard();
    const before = runtime.session.principal()?.persona.name;
    runtime.environment.set({ network: 'offline' });
    await expect(
      onboarding.submit('profile', { fullName: 'Kai Example', jobTitle: 'Lead' })
    ).rejects.toBeInstanceOf(SimulatedServiceError);
    expect((await runtime.db.rows<Persona>('py_personas').get('user_0001'))?.name).toBe(before);
    expect(await row(runtime)).toBeUndefined();

    runtime.environment.set({ network: 'online' });
    const saved = await onboarding.submit('profile', { fullName: 'Kai Example', jobTitle: 'Lead' });
    expect(saved.completedSteps).toEqual(['profile']);
    expect(runtime.session.principal()?.persona).toMatchObject({
      name: 'Kai Example',
      title: 'Lead',
    });
  });

  it('a failed save keeps the workspace name and invites nobody', async () => {
    const { runtime, onboarding } = await ownerWizard();
    await onboarding.submit('profile', { fullName: 'Kai Example', jobTitle: '' });
    const organizationId = runtime.session.principal()?.organization?.id ?? '';
    const originalName = runtime.session.principal()?.organization?.name;

    // A partial outage of the wizard only (the old flow renamed first, then failed).
    runtime.environment.set({ failureMode: 'server-error', failureScope: ['onboarding.'] });
    await expect(onboarding.submit('workspace', { name: 'Renamed Studio' })).rejects.toBeInstanceOf(
      SimulatedServiceError
    );
    expect(runtime.session.principal()?.organization?.name).toBe(originalName);
    expect((await row(runtime))?.completedSteps).toEqual(['profile']);

    runtime.environment.reset();
    await onboarding.submit('workspace', { name: 'Renamed Studio' });
    expect(runtime.session.principal()?.organization?.name).toBe('Renamed Studio');

    const membersBefore = runtime.session.memberships().length;
    runtime.environment.set({ failureMode: 'server-error', failureScope: ['onboarding.'] });
    await expect(
      onboarding.submit('invite', { emails: ['sam.rivera@example.com'] })
    ).rejects.toBeInstanceOf(SimulatedServiceError);
    expect((await personas(runtime)).some((p) => p.email === 'sam.rivera@example.com')).toBe(false);
    expect(runtime.session.memberships()).toHaveLength(membersBefore);

    runtime.environment.reset();
    const ownEmail = runtime.session.principal()?.persona.email ?? '';
    await expect(
      onboarding.submit('invite', { emails: ['sam.rivera@example.com', ownEmail] })
    ).rejects.toBeInstanceOf(ValidationError);
    expect((await personas(runtime)).some((p) => p.email === 'sam.rivera@example.com')).toBe(false);

    const saved = await onboarding.submit('invite', { emails: ['sam.rivera@example.com'] });
    expect(saved.completedSteps).toEqual(['profile', 'workspace', 'invite']);
    const sam = (await personas(runtime)).find((p) => p.email === 'sam.rivera@example.com');
    expect(sam?.name).toBe('Sam Rivera');
    const membership = runtime.session
      .memberships()
      .find((m: Membership) => m.personaId === sam?.id && m.organizationId === organizationId);
    expect(membership?.role).toBe('member');
  });

  it('a viewer cannot rename or invite through the wizard, and nothing is written', async () => {
    const runtime = await boot('viewer');
    await runtime.session.signIn('user_0001');
    const onboarding = createOnboarding(runtime, { steps: latticeOnboardingSteps(runtime) });
    const persona = runtime.session.principal()?.persona;
    await onboarding.submit('profile', { fullName: persona?.name ?? '', jobTitle: '' });
    const before = await row(runtime);
    const name = runtime.session.principal()?.organization?.name ?? '';
    await expect(onboarding.submit('workspace', { name: 'Viewer Rename' })).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await expect(
      onboarding.submit('invite', { emails: ['new.person@example.com'] })
    ).rejects.toThrow(ValidationError);
    expect(runtime.session.principal()?.organization?.name).toBe(name);
    expect(await row(runtime)).toEqual(before);
    // Confirming the unchanged name read-only is allowed.
    await expect(onboarding.submit('workspace', { name })).resolves.toBeTruthy();
  });

  it('the wizard screen shows the offline error and leaves the profile unchanged', async () => {
    const { runtime } = await ownerWizard();
    const before = runtime.session.principal()?.persona.name;
    render(LatticeHarness, { runtime, view: Onboarding });
    await screen.findByRole('region', { name: /^Step 1 of 5/ });
    await type('Full name', 'Kai Example');
    runtime.environment.set({ network: 'offline' });
    await click(/^Next/);
    expect(await screen.findByText(/offline/i)).toBeTruthy();
    expect((await runtime.db.rows<Persona>('py_personas').get('user_0001'))?.name).toBe(before);
    expect(runtime.session.principal()?.persona.name).toBe(before);
    expect(await row(runtime)).toBeUndefined();
  });
});
