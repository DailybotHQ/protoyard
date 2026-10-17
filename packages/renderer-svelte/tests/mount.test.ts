import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { Dexie, type EntityTable } from 'dexie';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountPrototype } from '../src/index.ts';
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

  it('seeds, mounts the app with reactive bindings and applies the appearance', async () => {
    const { runtime } = await boot();
    expect(runtime.scenarios.active()?.scenario.id).toBe('empty');
    expect(screen.getByTestId('who').textContent).toBe('Olivia Owner');
    expect(screen.getByTestId('can-create').textContent).toBe('yes');
    expect(root.dataset.pyReady).toBe('true');
    expect(root.dataset.pyTheme).toBe('violet');
    expect(window.__protoyard).toBe(runtime);

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
