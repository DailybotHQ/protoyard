import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRouter, navigate } from '../src/router/hash-router.svelte.ts';
import LazyScreen from './fixtures/LazyScreen.svelte';
import RouterHarness from './fixtures/RouterHarness.svelte';

const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  cleanup();
  location.hash = '';
  document.title = '';
  document.body.replaceChildren();
});

describe('createRouter lazy resolve', () => {
  const Dummy = (() => {}) as never;

  it('loads a route component once and caches the module', async () => {
    let calls = 0;
    const router = createRouter([
      { path: '/', component: Dummy },
      {
        path: '/reports',
        load: async () => {
          calls++;
          return { default: Dummy };
        },
      },
    ]);
    const route = router.routes[1] as (typeof router.routes)[number];
    await expect(router.resolve(route)).resolves.toBe(Dummy);
    await expect(router.resolve(route)).resolves.toBe(Dummy);
    expect(calls).toBe(1);
    expect(router.resolve(router.routes[0] as never)).toBe(Dummy);
    expect(() => createRouter([{ path: '/x' }])).toThrow(/needs a component/);
    router.destroy();
  });

  it('clears the cache on failure so retry calls load again', async () => {
    let calls = 0;
    const router = createRouter([
      {
        path: '/flaky',
        load: async () => {
          calls++;
          if (calls === 1) throw new Error('chunk missing');
          return { default: Dummy };
        },
      },
    ]);
    const route = router.routes[0] as (typeof router.routes)[number];
    await expect(router.resolve(route)).rejects.toThrow('chunk missing');
    // Let the rejection handler drop the cache entry.
    await tick();
    await expect(router.resolve(route)).resolves.toBe(Dummy);
    expect(calls).toBe(2);
    router.invalidate(route);
    await expect(router.resolve(route)).resolves.toBe(Dummy);
    expect(calls).toBe(3);
    router.destroy();
  });

  it('sets document.title from the route definition while the chunk is still loading', async () => {
    document.title = 'CRM';
    let release!: (value: { default: typeof Dummy }) => void;
    const router = createRouter(
      [
        {
          path: '/reports',
          title: 'Reports',
          load: () =>
            new Promise((resolve) => {
              release = resolve;
            }),
        },
      ],
      { titleSuffix: 'CRM' }
    );
    location.hash = '#/reports';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await tick();
    expect(document.title).toBe('Reports · CRM');
    expect(router.current.route?.path).toBe('/reports');
    const pending = router.resolve(router.routes[0] as never);
    expect(pending).toBeInstanceOf(Promise);
    release({ default: Dummy });
    await pending;
    router.destroy();
  });
});

describe('<Router> lazy screens', () => {
  it('shows LoadingState while a lazy route loads, then the screen', async () => {
    let release!: (value: { default: typeof LazyScreen }) => void;
    const router = createRouter([
      {
        path: '/',
        title: 'Home',
        load: () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      },
    ]);
    location.hash = '#/';
    render(RouterHarness, { router });

    // LoadingState uses role=status; the label is a nested span (not the accessible name).
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('Loading screen')).toBeTruthy();
    expect(screen.queryByTestId('lazy-screen')).toBeNull();

    release({ default: LazyScreen });
    await waitFor(() => expect(screen.getByTestId('lazy-screen')).toBeTruthy());
    expect(screen.queryByText('Loading screen')).toBeNull();
    expect(screen.getByTestId('lazy-screen').textContent).toMatch(/Lazy screen/);
    router.destroy();
  });

  it('shows ErrorState with retry after a failed load, then recovers', async () => {
    let calls = 0;
    let releaseOk!: (value: { default: typeof LazyScreen }) => void;
    let rejectFirst!: (error: Error) => void;

    const router = createRouter([
      {
        path: '/reports',
        title: 'Reports',
        load: () => {
          calls++;
          if (calls === 1) {
            return new Promise((_, reject) => {
              rejectFirst = reject;
            });
          }
          return new Promise((resolve) => {
            releaseOk = resolve;
          });
        },
      },
    ]);

    location.hash = '#/reports';
    render(RouterHarness, { router });

    await waitFor(() => expect(screen.getByText('Loading screen')).toBeTruthy());
    rejectFirst(new Error('network down'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText(/could not be loaded/i)).toBeTruthy();
    expect(screen.getByText('network down')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(screen.getByText('Loading screen')).toBeTruthy());
    expect(calls).toBe(2);

    releaseOk({ default: LazyScreen });
    await waitFor(() => expect(screen.getByTestId('lazy-screen')).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
    router.destroy();
  });

  it('keeps eager component routes working without a loading state', async () => {
    const router = createRouter([{ path: '/', component: LazyScreen, title: 'Home' }]);
    location.hash = '#/';
    render(RouterHarness, { router });
    await waitFor(() => expect(screen.getByTestId('lazy-screen')).toBeTruthy());
    expect(screen.queryByText('Loading screen')).toBeNull();
    const outlet = document.querySelector('[data-py-router-outlet]');
    expect(outlet).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(outlet));
    router.destroy();
  });

  it('keeps the outlet in the height chain so h-full / flex-1 screens fit the app', async () => {
    // Layout is not computed in jsdom: assert the contract the E2E layout-fit guard measures.
    const router = createRouter([{ path: '/', component: LazyScreen, title: 'Home' }]);
    location.hash = '#/';
    render(RouterHarness, { router });
    await waitFor(() => expect(screen.getByTestId('lazy-screen')).toBeTruthy());
    const outlet = document.querySelector<HTMLElement>('[data-py-router-outlet]');
    const classes = outlet?.className.split(/\s+/) ?? [];
    for (const cls of ['block', 'h-full', 'min-h-0', 'min-w-0', 'flex-auto']) {
      expect(classes).toContain(cls);
    }
    router.destroy();
  });

  it('focuses the outlet when navigating between eager routes', async () => {
    const router = createRouter([
      { path: '/', component: LazyScreen, title: 'Home' },
      { path: '/other', component: LazyScreen, title: 'Other' },
    ]);
    location.hash = '#/';
    render(RouterHarness, { router });
    await waitFor(() => expect(screen.getByTestId('lazy-screen')).toBeTruthy());

    navigate('/other');
    await tick();
    await waitFor(() => {
      const outlet = document.querySelector('[data-py-router-outlet]');
      expect(outlet).toBeTruthy();
      expect(document.activeElement).toBe(outlet);
    });
    expect(router.current.route?.path).toBe('/other');
    router.destroy();
  });

  it('focuses a mounted lazy outlet on the next animation frame', async () => {
    let focusFrame: FrameRequestCallback | undefined;
    const requestFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        focusFrame = callback;
        return 1;
      });
    const router = createRouter([
      {
        path: '/',
        load: async () => ({ default: LazyScreen }),
      },
    ]);
    location.hash = '#/';
    render(RouterHarness, { router });
    await waitFor(() => expect(screen.getByTestId('lazy-screen')).toBeTruthy());
    const outlet = document.querySelector('[data-py-router-outlet]');
    expect(outlet).toBeTruthy();
    expect(document.activeElement).not.toBe(outlet);
    expect(requestFrame).toHaveBeenCalled();

    focusFrame?.(performance.now());
    await waitFor(() => expect(document.activeElement).toBe(outlet));
    requestFrame.mockRestore();
    router.destroy();
  });
});

describe('lazy route title + scroll', () => {
  it('scrolls to top on hashchange for a lazy route', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const router = createRouter([
      {
        path: '/reports',
        title: 'Reports',
        load: async () => ({ default: LazyScreen }),
      },
    ]);
    location.hash = '#/reports';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await tick();
    expect(scrollTo).toHaveBeenCalled();
    scrollTo.mockRestore();
    router.destroy();
  });
});
