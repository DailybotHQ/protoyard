import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createRouter,
  navigate,
  type RouteDefinition,
  routeOverlay,
} from '../src/router/hash-router.svelte.ts';
import CounterScreen from './fixtures/CounterScreen.svelte';
import OverlayScreen from './fixtures/OverlayScreen.svelte';
import RouterHarness from './fixtures/RouterHarness.svelte';

const tick = () => new Promise((r) => setTimeout(r, 0));
/** Hash navigations settle after the hashchange event (and history.back after popstate). */
const settle = async () => {
  for (let i = 0; i < 3; i++) await tick();
};

afterEach(() => {
  cleanup();
  location.hash = '';
  document.title = '';
  document.body.replaceChildren();
});

const Dummy = (() => {}) as never;

function routes(extra: Partial<RouteDefinition> = {}): RouteDefinition[] {
  return [
    { path: '/', component: Dummy, title: 'Home' },
    { path: '/deals', component: Dummy, title: 'Deals' },
    { path: '/deals/:id', component: Dummy, title: 'Deal' },
    { path: '/deals/:id/edit', component: Dummy, title: 'Edit deal', overlay: true, ...extra },
    {
      path: '/deals/:id/share',
      component: Dummy,
      title: 'Share',
      overlay: { desktop: 'side-panel' },
    },
  ];
}

describe('overlay routes in the hash router', () => {
  it('normalizes the overlay option', () => {
    expect(routeOverlay({ path: '/a', overlay: true })).toEqual({});
    expect(routeOverlay({ path: '/a', overlay: { desktop: 'side-panel', size: 'lg' } })).toEqual({
      desktop: 'side-panel',
      size: 'lg',
    });
    expect(routeOverlay({ path: '/a' })).toBeNull();
    expect(routeOverlay({ path: '/a', overlay: false })).toBeNull();
    expect(routeOverlay(null)).toBeNull();
  });

  it('keeps the last full-screen route underneath and closes back to it through history', async () => {
    location.hash = '#/deals';
    const router = createRouter(routes());
    expect(router.overlay).toBeNull();
    expect(router.background.path).toBe('/deals');

    navigate('/deals/42/edit');
    await settle();
    expect(router.current.path).toBe('/deals/42/edit');
    expect(router.overlay?.params).toEqual({ id: '42' });
    expect(router.background.path).toBe('/deals');
    // The screen underneath keeps its navigation highlight.
    expect(router.isActive('/deals', true)).toBe(true);

    const entries = history.length;
    router.closeOverlay();
    await settle();
    expect(location.hash).toBe('#/deals');
    expect(router.overlay).toBeNull();
    expect(router.current.path).toBe('/deals');
    expect(history.length).toBe(entries);
    router.destroy();
  });

  it('follows Back and Forward like any route', async () => {
    location.hash = '#/deals/7';
    const router = createRouter(routes());
    navigate('/deals/7/edit');
    await settle();
    expect(router.overlay).not.toBeNull();
    history.back();
    await settle();
    expect(router.overlay).toBeNull();
    expect(router.current.path).toBe('/deals/7');
    history.forward();
    await settle();
    expect(router.overlay?.path).toBe('/deals/7/edit');
    expect(router.background.path).toBe('/deals/7');
    router.destroy();
  });

  it('opens a deep link over the nearest full-screen ancestor and closes by replacing', async () => {
    location.hash = '#/deals/42/edit';
    const router = createRouter(routes());
    expect(router.overlay?.path).toBe('/deals/42/edit');
    expect(router.background.path).toBe('/deals/42');
    expect(router.background.params).toEqual({ id: '42' });
    const entries = history.length;
    router.closeOverlay();
    await settle();
    expect(location.hash).toBe('#/deals/42');
    expect(router.overlay).toBeNull();
    expect(history.length).toBe(entries);
    router.destroy();
  });

  it('uses the overlay base for a deep link when one is given', () => {
    location.hash = '#/deals/9/edit';
    const router = createRouter(routes({ overlay: { base: '/deals' } }));
    expect(router.background.path).toBe('/deals');
    router.destroy();
    location.hash = '#/deals/9/edit';
    const filled = createRouter(routes({ overlay: { base: '/deals/:id' } }));
    expect(filled.background.path).toBe('/deals/9');
    filled.destroy();
  });

  it('keeps the screen underneath when moving between overlays, then closes to it', async () => {
    location.hash = '#/deals/3';
    const router = createRouter(routes());
    navigate('/deals/3/edit');
    await settle();
    navigate('/deals/3/share');
    await settle();
    expect(router.overlay?.path).toBe('/deals/3/share');
    expect(router.background.path).toBe('/deals/3');
    router.closeOverlay();
    await settle();
    expect(location.hash).toBe('#/deals/3');
    expect(router.overlay).toBeNull();
    router.destroy();
  });

  it('does not scroll the screen underneath when an overlay opens or closes', async () => {
    location.hash = '#/deals';
    const scrollRoot = document.body.appendChild(document.createElement('div'));
    scrollRoot.setAttribute('data-py-scroll-root', '');
    const router = createRouter(routes());
    // Let the hashchange from setting the start location pass first.
    await settle();
    scrollRoot.scrollTop = 120;
    navigate('/deals/1/edit');
    await settle();
    expect(scrollRoot.scrollTop).toBe(120);
    router.closeOverlay();
    await settle();
    expect(scrollRoot.scrollTop).toBe(120);
    navigate('/deals/1');
    await settle();
    expect(scrollRoot.scrollTop).toBe(0);
    router.destroy();
  });

  it('closeOverlay is a no-op without an overlay, and guards still apply', async () => {
    location.hash = '#/deals';
    const router = createRouter([
      { path: '/deals', component: Dummy },
      { path: '/sign-in', component: Dummy },
      { path: '/deals/:id/edit', component: Dummy, overlay: true, guard: () => '/sign-in' },
    ]);
    router.closeOverlay();
    expect(location.hash).toBe('#/deals');
    navigate('/deals/1/edit');
    await settle();
    // Redirected to a full-screen route: no overlay, and it becomes the screen underneath.
    expect(router.overlay).toBeNull();
    expect(router.current.path).toBe('/sign-in');
    expect(router.background.path).toBe('/sign-in');
    router.destroy();
  });
});

describe('<Router> with overlay routes', () => {
  function mountWide(width: number) {
    const host = document.body.appendChild(document.createElement('div'));
    host.setAttribute('data-py-app-host', '');
    Object.defineProperty(host, 'getBoundingClientRect', {
      value: () => ({ width, height: 800, top: 0, left: 0, right: width, bottom: 800, x: 0, y: 0 }),
    });
    Object.defineProperty(host, 'clientWidth', { value: width });
    return host;
  }

  const screens: RouteDefinition[] = [
    { path: '/deals', component: CounterScreen, title: 'Deals' },
    {
      path: '/deals/:id/edit',
      load: async () => ({ default: OverlayScreen }),
      title: 'Edit deal',
      overlay: true,
    },
  ];

  it('renders a sheet over the screen underneath on a narrow host and keeps its state', async () => {
    const host = mountWide(390);
    location.hash = '#/deals';
    const router = createRouter(screens);
    render(RouterHarness, { props: { router }, target: host });
    const count = screen.getByRole('button', { name: 'Count 0' });
    await fireEvent.click(count);
    expect(screen.getByRole('button', { name: 'Count 1' })).toBeTruthy();

    const link = screen.getByRole('link', { name: 'Edit deal 42' });
    link.focus();
    await fireEvent.click(link);
    await settle();
    expect(await screen.findByText('Editing deal 42')).toBeTruthy();
    await waitFor(() =>
      expect(document.querySelector('[data-adaptive-overlay-presentation="sheet"]')).toBeTruthy()
    );
    // The full-screen route is still mounted underneath, with its state.
    expect(screen.getByTestId('counter-screen').dataset.path).toBe('/deals');
    expect(screen.getByRole('dialog', { name: 'Edit deal' })).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await settle();
    await waitFor(() => expect(screen.queryByText('Editing deal 42')).toBeNull());
    expect(location.hash).toBe('#/deals');
    expect(screen.getByRole('button', { name: 'Count 1' })).toBeTruthy();
    // Focus returns to the link that opened the overlay.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Edit deal 42' }))
    );
    router.destroy();
  });

  it('renders a dialog on a wide host and closes with Escape', async () => {
    const host = mountWide(1200);
    location.hash = '#/deals/5/edit';
    const router = createRouter(screens);
    render(RouterHarness, { props: { router }, target: host });
    expect(await screen.findByText('Editing deal 5')).toBeTruthy();
    await waitFor(() =>
      expect(document.querySelector('[data-adaptive-overlay-presentation="dialog"]')).toBeTruthy()
    );
    // Deep link: the nearest full-screen ancestor renders underneath.
    expect(screen.getByTestId('counter-screen').dataset.path).toBe('/deals');
    await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await settle();
    await waitFor(() => expect(screen.queryByText('Editing deal 5')).toBeNull());
    expect(location.hash).toBe('#/deals');
    router.destroy();
  });
});
