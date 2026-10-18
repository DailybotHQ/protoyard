import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createRouter,
  MAX_REDIRECTS,
  navigate,
  nextPath,
  type RouteDefinition,
  redirectWithNext,
} from '../src/router/router.svelte.ts';
import LazyScreen from './fixtures/LazyScreen.svelte';
import RouterHarness from './fixtures/RouterHarness.svelte';

const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  cleanup();
  location.hash = '';
  document.title = '';
  document.body.replaceChildren();
});

/** A stand-in for `runtime.session`: a signed-in flag plus `subscribe`. */
function fakeSession(signedIn: boolean) {
  const listeners = new Set<() => void>();
  return {
    get signedIn() {
      return signedIn;
    },
    set(value: boolean) {
      signedIn = value;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function authRoutes(session: ReturnType<typeof fakeSession>): RouteDefinition[] {
  return [
    { path: '/', component: LazyScreen },
    {
      path: '/settings',
      component: LazyScreen,
      title: 'Settings',
      guard: (match) => session.signedIn || redirectWithNext('/sign-in', match),
    },
    {
      path: '/sign-in',
      component: LazyScreen,
      title: 'Sign in',
      // Guest-only: once signed in, continue to where the person was going.
      guard: (match) => !session.signedIn || nextPath(match.query),
    },
  ];
}

describe('route guard helpers', () => {
  it('redirectWithNext keeps the path and query; nextPath accepts only in-app paths', () => {
    const router = createRouter([{ path: '/settings', component: LazyScreen }]);
    const match = router.match('#/settings?tab=team');
    expect(redirectWithNext('/sign-in', match)).toBe('/sign-in?next=%2Fsettings%3Ftab%3Dteam');
    expect(redirectWithNext('/sign-in?mode=sso', match)).toBe(
      '/sign-in?mode=sso&next=%2Fsettings%3Ftab%3Dteam'
    );
    const q = (next: string) => new URLSearchParams({ next });
    expect(nextPath(q('/settings?tab=team'))).toBe('/settings?tab=team');
    for (const unsafe of [
      'https://evil.example',
      '//evil.example',
      '/\\evil',
      'settings',
      '/a b',
    ]) {
      expect(nextPath(q(unsafe), '/home')).toBe('/home');
    }
    expect(nextPath(new URLSearchParams())).toBe('/');
    router.destroy();
  });
});

describe('createRouter guard redirects', () => {
  it('redirects a signed-out visitor before rendering and replaces the history entry', async () => {
    location.hash = '#/';
    const session = fakeSession(false);
    const router = createRouter(authRoutes(session));
    const entries = history.length;

    navigate('/settings?tab=team');
    await tick();
    expect(router.current.route?.path).toBe('/sign-in');
    expect(router.current.redirectedFrom).toBe('/settings');
    expect(router.current.query.get('next')).toBe('/settings?tab=team');
    expect(location.hash).toBe('#/sign-in?next=%2Fsettings%3Ftab%3Dteam');
    expect(document.title).toMatch(/^Sign in/);
    // The blocked URL was replaced, not stacked on top of it.
    expect(history.length).toBeLessThanOrEqual(entries + 1);
    router.destroy();
  });

  it('guards the very first location too', () => {
    location.hash = '#/settings';
    const router = createRouter(authRoutes(fakeSession(false)));
    expect(router.current.route?.path).toBe('/sign-in');
    expect(location.hash).toBe('#/sign-in?next=%2Fsettings');
    router.destroy();
  });

  it('returns to next after sign-in and re-guards after sign-out (session events)', async () => {
    location.hash = '#/settings?tab=team';
    const session = fakeSession(false);
    const router = createRouter(authRoutes(session), {
      revalidateOn: (refresh) => session.subscribe(refresh),
    });
    expect(router.current.route?.path).toBe('/sign-in');

    session.set(true);
    expect(router.current.path).toBe('/settings');
    expect(router.current.query.get('tab')).toBe('team');
    expect(location.hash).toBe('#/settings?tab=team');

    session.set(false);
    expect(router.current.route?.path).toBe('/sign-in');
    expect(router.current.query.get('next')).toBe('/settings?tab=team');

    // destroy() unsubscribes: later session events no longer move the router.
    router.destroy();
    session.set(true);
    expect(router.current.route?.path).toBe('/sign-in');
  });

  it('a session event on an allowed screen leaves the match untouched', () => {
    location.hash = '#/';
    const session = fakeSession(true);
    const router = createRouter(authRoutes(session));
    document.title = 'unchanged';
    session.set(false);
    router.refresh();
    // No re-navigation happened: the title (rewritten on every update) is untouched.
    expect(document.title).toBe('unchanged');
    expect(router.current.path).toBe('/');
    router.destroy();
  });

  it(`stops a guard loop after ${MAX_REDIRECTS} redirects and reports it`, async () => {
    location.hash = '#/';
    const router = createRouter([
      { path: '/a', component: LazyScreen, guard: () => '/b' },
      { path: '/b', component: LazyScreen, guard: () => '/a' },
      { path: '/', component: LazyScreen },
    ]);
    navigate('/a');
    await tick();
    expect(router.current.route).toBeNull();
    expect(router.current.path).toBe('/a');
    expect(router.current.error).toMatch(/Too many redirects starting at \/a/);
    expect(document.title).toMatch(/^Redirect loop/);
    router.destroy();
  });

  it('allows a chain shorter than the cap', () => {
    location.hash = '#/one';
    const hop = (to: string) => () => to;
    const router = createRouter([
      { path: '/one', component: LazyScreen, guard: hop('/two') },
      { path: '/two', component: LazyScreen, guard: hop('/three') },
      { path: '/three', component: LazyScreen, guard: () => true },
    ]);
    expect(router.current.route?.path).toBe('/three');
    expect(router.current.redirectedFrom).toBe('/one');
    router.destroy();
  });
});

describe('<Router> with route guards', () => {
  it('never mounts the protected screen for a signed-out visitor', async () => {
    location.hash = '#/settings';
    const session = fakeSession(false);
    const router = createRouter(authRoutes(session), {
      revalidateOn: (refresh) => session.subscribe(refresh),
    });
    render(RouterHarness, { router });
    expect(screen.getByTestId('lazy-screen').dataset.path).toBe('/sign-in');

    session.set(true);
    await waitFor(() => expect(screen.getByTestId('lazy-screen').dataset.path).toBe('/settings'));
    router.destroy();
  });

  it('renders the not-found screen with the loop message', () => {
    location.hash = '#/a';
    const router = createRouter([{ path: '/a', component: LazyScreen, guard: () => '/a' }]);
    render(RouterHarness, { router });
    expect(screen.getByRole('heading', { name: 'This page keeps redirecting' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/Too many redirects/);
    expect(screen.queryByTestId('lazy-screen')).toBeNull();
    router.destroy();
  });
});
