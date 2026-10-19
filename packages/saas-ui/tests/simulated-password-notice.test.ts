import {
  definePolicy,
  definePrototype,
  type PrototypeDefinition,
  parseManifest,
} from '@protoyard/core';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  createInvitationServices,
  createPasswordResetServices,
  type SaasAccount,
  saasIntegrity,
  saasStores,
  saasTables,
} from '../../saas/src/index.ts';
import { generateTeam } from '../../scenarios/src/index.ts';
import AuthHarness from './fixtures/AuthHarness.svelte';
import InviteAcceptHarness from './fixtures/InviteAcceptHarness.svelte';

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

  it('sign up shows the plain-text notice and turns autocomplete off', async () => {
    const { runtime } = await boot();
    render(AuthHarness, { props: { runtime, screen: 'sign-up' } });
    expect(screen.getByText(NOTICE)).toBeTruthy();
    expectNoPasswordManagerHints(1);
  });

  it('reset password no longer claims nothing is stored', async () => {
    const { runtime } = await boot();
    const issued = await createPasswordResetServices(runtime).request({ email: EMAIL });
    location.hash = `#/auth/reset?token=${issued.token?.id}`;
    render(AuthHarness, { props: { runtime, screen: 'reset' } });
    await screen.findByLabelText(/^New password/);
    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/no real credential is stored/);
    expectNoPasswordManagerHints(2);
  });

  it('settings security shows the notice under the password fields', async () => {
    const { runtime, owner } = await boot();
    await runtime.session.signIn(owner.personaId);
    render(AuthHarness, { props: { runtime, screen: 'settings', tab: 'security' } });
    await screen.findByLabelText(/^New simulated password/);
    const notice = screen.getByText(NOTICE);
    expect(notice.closest('form')?.querySelectorAll('input[type="password"]')).toHaveLength(2);
    expectNoPasswordManagerHints(2);
  });

  it('invitation accept shows the notice on its password field', async () => {
    const { runtime, owner } = await boot();
    await runtime.session.signIn(owner.personaId);
    const created = await createInvitationServices(runtime).create({
      email: 'new-invitee@example.com',
      role: 'member',
    });
    await runtime.session.signOut();
    location.hash = `#/invites/accept?token=${created.token.id}`;
    render(InviteAcceptHarness, { runtime });
    const field = await screen.findByLabelText(/^Password \(optional\)/);
    expect(field.getAttribute('aria-describedby') ?? '').not.toBe('');
    expect(screen.getByText(NOTICE)).toBeTruthy();
    expectNoPasswordManagerHints(1);
  });
});
