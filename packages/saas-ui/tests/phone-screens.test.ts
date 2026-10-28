import {
  definePolicy,
  definePrototype,
  type PrototypeDefinition,
  parseManifest,
} from '@protoyard/core';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import { generateTeam } from '@protoyard/scenarios';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  createPhoneServices,
  PHONE_CODE_TOAST_ID,
  saasIntegrity,
  saasStores,
  saasTables,
} from '../../saas/src/index.ts';
import { toast } from '../../ui/src/index.ts';
import AuthHarness from './fixtures/AuthHarness.svelte';

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
const type = (label: string, value: string) =>
  fireEvent.input(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });

describe('simulated phone sign-in screens', () => {
  it('issues a local simulated code and navigates to its challenge', async () => {
    const runtime = await boot();
    location.hash = '#/auth/phone?next=%2Fworkspace';
    render(AuthHarness, { props: { runtime, screen: 'phone-sign-in' } });
    await type('Name', 'Jordan Example');
    await type('Phone number', '+1 202 555 0104');
    await fireEvent.click(screen.getByRole('button', { name: 'Send simulated code' }));

    await waitFor(() => expect(location.hash).toContain('#/auth/phone/code?challenge='));
    expect(screen.getByTestId('auth-phone-sign-in')).toBeTruthy();
    expect(toast.items.find((item) => item.id === PHONE_CODE_TOAST_ID)?.description).toMatch(
      /Your code is \d{6}\. No SMS was sent\./
    );
    expect(runtime.session.isSignedIn()).toBe(false);
  });

  it('verifies through OtpInput, opens a session and closes the code toast', async () => {
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
    await fireEvent.input(screen.getByLabelText('Six-digit phone code'), {
      target: { value: issued.code },
    });
    await waitFor(() => expect(runtime.session.isSignedIn()).toBe(true));
    expect(runtime.session.principal()?.persona.name).toBe('Morgan Example');
    await waitFor(() => expect(location.hash).toBe('#/workspace'));
    expect(toast.items.some((item) => item.id === PHONE_CODE_TOAST_ID)).toBe(false);
  });

  it('adds phone routes to the lazy public SaaS auth group', async () => {
    const runtime = await boot();
    const { saasRoutes } = await import('../src/routes.ts');
    const routes = saasRoutes({ session: runtime.session });
    expect(routes.find((route) => route.path === '/auth/phone')?.load).toBeTypeOf('function');
    expect(routes.find((route) => route.path === '/auth/phone/code')?.load).toBeTypeOf('function');
    expect(routes.find((route) => route.path === '/auth/phone')?.guard).toBeUndefined();
  });
});
