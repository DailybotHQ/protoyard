import type { RouteMatch } from '@protoyard/renderer-svelte';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SaasContext } from '../src/context.ts';
import { requireAuth, requireCapability, requireOnboarded } from '../src/guards.ts';
import type {
  SaasPorts,
  SessionPort,
  SessionPrincipal,
  WorkspaceEntry,
  WorkspacesPort,
} from '../src/ports.ts';
import PortsHarness from './fixtures/PortsHarness.svelte';

afterEach(() => {
  cleanup();
  location.hash = '';
});

/** A product's own session and workspaces: plain objects, no Protoyard runtime. */
function plainProduct() {
  const organizations = [
    { id: 'org-north', name: 'North Clinic' },
    { id: 'org-south', name: 'South Clinic' },
  ];
  let principal: SessionPrincipal | null = null;
  const listeners = new Set<(next: SessionPrincipal | null) => void>();
  const emit = () => {
    for (const listener of listeners) listener(principal);
  };
  const session: SessionPort = {
    isSignedIn: () => principal !== null,
    principal: () => principal,
    can: (capability) => principal !== null && capability === 'reports:read',
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const workspaces: WorkspacesPort = {
    list: (): WorkspaceEntry[] => organizations.map((organization) => ({ organization })),
    switchTo: vi.fn(async (id: string) => {
      const organization = organizations.find((entry) => entry.id === id);
      if (!principal || !organization) throw new Error('Unknown workspace');
      principal = { ...principal, organization };
      emit();
    }),
    create: vi.fn(async ({ name }: { name: string }) => {
      const organization = { id: `org-${organizations.length + 1}`, name };
      organizations.push(organization);
      if (principal) principal = { ...principal, organization };
      emit();
      return { organization };
    }),
  };
  const signIn = () => {
    principal = {
      id: 'person-ada',
      name: 'Ada Example',
      email: 'ada@example.com',
      organization: organizations[0] ?? null,
    };
    emit();
  };
  const ports: SaasPorts = {
    session,
    now: () => Date.parse('2026-03-02T09:00:00Z'),
    workspaces,
    oauth: { start: vi.fn(async () => ({ route: '#/oauth/consent?state=s-1' })) },
  };
  return {
    ports,
    signIn,
    workspaces,
    setPrincipal: (next: SessionPrincipal | null) => (principal = next),
  };
}

const match = (path: string): RouteMatch => ({
  path,
  params: {},
  query: new URLSearchParams(),
  route: null,
});

describe('saas-ui on ports (ADR-046)', () => {
  it('signs in and switches workspace through a plain adapter', async () => {
    const product = plainProduct();
    render(PortsHarness, { ports: product.ports, signIn: product.signIn });

    await fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    const trigger = await screen.findByTestId('workspace-switcher-trigger');
    expect(trigger.textContent).toContain('North Clinic');

    await fireEvent.click(trigger);
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'South Clinic' }));
    expect(product.workspaces.switchTo).toHaveBeenCalledWith('org-south');
    await waitFor(() =>
      expect(screen.getByTestId('workspace-switcher-trigger').textContent).toContain('South Clinic')
    );
  });

  it('starts provider sign-in through the OAuth port', async () => {
    const product = plainProduct();
    render(PortsHarness, { ports: product.ports, signIn: product.signIn });
    await fireEvent.click(screen.getByRole('button', { name: /Continue with Google/ }));
    await waitFor(() => expect(location.hash).toBe('#/oauth/consent?state=s-1'));
    expect(product.ports.oauth?.start).toHaveBeenCalledWith('google', 'sign-in');
  });

  it('says which screens need the engine instead of failing obscurely', () => {
    const product = plainProduct();
    let ctx: SaasContext | undefined;
    render(PortsHarness, {
      ports: product.ports,
      signIn: product.signIn,
      onContext: (value: SaasContext) => (ctx = value),
    });
    expect(ctx?.ports).toBe(product.ports);
    expect(() => ctx?.runtime).toThrow(/needs the simulated engine/);
    expect(ctx?.requireAccount({ reason: 'Save a report', next: '/reports' })).toBe(false);
  });

  it('runs the route guards on a session port', () => {
    const product = plainProduct();
    const { session } = product.ports;
    expect(requireAuth(session)(match('/reports'))).toMatch(/^\/sign-in/);
    product.setPrincipal({ id: 'person-ada', onboardingComplete: false });
    expect(requireAuth(session)(match('/reports'))).toBe(true);
    expect(requireOnboarded(session)(match('/reports'))).toBe('/onboarding');
    product.setPrincipal({ id: 'person-ada' });
    expect(requireOnboarded(session)(match('/reports'))).toBe(true);
    expect(requireCapability(session, 'reports:read')(match('/reports'))).toBe(true);
    expect(requireCapability(session, 'billing:manage')(match('/billing'))).toBe('/');
  });
});
