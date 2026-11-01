import {
  definePolicy,
  definePrototype,
  type Principal,
  type PrototypeDefinition,
  parseManifest,
} from '@protoyard/core';
import { createRouter, type RouteMatch } from '@protoyard/renderer-svelte';
import { createPrototypeRuntime, type ProtoyardRuntime } from '@protoyard/runtime';
import {
  type BillingService,
  createBilling,
  type InboxService,
  type SaasInboxMessage,
} from '@protoyard/saas';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  createInvitationServices,
  saasIntegrity,
  saasStores,
  saasTables,
} from '../../saas/src/index.ts';
import { generateTeam } from '../../scenarios/src/index.ts';
import { requireCapability, type SaasSessionLike } from '../src/guards.ts';
import { saasRoutes } from '../src/routes.ts';
import AuthHarness from './fixtures/AuthHarness.svelte';
import ProvideBillingHarness from './fixtures/ProvideBillingHarness.svelte';
import ProvideInboxHarness from './fixtures/ProvideInboxHarness.svelte';

afterEach(() => {
  cleanup();
  location.hash = '';
  document.title = '';
});

function match(path: string, query = ''): RouteMatch {
  return {
    route: null,
    path,
    params: {},
    query: new URLSearchParams(query),
  };
}

function fakeSession(state: {
  signedIn: boolean;
  onboardingComplete?: boolean;
  capabilities?: string[];
}): SaasSessionLike {
  const caps = new Set(state.capabilities ?? ['*']);
  return {
    isSignedIn: () => state.signedIn,
    principal: () =>
      state.signedIn
        ? ({
            persona: {
              id: 'user_1',
              name: 'Ada Example',
              locale: 'en-US',
              timezone: 'UTC',
              joinedAt: '2026-01-01T00:00:00.000Z',
              onboardingComplete: state.onboardingComplete ?? true,
              preferences: {},
            },
            organization: null,
            membership: null,
            role: 'owner',
            capabilities: caps,
          } as unknown as Principal)
        : null,
    can: (capability: string) => caps.has('*') || caps.has(capability),
  };
}

describe('guards', () => {
  it('requireCapability checks the simulated policy', () => {
    const member = fakeSession({ signedIn: true, capabilities: ['inbox:read'] });
    expect(requireCapability(member, 'inbox:read')(match('/inbox'))).toBe(true);
    expect(requireCapability(member, 'billing:manage')(match('/billing'))).toBe('/');
    expect(
      requireCapability(fakeSession({ signedIn: false }), 'inbox:read')(match('/inbox'))
    ).toContain('/sign-in');
  });
});

describe('saasRoutes', () => {
  it('guards inbox when signed out and allows it when signed in', async () => {
    location.hash = '#/';
    const session = fakeSession({ signedIn: false });
    const router = createRouter(saasRoutes({ session }));
    location.hash = '#/inbox';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await waitFor(() => expect(router.current.route?.path).toBe('/sign-in'));
    expect(router.current.query.get('next')).toBe('/inbox');
    router.destroy();

    const signedIn = fakeSession({ signedIn: true });
    const open = createRouter(saasRoutes({ session: signedIn }));
    location.hash = '#/inbox';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await waitFor(() => expect(open.current.route?.path).toBe('/inbox'));
    open.destroy();
  });
});

// --- merged from inbox.test.ts ---

describe('inbox', () => {
  afterEach(() => {
    cleanup();
    location.hash = '';
  });

  describe('Inbox UI', () => {
    it('renders message bodies as text rather than interpreting markup', async () => {
      const service = inboxService({ body: '<img src=x onerror=alert(1)>' });
      render(ProvideInboxHarness, {
        props: { service, recipient: 'ada@example.com', embedded: true },
      });
      expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeTruthy();
      expect(document.querySelector('img')).toBeNull();
    });
  });

  function inboxService(overrides: Partial<SaasInboxMessage> = {}): InboxService {
    const row: SaasInboxMessage = {
      id: 'message-1',
      recipient: 'ada@example.com',
      personaId: null,
      kind: 'magic-link',
      subject: 'Your simulated sign-in link',
      body: 'Use this in-app link to sign in.',
      action: { label: 'Sign in', href: '#/auth/magic?token=magic-demo' },
      at: '2026-10-17T12:00:00.000Z',
      readAt: null,
      archivedAt: null,
      ...overrides,
    };
    let current: SaasInboxMessage | undefined = row;
    const service: InboxService = {
      deliver: vi.fn(async () => row),
      write: vi.fn(async () => row),
      list: vi.fn(async ({ recipient } = {}) =>
        current && current.recipient === recipient && !current.archivedAt ? [current] : []
      ),
      get: vi.fn(async () => current),
      markRead: vi.fn(async () => {
        if (current) current = { ...current, readAt: '2026-10-17T12:01:00.000Z' };
        return current as SaasInboxMessage;
      }),
      archive: vi.fn(async () => {
        if (current) {
          current = {
            ...current,
            archivedAt: '2026-10-17T12:02:00.000Z',
            readAt: current.readAt ?? '2026-10-17T12:02:00.000Z',
          };
        }
        return current as SaasInboxMessage;
      }),
    };
    return service;
  }
});

// --- merged from billing.test.ts ---

describe('billing', () => {
  const REFERENCE_TIME = '2026-06-01T09:00:00.000Z';
  const CATALOG = [
    { id: 'starter', name: 'Starter', unitAmountCents: 10_000, interval: 'month' as const },
    { id: 'pro', name: 'Pro', unitAmountCents: 20_000, interval: 'month' as const },
  ];

  function definition(namespace: string): PrototypeDefinition {
    return definePrototype({
      manifest: parseManifest({
        id: `example.${namespace}`,
        slug: namespace,
        name: 'Billing UI fixture',
        version: '0.1.0',
        defaultScenario: 'active-month',
        storage: { namespace, schemaVersion: 2 },
        scenarios: ['active-month'],
      }),
      database: {
        versions: [
          { version: 1, stores: { projects: 'id' } },
          { version: 2, stores: saasStores() },
        ],
      },
      scenarios: [
        {
          id: 'active-month',
          extends: 'active-month',
          name: 'Active month',
          seed: 42,
          referenceTime: REFERENCE_TIME,
        },
      ],
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
  }

  const open: ProtoyardRuntime[] = [];
  afterEach(() => {
    cleanup();
    location.hash = '';
    for (const runtime of open.splice(0)) runtime.close();
  });

  async function boot(namespace: string): Promise<{
    runtime: ProtoyardRuntime;
    billing: BillingService;
  }> {
    const runtime = await createPrototypeRuntime(definition(namespace), {
      indexedDB: new IDBFactory() as unknown as globalThis.IDBFactory,
      IDBKeyRange,
      sleep: async () => {},
    });
    open.push(runtime);
    await runtime.scenarios.ensureSeeded();
    const billing = createBilling(runtime, CATALOG);
    return { runtime, billing };
  }

  describe('billing UI', () => {
    it('records a declined checkout without activating the paid plan', async () => {
      const { runtime, billing } = await boot('billing-ui-decline');
      await billing.startTrial({ planId: 'starter' });
      render(ProvideBillingHarness, {
        props: {
          runtime,
          billing,
          screen: 'checkout',
          showOutcomePicker: true,
          planId: 'pro',
        },
      });
      await screen.findByTestId('checkout-outcome-picker');
      await fireEvent.click(screen.getByRole('radio', { name: 'Declined' }));
      await fireEvent.click(screen.getByRole('button', { name: 'Confirm simulated payment' }));
      const result = await screen.findByTestId('checkout-result');
      expect(result.getAttribute('data-outcome')).toBe('declined');
      expect((await billing.subscription())?.planId).toBe('starter');
    });
  });
});

// --- merged from destructive-confirm.test.ts ---

describe('destructive-confirm', () => {
  /**
   * Settings > Members: Remove member and Revoke invitation are destructive, so
   * each opens an AlertDialog naming its target, never focused on the action. The
   * action runs only on confirm.
   */

  const definition: PrototypeDefinition = definePrototype({
    manifest: parseManifest({
      id: 'example.saas-ui-confirm',
      slug: 'saas-ui-confirm',
      name: 'Destructive confirmation fixture',
      version: '0.1.0',
      defaultScenario: 'active',
      defaultTheme: 'violet',
      storage: { namespace: 'saas-ui-confirm', schemaVersion: 1 },
      scenarios: ['active'],
    }),
    database: { versions: [{ version: 1, stores: saasStores() }] },
    scenarios: [
      {
        id: 'active',
        extends: 'active-month',
        name: 'Active workspace',
        seed: 733,
        referenceTime: '2026-10-17T09:00:00.000Z',
      },
    ],
    policy: definePolicy({ roles: { owner: ['*'], admin: ['*'], member: [], viewer: [] } }),
    integrity: saasIntegrity(),
    generate(ctx) {
      const team = generateTeam(ctx);
      return {
        organizations: team.organizations,
        personas: team.personas,
        memberships: team.memberships.map((membership, index) =>
          index === 0 ? { ...membership, role: 'owner' } : { ...membership, role: 'member' }
        ),
        tables: saasTables(),
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

  async function openMembers() {
    const runtime = (await harness.boot('active')) as ProtoyardRuntime;
    const owner = runtime.members.list().find((member) => member.membership.role === 'owner');
    if (!owner) throw new Error('The fixture needs an owner');
    await runtime.session.signIn(owner.persona.id);
    const target = runtime.members.list().find((member) => member.membership.role !== 'owner');
    if (!target) throw new Error('The fixture needs a removable member');
    await createInvitationServices(runtime).create({
      email: 'pending-invitee@example.com',
      role: 'member',
    });
    render(AuthHarness, { props: { runtime, screen: 'settings', tab: 'members' } });
    await screen.findByText(target.persona.name);
    await screen.findByText(/pending-invitee@example.com · member/);
    return { runtime, target };
  }

  const memberIds = (runtime: ProtoyardRuntime) =>
    runtime.members.list().map((member) => member.membership.id);

  function removeButtonFor(name: string): HTMLButtonElement {
    const row = screen.getByText(name).closest('li');
    if (!row) throw new Error(`No member row for ${name}`);
    return within(row).getByRole('button', { name: 'Remove' }) as HTMLButtonElement;
  }

  /**
   * Focus moves into the dialog and never starts on the destructive action, so
   * Enter or Space cannot confirm by accident. (The dialog focuses its
   * container; Cancel comes first in tab order.)
   */
  async function expectSafeInitialFocus(dialog: HTMLElement, confirmLabel: string): Promise<void> {
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: confirmLabel }));
    const buttons = [...dialog.querySelectorAll('button')].map((button) =>
      button.textContent?.trim()
    );
    expect(buttons.indexOf('Cancel')).toBeLessThan(buttons.indexOf(confirmLabel));
  }

  describe('members: destructive actions confirm first', () => {
    it('Remove opens a dialog naming the member, never focused on the action, and removes nothing yet', async () => {
      const { runtime, target } = await openMembers();
      const before = memberIds(runtime);
      const remove = removeButtonFor(target.persona.name);
      await waitFor(() => expect(remove.disabled).toBe(false));
      await fireEvent.click(remove);

      const dialog = await screen.findByRole('alertdialog');
      expect(dialog.textContent).toContain(`Remove ${target.persona.name}?`);
      await expectSafeInitialFocus(dialog, 'Remove member');
      expect(memberIds(runtime)).toEqual(before);
    });
  });
});
