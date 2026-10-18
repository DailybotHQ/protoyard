import type { Principal } from '@protoyard/core';
import {
  createRouter,
  nextPath,
  type RouteMatch,
  redirectWithNext,
} from '@protoyard/renderer-svelte';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import KitPlaceholder from '../src/components/KitPlaceholder.svelte';
import { resolveSaasUiConfig } from '../src/config.ts';
import {
  requireAuth,
  requireCapability,
  requireGuest,
  requireOnboarded,
  type SaasSessionLike,
} from '../src/guards.ts';
import { requireSaasApp, resolveEagerSaasScreens, saasRoutes } from '../src/routes.ts';
import ProvideSaasHarness from './fixtures/ProvideSaasHarness.svelte';

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

describe('resolveSaasUiConfig', () => {
  it('fills defaults and accepts path overrides', () => {
    expect(resolveSaasUiConfig()).toMatchObject({
      signInPath: '/sign-in',
      signUpPath: '/sign-up',
      onboardingPath: '/onboarding',
      homePath: '/',
      inboxPath: '/inbox',
      lazy: true,
    });
    expect(resolveSaasUiConfig({ signInPath: '/login', lazy: false }).signInPath).toBe('/login');
  });
});

describe('guards', () => {
  it('requireAuth redirects signed-out visitors with next', () => {
    const guard = requireAuth(fakeSession({ signedIn: false }));
    expect(guard(match('/settings', 'tab=team'))).toBe(
      redirectWithNext('/sign-in', match('/settings', 'tab=team'))
    );
    expect(requireAuth(fakeSession({ signedIn: true }))(match('/settings'))).toBe(true);
  });

  it('requireOnboarded sends incomplete personas to the wizard', () => {
    const incomplete = requireOnboarded(fakeSession({ signedIn: true, onboardingComplete: false }));
    expect(incomplete(match('/app'))).toBe('/onboarding');
    expect(
      requireOnboarded(fakeSession({ signedIn: true, onboardingComplete: true }))(match('/app'))
    ).toBe(true);
    expect(requireOnboarded(fakeSession({ signedIn: false }))(match('/app'))).toContain('/sign-in');
  });

  it('requireCapability checks the simulated policy', () => {
    const member = fakeSession({ signedIn: true, capabilities: ['inbox:read'] });
    expect(requireCapability(member, 'inbox:read')(match('/inbox'))).toBe(true);
    expect(requireCapability(member, 'billing:manage')(match('/billing'))).toBe('/');
    expect(
      requireCapability(fakeSession({ signedIn: false }), 'inbox:read')(match('/inbox'))
    ).toContain('/sign-in');
  });

  it('requireGuest continues to next after sign-in', () => {
    const signedIn = fakeSession({ signedIn: true });
    const m = match('/sign-in');
    m.query.set('next', '/settings');
    expect(requireGuest(signedIn)(m)).toBe('/settings');
    expect(requireGuest(fakeSession({ signedIn: false }))(match('/sign-in'))).toBe(true);
    expect(nextPath(new URLSearchParams('next=/home'))).toBe('/home');
  });
});

describe('saasRoutes', () => {
  it('returns lazy load routes for the kit with unique paths', () => {
    const session = fakeSession({ signedIn: false });
    const routes = saasRoutes({ session, lazy: true });
    expect(routes.length).toBeGreaterThanOrEqual(8);
    const paths = routes.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const route of routes) {
      expect(route.load).toBeTypeOf('function');
      expect(route.component).toBeUndefined();
    }
    expect(paths).toContain('/sign-in');
    expect(paths).toContain('/inbox');
    expect(paths).toContain('/onboarding');
    expect(paths).toContain('/oauth/:provider/consent');
    expect(paths).toContain('/oauth/:provider/link');
    expect(paths).toContain('/settings/:tab?');
  });

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

  it('respects include and path overrides', () => {
    const routes = saasRoutes({
      session: fakeSession({ signedIn: true }),
      include: ['inbox'],
      inboxPath: '/mail',
    });
    expect(routes.map((r) => r.path)).toEqual(['/mail']);
  });

  it('requireSaasApp combines auth and onboarding', () => {
    expect(
      requireSaasApp(fakeSession({ signedIn: true, onboardingComplete: false }))(match('/'))
    ).toBe('/onboarding');
    expect(requireSaasApp(fakeSession({ signedIn: true }))(match('/'))).toBe(true);
  });

  it('resolveEagerSaasScreens loads every scaffold screen module', async () => {
    const screens = await resolveEagerSaasScreens();
    expect(Object.keys(screens).sort()).toEqual(
      [
        'billingCheckout',
        'billingPlans',
        'billingPortal',
        'inbox',
        'magicLink',
        'mfa',
        'oauthConsent',
        'oauthLink',
        'onboarding',
        'resetPassword',
        'settings',
        'signIn',
        'signUp',
        'verifyEmail',
      ].sort()
    );
    expect(screens.signIn).toBeTypeOf('function');
  });
});

describe('provideSaas + KitPlaceholder', () => {
  it('provides kit context to children', async () => {
    render(ProvideSaasHarness);
    expect(screen.getByTestId('saas-home').textContent).toBe('/');
    expect(screen.getByTestId('saas-sign-in').textContent).toBe('/sign-in');
  });

  it('renders the scaffold placeholder card', () => {
    render(KitPlaceholder, {
      title: 'Sign in',
      description: 'Simulated sign-in screen (scaffold).',
    });
    expect(screen.getByText('Sign in')).toBeTruthy();
    expect(screen.getByText(/Simulation only/)).toBeTruthy();
  });
});
