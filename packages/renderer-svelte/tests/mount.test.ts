import { getDevice } from '@protoyard/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { Dexie, type EntityTable } from 'dexie';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountPrototype } from '../src/index.ts';
import {
  activeFrame,
  FRAMES,
  isEmbedded,
  STAGE_GUTTER,
  stageScale,
} from '../src/shell/frames/registry.ts';
import { createFakeRuntime } from './fixtures/fake-runtime.ts';
import LiveList from './fixtures/LiveList.svelte';
import ProbeApp from './fixtures/ProbeApp.svelte';
import ThrowingApp from './fixtures/ThrowingApp.svelte';
import ThrowingQuery from './fixtures/ThrowingQuery.svelte';

const tick = () => new Promise((r) => setTimeout(r, 0));
const root = document.documentElement;

describe('mountPrototype', () => {
  let destroy: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await destroy?.();
    destroy = undefined;
    document.body.replaceChildren();
    root.removeAttribute('style');
    root.className = '';
    localStorage.clear();
  });

  async function boot(options: { persistent?: boolean; fail?: boolean } = {}) {
    const target = document.body.appendChild(document.createElement('div'));
    const runtime = createFakeRuntime({ persistent: options.persistent ?? true });
    const mounted = await mountPrototype({
      definition: runtime.definition,
      App: ProbeApp,
      target,
      search: '',
      devtools: false,
      createRuntime: () => {
        if (options.fail)
          throw Object.assign(new Error('Stored data is newer than this prototype.'), {
            code: 'version-newer',
          });
        return runtime;
      },
    });
    destroy = mounted.destroy;
    return { mounted, runtime, target };
  }

  it('renders the app inside the scroll root, with overlays outside it', async () => {
    const { target } = await boot();
    const scrollRoot = target.querySelector('[data-py-scroll-root]');
    expect(scrollRoot?.contains(screen.getByTestId('who'))).toBe(true);
    expect(target.querySelectorAll('[data-py-scroll-root]')).toHaveLength(1);
    // Toasts are siblings of the scroll root, so scrolling the app never moves them.
    const toaster = target.querySelector('[aria-label="Notifications"]');
    expect(toaster).not.toBeNull();
    expect(scrollRoot?.contains(toaster)).toBe(false);
    expect(scrollRoot?.parentElement?.contains(toaster)).toBe(true);
  });

  it("renders the app directly with shell 'none': no frame, no shell styles", async () => {
    const { runtime, target } = await boot();
    expect(runtime.theme.appearance().shell.value).toBe('none');
    await tick();
    expect(root.dataset.pyShell).toBeUndefined();
    expect(target.querySelector('[data-py-frame]')).toBeNull();
    // The wrappers exist (so the app never remounts) but carry no inline layout.
    const parts = [...target.querySelectorAll<HTMLElement>('[data-py-shell-part]')];
    expect(parts.map((el) => el.dataset.pyShellPart)).toEqual([
      'stage',
      'sizer',
      'device',
      'screen',
    ]);
    for (const part of parts) expect(part.getAttribute('style') ?? '').toBe('');
  });

  it("lazy-loads the device frame for 'phone' and sizes the screen from the catalog", async () => {
    const { runtime, target } = await boot();
    const before = screen.getByTestId('who');
    await runtime.theme.setOverride({ shell: 'phone' });
    flushSync();
    await vi.waitFor(() => expect(target.querySelector('[data-py-frame="phone"]')).not.toBeNull());
    expect(root.dataset.pyShell).toBe('phone');
    // The app was not remounted by the shell change.
    expect(screen.getByTestId('who')).toBe(before);

    const screenEl = target.querySelector<HTMLElement>('[data-py-shell-part="screen"]');
    const device = target.querySelector<HTMLElement>('[data-py-shell-part="device"]');
    const phone = getDevice('phone-pill');
    expect(device?.style.width).toBe(`${phone?.width}px`);
    expect(device?.style.height).toBe(`${phone?.height}px`);
    expect(screenEl?.style.getPropertyValue('--py-app-height')).toBe(`${phone?.height}px`);
    expect(screenEl?.style.getPropertyValue('--py-safe-top')).toBe(
      `${phone?.safeArea.portrait.top}px`
    );
    expect(screenEl?.style.getPropertyValue('--py-safe-bottom')).toBe(
      `${phone?.safeArea.portrait.bottom}px`
    );
    // Status bar paints the top safe inset; home indicator is a real control.
    expect(target.querySelector('[data-py-status-bar]')).not.toBeNull();
    expect(target.querySelector('[data-py-home-indicator]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Go home' })).toBeTruthy();
    // Toasts render on the device screen, not on the desktop.
    expect(screenEl?.querySelector('[aria-label="Notifications"]')).not.toBeNull();
    // Overlay portal target is the framed screen.
    const { getOverlayPortalTarget } = await import('@protoyard/ui');
    expect(getOverlayPortalTarget()).toBe(screenEl);

    await runtime.theme.setOverride({ shell: 'none' });
    flushSync();
    await vi.waitFor(() => expect(target.querySelector('[data-py-frame]')).toBeNull());
    expect(getOverlayPortalTarget()).toBeNull();
    expect(root.dataset.pyShell).toBeUndefined();
    expect(screen.getByTestId('who')).toBe(before);
  });

  it('forces full-bleed when embedded in an iframe (the gallery draws its own device)', async () => {
    const top = vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window);
    try {
      const { runtime, target } = await boot();
      await runtime.theme.setOverride({ shell: 'phone' });
      flushSync();
      await tick();
      expect(runtime.theme.appearance().shell.value).toBe('phone');
      expect(root.dataset.pyShell).toBeUndefined();
      expect(target.querySelector('[data-py-frame]')).toBeNull();
    } finally {
      top.mockRestore();
    }
  });

  it('signals ready after seeding and mounts the app with reactive bindings', async () => {
    const mark = vi.spyOn(performance, 'mark');
    const { runtime } = await boot();
    expect(runtime.scenarios.active()?.scenario.id).toBe('empty');
    expect(screen.getByTestId('who').textContent).toBe('Olivia Owner');
    expect(screen.getByTestId('can-create').textContent).toBe('yes');
    expect(root.dataset.pyReady).toBe('true');
    expect(root.dataset.protoyardReady).toBe('1');
    expect(mark).toHaveBeenCalledWith('protoyard:world-ready', { detail: { seeded: true } });
    expect(mark).toHaveBeenCalledWith('protoyard:ready');
    expect(root.dataset.pyTheme).toBe('violet');
    expect(window.__protoyard).toBe(runtime);
    mark.mockRestore();

    await runtime.session.switchActor('user_0002');
    flushSync();
    expect(screen.getByTestId('who').textContent).toBe('Victor Viewer');
    expect(screen.getByTestId('can-create').textContent).toBe('no');

    await runtime.theme.setOverride({ themeId: 'ocean', mode: 'dark', viewport: 'iphone' });
    flushSync();
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.dataset.pyTheme).toBe('ocean');
    expect(root.dataset.pyViewport).toBe('iphone');
    expect(screen.getByTestId('mode').textContent).toBe('dark');
    await runtime.theme.setOverride({ density: 1.125 });
    flushSync();
    expect(root.style.getPropertyValue('--py-density')).toBe('1.125');
    const cached = JSON.parse(localStorage.getItem('protoyard.fake.appearance') ?? '{}');
    expect(cached.themeId).toBe('ocean');
  });

  it('offers a reload when an offline build has a new version waiting', async () => {
    const applyUpdate = vi.fn();
    window.__protoyardOffline = { updateAvailable: false, applyUpdate };
    await boot();
    expect(screen.queryByText('Update available')).toBeNull();
    window.__protoyardOffline.updateAvailable = true;
    window.dispatchEvent(new CustomEvent('protoyard:offline-update'));
    await expect.poll(() => screen.queryByText('Update available')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(applyUpdate).toHaveBeenCalledTimes(1);
    delete window.__protoyardOffline;
  });

  it('removes the offline-update listener on destroy', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { mounted } = await boot();
    const listener = add.mock.calls.find(([type]) => type === 'protoyard:offline-update')?.[1];
    expect(listener).toBeTypeOf('function');
    await mounted.destroy();
    destroy = undefined;
    expect(remove).toHaveBeenCalledWith('protoyard:offline-update', listener);
    add.mockRestore();
    remove.mockRestore();
  });

  it('shows a storage warning banner when persistence is degraded', async () => {
    await boot({ persistent: false });
    expect(screen.getByRole('status').textContent).toContain("Changes won't be saved.");
  });

  it('recovers when the App itself throws while initialising', async () => {
    const target = document.body.appendChild(document.createElement('div'));
    const runtime = createFakeRuntime();
    let closed = false;
    runtime.close = () => {
      closed = true;
    };
    const mounted = await mountPrototype({
      definition: runtime.definition,
      App: ThrowingApp,
      target,
      search: '',
      devtools: false,
      createRuntime: () => runtime,
    });
    destroy = mounted.destroy;
    expect(mounted.runtime).toBeNull();
    expect(String(mounted.error)).toMatch(/App exploded/);
    expect(closed).toBe(true);
    expect(root.dataset.pyReady).toBe('error');
    expect(window.__protoyard).toBeUndefined();
    expect(screen.getByRole('heading', { name: /couldn't start/ })).toBeTruthy();
  });

  it('renders a recovery screen instead of a blank page when boot fails', async () => {
    const { mounted } = await boot({ fail: true });
    expect(mounted.runtime).toBeNull();
    expect(screen.getByRole('heading', { name: /couldn't start/ })).toBeTruthy();
    expect(screen.getByText('version-newer')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reset prototype data/ })).toBeTruthy();
    expect(root.dataset.pyReady).toBe('error');
  });
});

describe('liveQuery', () => {
  afterEach(() => cleanup());

  async function seed() {
    const db = new Dexie(`live-${Math.random()}`) as Dexie & {
      items: EntityTable<{ id: string; n: number }, 'id'>;
    };
    db.version(1).stores({ items: 'id, n' });
    await db.items.bulkAdd([
      { id: 'a', n: 1 },
      { id: 'b', n: 5 },
    ]);
    return db;
  }

  it('re-subscribes on prop changes WITHOUT deps (route params, filters)', async () => {
    const db = await seed();
    let queries = 0;
    const view = render(LiveList, { db, min: 0, onQuery: () => queries++ });
    await expect.poll(() => screen.queryByTestId('count')?.textContent).toBe('2');
    await db.items.add({ id: 'c', n: 9 });
    await expect.poll(() => screen.queryByTestId('count')?.textContent).toBe('3');
    await view.rerender({ db, min: 5, onQuery: () => queries++ });
    await expect.poll(() => screen.queryByTestId('count')?.textContent).toBe('2');
    // 2 subscriptions × (Dexie run + one tracking probe) + 1 table change.
    expect(queries).toBeLessThanOrEqual(5);
    view.unmount();
    await tick();
    db.close();
  });

  it('keeps explicit deps working', async () => {
    const db = await seed();
    const view = render(LiveList, { db, min: 0, mode: 'deps' });
    await expect.poll(() => screen.queryByTestId('count')?.textContent).toBe('2');
    await view.rerender({ db, min: 5, mode: 'deps' });
    await expect.poll(() => screen.queryByTestId('count')?.textContent).toBe('1');
    view.unmount();
    db.close();
  });

  it('tracks inputs the querier reads even when deps lists something else', async () => {
    const db = await seed();
    const view = render(LiveList, { db, min: 0, mode: 'partial-deps', other: 1 });
    await expect.poll(() => screen.queryByTestId('count')?.textContent).toBe('2');
    await view.rerender({ db, min: 5, mode: 'partial-deps', other: 1 });
    await expect.poll(() => screen.queryByTestId('count')?.textContent).toBe('1');
    view.unmount();
    db.close();
  });

  it('reports a querier that throws synchronously as error, then recovers', async () => {
    const db = await seed();
    const view = render(ThrowingQuery, { db, selected: undefined });
    await expect.poll(() => screen.queryByTestId('state')?.textContent).toBe('error');
    await view.rerender({ db, selected: { id: 'b' } });
    await expect.poll(() => screen.queryByTestId('state')?.textContent).toBe('5');
    view.unmount();
    db.close();
  });

  it('documents the limit: reads after an await are not tracked without deps', async () => {
    const db = await seed();
    const view = render(LiveList, { db, min: 0, mode: 'after-await' });
    await expect.poll(() => screen.queryByTestId('count')?.textContent).toBe('2');
    await view.rerender({ db, min: 5, mode: 'after-await' });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('count')?.textContent).toBe('2');
    view.unmount();
    db.close();
  });
});

describe('shell frame decisions', () => {
  const phone = getDevice('phone-pill');

  it('frames only a shell with a frame, when not embedded and the window fits the device', () => {
    const base = { shell: 'phone' as const, spec: phone, windowWidth: 1280, embedded: false };
    expect(activeFrame(base)).toBe('phone');
    expect(activeFrame({ ...base, shell: 'none' })).toBe('none');
    expect(activeFrame({ ...base, embedded: true })).toBe('none');
    // A real phone gets full-bleed, even one a little wider than the catalog device.
    expect(activeFrame({ ...base, windowWidth: 390 })).toBe('none');
    expect(activeFrame({ ...base, windowWidth: 412 })).toBe('none');
    const fits = (phone?.width ?? 0) + 2 * ((FRAMES.phone?.margin ?? 0) + STAGE_GUTTER);
    expect(activeFrame({ ...base, windowWidth: fits - 1 })).toBe('none');
    expect(activeFrame({ ...base, windowWidth: fits })).toBe('phone');
    expect(activeFrame({ ...base, spec: undefined })).toBe('none');
    // Shells whose frame has not shipped yet stay full-bleed.
    expect(FRAMES['side-panel']).toBeUndefined();
    expect(activeFrame({ ...base, shell: 'side-panel', spec: getDevice('laptop-window') })).toBe(
      'none'
    );
  });

  it('detects embedding, including a cross-origin parent that throws', () => {
    const self = {} as Window;
    expect(isEmbedded({ top: self, self } as Window)).toBe(false);
    expect(isEmbedded({ top: {}, self } as unknown as Window)).toBe(true);
    const crossOrigin = Object.defineProperty({ self }, 'top', {
      get() {
        throw new DOMException('Blocked a frame', 'SecurityError');
      },
    }) as unknown as Window;
    expect(isEmbedded(crossOrigin)).toBe(true);
  });

  it('fits the device and its frame on both axes and never upscales', () => {
    const spec = { width: 393, height: 852 };
    const outerHeight = 852 + 2 * (14 + STAGE_GUTTER);
    expect(stageScale({ width: 3000, height: 3000 }, spec, 14)).toBe(1);
    expect(stageScale({ width: 1280, height: 800 }, spec, 14)).toBeCloseTo(800 / outerHeight, 5);
    expect(stageScale({ width: 300, height: 3000 }, spec, 14)).toBeLessThan(1);
    expect(stageScale({ width: 0, height: 0 }, spec, 14)).toBe(1);
  });

  it('loads every registered frame as its own module', async () => {
    for (const entry of Object.values(FRAMES)) {
      const module = await entry?.load();
      expect(typeof module?.default).toBe('function');
    }
  });
});
