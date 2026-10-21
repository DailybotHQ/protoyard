import type { Overrides, PrototypeRuntime } from '@protoyard/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAdaptivePresentation,
  parsePresentationView,
  presentationUrlWithoutOverride,
  resolvePresentationView,
} from '../src/adaptive/presentation.svelte.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  history.replaceState(history.state, '', '/');
});

describe('adaptive presentation policy', () => {
  it('resolves link, phone frame, saved preference, then width in order', () => {
    expect(
      resolvePresentationView({
        link: 'desktop',
        phoneFrame: true,
        preference: 'phone',
        width: 400,
      })
    ).toBe('desktop');
    expect(
      resolvePresentationView({ link: null, phoneFrame: true, preference: 'desktop', width: 1400 })
    ).toBe('phone');
    expect(
      resolvePresentationView({ link: null, phoneFrame: false, preference: 'phone', width: 1400 })
    ).toBe('phone');
    expect(
      resolvePresentationView({ link: null, phoneFrame: false, preference: 'auto', width: 1024 })
    ).toBe('desktop');
    expect(
      resolvePresentationView({ link: null, phoneFrame: false, preference: 'auto', width: 1023 })
    ).toBe('phone');
  });

  it('reads a validated view from page and hash-route query strings', () => {
    expect(parsePresentationView('https://example.com/?view=desktop')).toBe('desktop');
    expect(parsePresentationView('https://example.com/#/settings?view=phone')).toBe('phone');
    expect(parsePresentationView('https://example.com/?view=unknown')).toBeNull();
    expect(parsePresentationView('https://example.com/#/settings')).toBeNull();
  });

  it('removes only its view parameter and preserves unrelated URL state', () => {
    expect(
      presentationUrlWithoutOverride(
        'https://example.com/?view=desktop&theme=dark#/settings?tab=team'
      )
    ).toBe('/?theme=dark#/settings?tab=team');
    expect(
      presentationUrlWithoutOverride(
        'https://example.com/?theme=dark#/settings?view=phone&tab=team'
      )
    ).toBe('/?theme=dark#/settings?tab=team');
  });
});

function makeRuntime() {
  let current: Overrides = {};
  const listeners = new Set<(value: Overrides) => void>();
  const publish = () => {
    listeners.forEach((listener) => {
      listener(current);
    });
  };
  const runtime = {
    manifest: { storage: { namespace: 'adaptive-test' } },
    overrides: {
      get: () => current,
      async set(patch: Overrides) {
        current = { ...current, ...patch };
        publish();
      },
      async clear(keys?: readonly (keyof Overrides)[]) {
        if (!keys) current = {};
        else {
          const next = { ...current };
          for (const key of keys) delete next[key];
          current = next;
        }
        publish();
      },
      subscribe(listener: (value: Overrides) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
  return {
    runtime: runtime as unknown as Pick<PrototypeRuntime, 'overrides' | 'manifest'>,
    get current() {
      return current;
    },
    set(patch: Overrides) {
      current = { ...current, ...patch };
      publish();
    },
  };
}

describe('adaptive presentation store', () => {
  it('tracks an active phone frame and returns to automatic width resolution', async () => {
    const root = document.createElement('div');
    const store = createAdaptivePresentation(undefined, { root, initialWidth: 1400 });

    expect(store.view).toBe('desktop');
    root.dataset.pyShell = 'phone';
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.view).toBe('phone');
    delete root.dataset.pyShell;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.view).toBe('desktop');
    store.destroy();
  });

  it('loads a saved choice and follows observed host width changes', async () => {
    const resizeObservers: ResizeObserver[] = [];
    class TestResizeObserver implements ResizeObserver {
      private readonly callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        resizeObservers.push(this);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      trigger(width: number): void {
        this.callback([{ contentRect: { width } } as ResizeObserverEntry], this);
      }
    }
    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    const storageKey = 'protoyard.adaptive-test.presentation';
    localStorage.setItem(storageKey, 'phone');
    const root = document.createElement('div');
    const host = document.createElement('main');
    host.getBoundingClientRect = () => ({ width: 900 }) as DOMRect;
    const store = createAdaptivePresentation(makeRuntime().runtime, {
      root,
      initialWidth: 1400,
    });
    const stopObserving = store.observe(host);

    expect(store.preference).toBe('phone');
    expect(store.width).toBe(900);
    expect(store.view).toBe('phone');
    host.getBoundingClientRect = () => ({ width: 1300 }) as DOMRect;
    (resizeObservers[0] as TestResizeObserver).trigger(1300);
    expect(store.width).toBe(1300);
    expect(store.view).toBe('phone'); // Explicit preference stays ahead of width.

    stopObserving();
    await store.setPreference('auto');
    expect(store.view).toBe('desktop');
    store.destroy();
  });

  it('syncs the resolved view to shell and viewport overrides', async () => {
    const fake = makeRuntime();
    const store = createAdaptivePresentation(fake.runtime, {
      root: document.createElement('div'),
      initialWidth: 1400,
    });

    await store.syncShell();
    expect(fake.current).toMatchObject({ shell: 'none', viewport: 'desktop' });
    await store.setPreference('phone');
    expect(fake.current).toMatchObject({ shell: 'phone', viewport: 'iphone' });
    await store.setPreference('auto');
    expect(fake.current.shell).toBeUndefined();
    expect(fake.current.viewport).toBeUndefined();
    store.destroy();
  });

  it('adopts shell overrides changed outside the store', () => {
    const fake = makeRuntime();
    const store = createAdaptivePresentation(fake.runtime, {
      root: document.createElement('div'),
      initialWidth: 1400,
    });

    fake.set({ shell: 'phone' });
    expect(store.preference).toBe('phone');
    expect(store.view).toBe('phone');
    expect(localStorage.getItem('protoyard.adaptive-test.presentation')).toBe('phone');
    store.destroy();
  });

  it('drops the explicit link override when the person chooses a preference', async () => {
    history.replaceState(history.state, '', '/?view=desktop&theme=dark#/settings?tab=team');
    const store = createAdaptivePresentation(undefined, {
      root: document.createElement('div'),
      initialWidth: 400,
    });

    expect(store.view).toBe('desktop');
    await store.setPreference('phone');
    expect(location.search).toBe('?theme=dark');
    expect(location.hash).toBe('#/settings?tab=team');
    expect(store.view).toBe('phone');
    store.destroy();
  });

  it('keeps the active page usable when storage access throws', async () => {
    const storage = {
      getItem: () => {
        throw new Error('storage blocked');
      },
      setItem: () => {
        throw new Error('storage blocked');
      },
      removeItem: () => {
        throw new Error('storage blocked');
      },
      clear: () => {},
      key: () => null,
      length: 0,
    } as Storage;
    const store = createAdaptivePresentation(undefined, {
      root: document.createElement('div'),
      storage,
      initialWidth: 400,
    });

    await store.setPreference('desktop');
    expect(store.preference).toBe('desktop');
    expect(store.view).toBe('desktop');
    store.destroy();
  });
});
