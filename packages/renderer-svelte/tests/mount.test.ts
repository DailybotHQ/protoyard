import { render, screen } from '@testing-library/svelte';
import { Dexie, type EntityTable } from 'dexie';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { mountPrototype } from '../src/index.ts';
import { createFakeRuntime } from './fixtures/fake-runtime.ts';
import LiveList from './fixtures/LiveList.svelte';
import ProbeApp from './fixtures/ProbeApp.svelte';

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
    const cached = JSON.parse(localStorage.getItem('protoyard.fake.appearance') ?? '{}');
    expect(cached.themeId).toBe('ocean');
  });

  it('shows a storage warning banner when persistence is degraded', async () => {
    await boot({ persistent: false });
    expect(screen.getByRole('status').textContent).toContain("Changes won't be saved.");
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
  it('follows table writes and props read inside the querier', async () => {
    const db = new Dexie(`live-${Math.random()}`) as Dexie & {
      items: EntityTable<{ id: string; n: number }, 'id'>;
    };
    db.version(1).stores({ items: 'id, n' });
    await db.items.bulkAdd([
      { id: 'a', n: 1 },
      { id: 'b', n: 5 },
    ]);
    const view = render(LiveList, { db, min: 0 });
    await expect.poll(() => screen.queryByTestId('count')?.textContent).toBe('2');
    await db.items.add({ id: 'c', n: 9 });
    await expect.poll(() => screen.queryByTestId('count')?.textContent).toBe('3');
    await view.rerender({ db, min: 5 });
    await expect.poll(() => screen.queryByTestId('count')?.textContent).toBe('2');
    view.unmount();
    await tick();
    db.close();
  });
});
