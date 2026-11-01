import {
  definePolicy,
  definePrototype,
  type PrototypeDefinition,
  parseManifest,
} from '@protoyard/core';
import { type ProtoyardRuntime } from '@protoyard/runtime';
import { generateTeam } from '@protoyard/scenarios';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { SchemaForm } from '@texuli/forms';
import { validateFormSchema } from '@texuli/forms/model';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  createAuthServices,
  createInvitationServices,
  createMfaServices,
  createPhoneServices,
  PHONE_CODE_TOAST_ID,
  type SaasAccount,
  saasIntegrity,
  saasStores,
  saasTables,
} from '../../saas/src/index.ts';
import { toast } from '../../ui/src/index.ts';
import { saasRoutes } from '../src/routes.ts';
import AuthHarness from './fixtures/AuthHarness.svelte';
import DisabledOnMountHarness from './fixtures/DisabledOnMountHarness.svelte';
import InviteAcceptHarness from './fixtures/InviteAcceptHarness.svelte';

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
// Controls only: a Texuli form is named by its title, which can start with the same word.
const type = (label: string, value: string) =>
  fireEvent.input(screen.getByLabelText(new RegExp(`^${label}`), { selector: 'input, textarea' }), {
    target: { value },
  });
const submit = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('auth screens', () => {
  it('settings profile tab validates and saves persona details', async () => {
    const runtime = await boot();
    await signInFixture(runtime);
    render(AuthHarness, { props: { runtime, screen: 'settings', tab: 'profile' } });
    await type('Display name', 'Ada Byron');
    await type('Time zone', 'America/Bogota');
    // The avatar color is Texuli's color picker (loaded on first use); a preset swatch picks Blue.
    await fireEvent.click(await screen.findByRole('button', { name: /^Blue/ }));
    await submit('Save profile');
    await waitFor(() => expect(runtime.session.principal()?.persona.name).toBe('Ada Byron'));
    expect(runtime.session.principal()?.persona.timezone).toBe('America/Bogota');
    expect(runtime.session.principal()?.persona.avatarColor).toBe('#3b82f6');
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

  it('shows inline sign-up validation, then hands off to the simulated inbox', async () => {
    const runtime = await boot();
    render(AuthHarness, { props: { runtime, screen: 'sign-up' } });
    await type('Name', 'Olivia Hart');
    await type('Email', 'olivia@gmail.com');
    await type('Password', 'throwaway password');
    await submit('Create account');
    // The service issue lands inline on the email field (and in the error summary).
    await waitFor(() => {
      const email = screen.getByLabelText(/^Email/, { selector: 'input' });
      expect(email.getAttribute('aria-invalid')).toBe('true');
      const described = (email.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ');
      expect(described).toMatch(/Use a fictional address/);
    });
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
    await waitFor(() => expect(location.hash).toContain('#/auth/mfa?challenge='));
    expect(runtime.session.isSignedIn()).toBe(false);

    cleanup();
    render(AuthHarness, { props: { runtime, screen: 'mfa' } });
    await screen.findByTestId('auth-simulated-code');
    await type('Authenticator code', mfa.authenticatorPanel(enrollment.mfa.seed).code);
    await submit('Verify and sign in');
    // The session opens inside the service; the screen navigates only after it resolves.
    // Wait for that navigation so no continuation leaks into the next test.
    await waitFor(() => expect(location.hash).toBe('#/'));
    expect(runtime.session.isSignedIn()).toBe(true);
  });

  it('shows offline errors and does not fake a successful account creation', async () => {
    const runtime = await boot();
    runtime.environment.set({ network: 'offline' });
    render(AuthHarness, { props: { runtime, screen: 'sign-up' } });
    await type('Name', 'Olivia Hart');
    await type('Email', 'olivia@example.com');
    await type('Password', 'throwaway password');
    await submit('Create account');
    // The Texuli error summary takes focus and lists the service message.
    expect((await screen.findByText(/offline/i)).closest('.tx-forms__summary')).toBeTruthy();
    expect(
      await runtime.db
        .rows<SaasAccount>('saas_accounts')
        .where('email')
        .equals('olivia@example.com')
        .first()
    ).toBeUndefined();
  });
});

describe('kit forms on @texuli/forms', () => {
  it('puts the invitation service issue on the email field, then clears it after a sent invite', async () => {
    const runtime = await boot();
    await signInFixture(runtime);
    render(AuthHarness, { props: { runtime, screen: 'settings', tab: 'members' } });
    const form = document.querySelector('form[data-py-saas-form="invite"]') as HTMLFormElement;
    expect(form.classList.contains('tx-forms')).toBe(true);
    await type('Invite email', 'someone@real-company.test');
    await submit('Invite');
    const emailField = form.querySelector('[data-tx-forms-field="email"]') as HTMLElement;
    await waitFor(() => expect(emailField.textContent).toMatch(/example\.com/));
    expect(
      await runtime.db
        .rows('saas_invitations')
        .where('email')
        .equals('someone@real-company.test')
        .count()
    ).toBe(0);

    await type('Invite email', 'second@example.com');
    await submit('Invite');
    await screen.findByText(/second@example.com · member/);
    await waitFor(() =>
      expect((screen.getByLabelText(/^Invite email/) as HTMLInputElement).value).toBe('')
    );
  });
});

// --- merged from mfa-challenge.test.ts ---

describe('mfa-challenge', () => {
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
      const verify = screen.getByRole('button', {
        name: 'Verify and sign in',
      }) as HTMLButtonElement;
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
  });
});

// --- merged from phone-screens.test.ts ---

describe('phone-screens', () => {
  const REFERENCE_TIME = '2026-06-01T09:00:00.000Z';
  const definition: PrototypeDefinition = definePrototype({
    manifest: parseManifest({
      id: 'example.saas-ui-phone',
      slug: 'saas-ui-phone',
      name: 'SaaS phone UI fixture',
      version: '0.1.0',
      defaultScenario: 'visitor',
      defaultTheme: 'violet',
      storage: { namespace: 'saas-ui-phone', schemaVersion: 1 },
      scenarios: ['visitor'],
    }),
    auth: { signedOutByDefault: true },
    database: { versions: [{ version: 1, stores: saasStores() }] },
    scenarios: [
      {
        id: 'visitor',
        extends: 'active-month',
        name: 'Signed-out visitor',
        seed: 321,
        referenceTime: REFERENCE_TIME,
      },
    ],
    policy: definePolicy({ roles: { owner: ['*'], admin: ['*'], member: [], viewer: [] } }),
    integrity: saasIntegrity(),
    generate(ctx) {
      const team = generateTeam(ctx);
      return {
        organizations: team.organizations,
        personas: team.personas,
        memberships: team.memberships,
        tables: saasTables(),
      };
    },
  });

  type Db = ProtoyardRuntime['db'];
  let harness = createHarness<Db>(definition);
  afterEach(() => {
    cleanup();
    toast.dismiss();
    harness.closeAll();
    harness = createHarness<Db>(definition);
    location.hash = '';
  });

  const boot = async () => (await harness.boot('visitor')) as ProtoyardRuntime;

  describe('simulated phone sign-in screens', () => {
    it('verifies the Texuli one-time code field, opens a session and closes the code toast', async () => {
      const runtime = await boot();
      const phone = createPhoneServices(runtime);
      const issued = await phone.sendCode({ phone: '+1 202 555 0105', name: 'Morgan Example' });
      toast.info('Simulated SMS code', {
        id: PHONE_CODE_TOAST_ID,
        duration: 0,
        description: `Your code is ${issued.code}. No SMS was sent.`,
      });
      location.hash = `#/auth/phone/code?challenge=${encodeURIComponent(issued.challengeId)}&next=%2Fworkspace`;
      render(AuthHarness, { props: { runtime, screen: 'phone-code' } });

      expect(await screen.findByTestId('auth-simulated-phone-code')).toBeTruthy();
      await fireEvent.input(screen.getByLabelText(/^Six-digit phone code/, { selector: 'input' }), {
        target: { value: issued.code },
      });
      await waitFor(() => expect(runtime.session.isSignedIn()).toBe(true));
      expect(runtime.session.principal()?.persona.name).toBe('Morgan Example');
      await waitFor(() => expect(location.hash).toBe('#/workspace'));
      expect(toast.items.some((item) => item.id === PHONE_CODE_TOAST_ID)).toBe(false);
    });
  });
});

// --- merged from invite-accept.test.ts ---

describe('invite-accept', () => {
  /**
   * Accepting a workspace invitation from the simulated inbox, on the REAL
   * runtime: guests and signed-in people, the role, sign-in, and every error state.
   */

  const REFERENCE_TIME = '2026-10-17T09:00:00.000Z';
  const OWNER_EMAIL = 'olivia@example.com';
  const definition: PrototypeDefinition = definePrototype({
    manifest: parseManifest({
      id: 'example.saas-ui-invites',
      slug: 'saas-ui-invites',
      name: 'Invite accept fixture',
      version: '0.1.0',
      defaultScenario: 'active',
      defaultTheme: 'violet',
      storage: { namespace: 'saas-ui-invites', schemaVersion: 1 },
      scenarios: ['active'],
    }),
    auth: { signedOutByDefault: true },
    database: { versions: [{ version: 1, stores: saasStores() }] },
    scenarios: [
      {
        id: 'active',
        extends: 'active-month',
        name: 'Active',
        seed: 731,
        referenceTime: REFERENCE_TIME,
      },
    ],
    policy: definePolicy({ roles: { owner: ['*'], admin: ['*'], member: [], viewer: [] } }),
    integrity: saasIntegrity(),
    generate(ctx) {
      const team = generateTeam(ctx);
      const owner = team.personas[0];
      if (!owner) throw new Error('fixture needs a persona');
      const account: SaasAccount = {
        id: ctx.ids.next('acct'),
        personaId: owner.id,
        email: OWNER_EMAIL,
        emailVerified: true,
        simulatedPassword: 'simulated password',
        providers: [],
        status: 'active',
        failedAttempts: 0,
        createdAt: owner.joinedAt,
        lastSignInAt: null,
      };
      return {
        organizations: team.organizations,
        personas: team.personas,
        memberships: team.memberships.map((m, i) => (i === 0 ? { ...m, role: 'owner' } : m)),
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

  /** Boots, signs the owner in, invites `email`, and returns the token (owner still signed in). */
  async function invite(email: string, role = 'admin', { signOut = true } = {}) {
    const runtime = (await harness.boot('active')) as ProtoyardRuntime;
    const owner = await runtime.db
      .rows<SaasAccount>('saas_accounts')
      .where('email')
      .equals(OWNER_EMAIL)
      .first();
    await runtime.session.signIn(owner?.personaId ?? '');
    const created = await createInvitationServices(runtime).create({ email, role });
    if (signOut) await runtime.session.signOut();
    location.hash = `#/invites/accept?token=${created.token.id}`;
    return { runtime, created, orgId: created.invitation.organizationId };
  }

  const accept = () => fireEvent.click(screen.getByRole('button', { name: 'Accept and join' }));

  describe('invite accept screen', () => {
    it('a guest joins with a new account, is signed in with the invited role and lands home', async () => {
      const { runtime, orgId } = await invite('hedy.lamarr@example.com', 'admin');
      render(InviteAcceptHarness, { runtime });
      expect(await screen.findByText(/invited hedy\.lamarr@example\.com to join as/)).toBeTruthy();
      expect(screen.getByText('admin')).toBeTruthy();
      await fireEvent.input(screen.getByLabelText(/^Your name/), {
        target: { value: 'Hedy Lamarr' },
      });
      await accept();
      await waitFor(() => expect(location.hash).toBe('#/'));
      expect(runtime.session.principal()).toMatchObject({
        persona: { name: 'Hedy Lamarr', email: 'hedy.lamarr@example.com' },
        organization: { id: orgId },
        role: 'admin',
      });
    });
  });
});

// --- merged from simulated-password-notice.test.ts ---

describe('simulated-password-notice', () => {
  /**
   * Simulated auth honesty (ADR-018, security audit F2): every screen that takes
   * a password says the truth — it is kept as plain text in this browser and in
   * exported snapshots — and no simulated password field asks a password
   * manager to save or fill a real credential.
   */

  const NOTICE =
    'Simulation only — do not use a real password. What you type is kept as plain text in this browser and in exported snapshots.';
  const EMAIL = 'ada@example.com';

  const definition: PrototypeDefinition = definePrototype({
    manifest: parseManifest({
      id: 'example.saas-ui-password-notice',
      slug: 'saas-ui-password-notice',
      name: 'Password notice fixture',
      version: '0.1.0',
      defaultScenario: 'active',
      defaultTheme: 'violet',
      storage: { namespace: 'saas-ui-password-notice', schemaVersion: 1 },
      scenarios: ['active'],
    }),
    auth: { signedOutByDefault: true },
    database: { versions: [{ version: 1, stores: saasStores() }] },
    scenarios: [
      {
        id: 'active',
        extends: 'active-month',
        name: 'Active',
        seed: 737,
        referenceTime: '2026-10-17T09:00:00.000Z',
      },
    ],
    policy: definePolicy({ roles: { owner: ['*'], admin: ['*'], member: [], viewer: [] } }),
    integrity: saasIntegrity(),
    generate(ctx) {
      const team = generateTeam(ctx);
      const owner = team.personas[0];
      if (!owner) throw new Error('fixture needs a persona');
      const account: SaasAccount = {
        id: ctx.ids.next('acct'),
        personaId: owner.id,
        email: EMAIL,
        emailVerified: true,
        simulatedPassword: 'simulated password',
        providers: [],
        status: 'active',
        failedAttempts: 0,
        createdAt: owner.joinedAt,
        lastSignInAt: null,
      };
      return {
        organizations: team.organizations,
        personas: team.personas,
        memberships: team.memberships.map((m, i) => (i === 0 ? { ...m, role: 'owner' } : m)),
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

  async function boot(): Promise<{ runtime: ProtoyardRuntime; owner: SaasAccount }> {
    const runtime = (await harness.boot('active')) as ProtoyardRuntime;
    const owner = await runtime.db
      .rows<SaasAccount>('saas_accounts')
      .where('email')
      .equals(EMAIL)
      .first();
    if (!owner) throw new Error('fixture account missing');
    return { runtime, owner };
  }

  function passwordInputs(): HTMLInputElement[] {
    return [...document.querySelectorAll<HTMLInputElement>('input[type="password"]')];
  }

  function expectNoPasswordManagerHints(expected: number): void {
    const inputs = passwordInputs();
    expect(inputs).toHaveLength(expected);
    for (const input of inputs) expect(input.getAttribute('autocomplete')).toBe('off');
  }

  describe('simulated password notice and autocomplete', () => {
    it('sign in shows the plain-text notice and turns autocomplete off', async () => {
      const { runtime } = await boot();
      render(AuthHarness, { props: { runtime, screen: 'sign-in' } });
      expect(screen.getByText(NOTICE)).toBeTruthy();
      expectNoPasswordManagerHints(1);
    });
  });
});

// --- merged from texuli-forms-gaps.test.ts ---

describe('texuli-forms-gaps', () => {
  afterEach(() => cleanup());

  const compiled = validateFormSchema(
    {
      title: 'Gap repro',
      submitLabel: 'Send',
      fields: [{ name: 'code', type: 'otp', label: 'Code', required: true, length: 6 }],
    },
    { tier: 'developer' }
  );
  if (!compiled.ok) throw new Error('The repro form is invalid');
  const form = compiled.form;

  describe('@texuli/forms fixes the SaaS kit relies on (Texuli 0.11.3)', () => {
    // G134: the MFA form mounts disabled and enables once its challenge loads.
    it('G134: a SchemaForm that mounts disabled enables again when the prop turns false', async () => {
      render(DisabledOnMountHarness, { props: { form } });
      const send = () => screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
      expect(send().disabled).toBe(true);
      await fireEvent.click(screen.getByRole('button', { name: 'Enable' }));
      expect(send().disabled).toBe(false);
    });

    // G131: the phone sign-in's number is a phone-format text field.
    it('G131: a phone-format text field opens the telephone keypad', () => {
      const phone = validateFormSchema({
        title: 'Phone',
        fields: [{ name: 'phone', type: 'text', format: 'phone', label: 'Phone number' }],
      });
      if (!phone.ok) throw new Error('The repro form is invalid');
      render(SchemaForm, { props: { form: phone.form } });
      const input = screen.getByLabelText(/^Phone number/, { selector: 'input' });
      expect(input.getAttribute('type')).toBe('tel');
      expect(input.getAttribute('inputmode')).toBe('tel');
    });
  });
});
