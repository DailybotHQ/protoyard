import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { Dexie, type EntityTable } from 'dexie';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountPrototype } from '../src/index.ts';
import { COMPACT_SIZE, placeBadge, placeCompact } from '../src/shell/badge-placement.ts';
import { SHELL_CSS_MARKER } from '../src/shell/frames/registry.ts';
import { createFakeRuntime } from './fixtures/fake-runtime.ts';
import LiveList from './fixtures/LiveList.svelte';
import ProbeApp from './fixtures/ProbeApp.svelte';

// Unit tests load no stylesheet. Simulate a prototype whose app.css imports the
// renderer CSS (ShellHost frames only when its marker is present).
beforeEach(() => {
  document.documentElement.style.setProperty(SHELL_CSS_MARKER, '1');
});

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

  async function boot(
    options: {
      persistent?: boolean;
      fail?: boolean;
      i18n?: Parameters<typeof mountPrototype>[0]['i18n'];
      toaster?: Parameters<typeof mountPrototype>[0]['toaster'];
    } = {}
  ) {
    const target = document.body.appendChild(document.createElement('div'));
    const runtime = createFakeRuntime({ persistent: options.persistent ?? true });
    const mounted = await mountPrototype({
      definition: runtime.definition,
      App: ProbeApp,
      target,
      search: '',
      devtools: false,
      ...(options.i18n ? { i18n: options.i18n } : {}),
      ...(options.toaster ? { toaster: options.toaster } : {}),
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

  it("labels Texuli's components from mountPrototype({ i18n }), English otherwise", async () => {
    const { target } = await boot({
      i18n: { labels: { 'texuli.toaster.label': 'Notificaciones' }, locale: 'es' },
    });
    expect(target.querySelector('[aria-label="Notificaciones"]')).not.toBeNull();
    expect(target.querySelector('[aria-label="Notifications"]')).toBeNull();
  });

  it('places the toast stack from mountPrototype({ toaster }) (Corag UG-12)', async () => {
    const { target } = await boot({ toaster: { position: 'top-center', offset: 72 } });
    const region = target.querySelector('[aria-label="Notifications"]');
    expect(region?.getAttribute('data-position')).toBe('top-center');
  });

  it('consumes a validated artifact hash before creating the runtime', async () => {
    history.replaceState(null, '', '/?devtools=0#busy--user_0001');
    const runtime = createFakeRuntime();
    const target = document.body.appendChild(document.createElement('div'));
    let runtimeLink: { scenario?: string; actor?: string; devtools?: boolean } | undefined;
    const mounted = await mountPrototype({
      definition: runtime.definition,
      App: ProbeApp,
      target,
      devtools: false,
      createRuntime: (_definition, options) => {
        runtimeLink = options.link;
        return runtime;
      },
    });
    destroy = mounted.destroy;

    expect(runtimeLink).toMatchObject({ scenario: 'busy', actor: 'user_0001', devtools: false });
    expect(location.hash).toBe('#/');
    expect(location.search).toBe('?devtools=0');
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
    expect(root.style.getPropertyValue('--tx-density')).toBe('1.125');
    const cached = JSON.parse(localStorage.getItem('protoyard.fake.appearance') ?? '{}');
    expect(cached.themeId).toBe('ocean');
  });

  it('renders a recovery screen instead of a blank page when boot fails', async () => {
    const { mounted } = await boot({ fail: true });
    expect(mounted.runtime).toBeNull();
    expect(screen.getByRole('heading', { name: /couldn't start/ })).toBeTruthy();
    expect(screen.getByText('version-newer')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reset prototype data/ })).toBeTruthy();
    expect(root.dataset.pyReady).toBe('error');
  });

  it("resets only this prototype's data, control and validation databases", async () => {
    await boot({ fail: true });
    const deleted: string[] = [];
    vi.spyOn(indexedDB, 'deleteDatabase').mockImplementation((name: string) => {
      deleted.push(name);
      const request = {} as IDBOpenDBRequest;
      queueMicrotask(() => request.onsuccess?.(new Event('success')));
      return request;
    });
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload } as Location);
    await fireEvent.click(screen.getByRole('button', { name: /Reset prototype data/ }));
    await fireEvent.click(screen.getByRole('button', { name: /delete this prototype/ }));
    await vi.waitFor(() => expect(deleted).toHaveLength(3));
    expect(
      deleted.every((name) => name.startsWith('protoyard.') && name.split('.').length === 3)
    ).toBe(true);
    expect(deleted.map((name) => name.split('.').at(-1))).toEqual([
      'data',
      'control',
      'validation',
    ]);
    expect(new Set(deleted.map((name) => name.split('.')[1])).size).toBe(1);
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });
});

describe('demo badge placement', () => {
  it('keeps configured areas clear and uses a compact phone marker', () => {
    const container = { left: 0, top: 0, width: 390, height: 844 };
    const nav = { left: 0, top: 790, width: 390, height: 54 };
    const heading = { left: 8, top: 6, width: 374, height: 24 };
    expect(placeBadge(container, { width: 120, height: 28 }, () => null, [nav])).toBe('top-left');
    expect(COMPACT_SIZE).toBeLessThan(20);
    const compact = placeCompact(container, () => null, [nav, heading]);
    expect(compact).not.toBeNull();
    if (!compact) throw new Error('expected a compact spot outside the heading and navigation');
    expect(compact.top + compact.height).toBeLessThanOrEqual(nav.top);
    expect(
      compact.top + compact.height <= heading.top || compact.top >= heading.top + heading.height
    ).toBe(true);
    expect(placeCompact(container, () => null, [container])).toBeNull();
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
