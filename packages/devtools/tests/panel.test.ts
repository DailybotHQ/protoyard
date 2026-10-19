import { fireEvent, screen, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeRuntime } from '../../renderer-svelte/tests/fixtures/fake-runtime.ts';
import { BUILTIN_THEMES } from '../../themes/src/index.ts';
import { type DevtoolsHandle, mountDevtools, reproducibleLink } from '../src/index.ts';
import { loadPrefs } from '../src/persist.ts';

const STYLE_KEYS = ['radius', 'elevation', 'font', 'motion'];

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  flushSync();
};

describe('DevTools panel', () => {
  let handle: DevtoolsHandle | undefined;
  afterEach(async () => {
    await handle?.destroy();
    handle = undefined;
    localStorage.clear();
    document.body.replaceChildren();
  });

  async function open(runtime = createFakeRuntime()) {
    await runtime.scenarios.ensureSeeded();
    handle = mountDevtools({ runtime, themes: BUILTIN_THEMES });
    flushSync();
    await fireEvent.keyDown(window, { key: '.', ctrlKey: true });
    await settle();
    const panel = screen.getByRole('complementary', { name: 'Protoyard DevTools' });
    return { runtime, panel };
  }

  it('toggles with Ctrl+. and remembers open state and tab', async () => {
    const { panel } = await open();
    expect(within(panel).getByText('Active scenario')).toBeTruthy();
    await fireEvent.click(within(panel).getByRole('tab', { name: 'Time' }));
    await settle();
    expect(loadPrefs('fake')).toEqual({ open: true, tab: 'time' });
    await fireEvent.keyDown(panel, { key: 'Escape' });
    await settle();
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.getByRole('button', { name: /Open Protoyard DevTools/ })).toBeTruthy();
  });

  it('docks the launcher to the right edge on phone widths so it never covers bottom controls', async () => {
    const width = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    try {
      const runtime = createFakeRuntime();
      await runtime.scenarios.ensureSeeded();
      handle = mountDevtools({ runtime, themes: BUILTIN_THEMES });
      flushSync();
      await settle();
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      await settle();
      const launcher = screen.getByRole('button', { name: /Open Protoyard DevTools/ });
      expect(launcher.className).toContain('right-0');
      expect(launcher.className).toContain('top-1/2');
      expect(launcher.textContent?.trim()).toBe('');
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    }
  });

  it('opens and closes when the pointer lands on a button icon, not the button box', async () => {
    // Real clicks on an icon-only button target the inner <svg>/<path>. The host's
    // app-layer isolation must not stop Svelte's delegated handler from seeing them.
    const { panel } = await open();
    const closeIcon = within(panel)
      .getByRole('button', { name: 'Close DevTools' })
      .querySelector('svg');
    expect(closeIcon).toBeTruthy();
    await fireEvent.click(closeIcon?.firstElementChild ?? (closeIcon as Element));
    await settle();
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(loadPrefs('fake').open).toBe(false);

    const launcherIcon = screen
      .getByRole('button', { name: /Open Protoyard DevTools/ })
      .querySelector('svg');
    await fireEvent.click(launcherIcon as Element);
    await settle();
    expect(screen.getByRole('complementary', { name: 'Protoyard DevTools' })).toBeTruthy();
    expect(loadPrefs('fake').open).toBe(true);
  });

  it('presentation mode reloads without DevTools and remembers the panel as closed', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...location, href: 'http://x.test/#/', assign });
    const { panel } = await open();
    const icon = within(panel)
      .getByRole('button', { name: /Presentation mode/ })
      .querySelector('svg');
    await fireEvent.click(icon as Element);
    await settle();
    expect(assign).toHaveBeenCalledTimes(1);
    expect(String(assign.mock.calls[0]?.[0])).toContain('devtools=0');
    expect(loadPrefs('fake').open).toBe(false);
    vi.unstubAllGlobals();
  });

  it('switches persona and overrides role without touching data', async () => {
    const { runtime, panel } = await open();
    await fireEvent.click(within(panel).getByRole('tab', { name: 'Personas' }));
    await settle();
    await fireEvent.click(within(panel).getByRole('button', { name: /Victor Viewer/ }));
    await settle();
    expect(runtime.session.principal()?.persona.id).toBe('user_0002');
    const select = within(panel).getByRole('combobox', { name: /Role override/ });
    await fireEvent.change(select, { target: { value: 'owner' } });
    await settle();
    expect(runtime.overrides.get().role).toBe('owner');
    expect(within(panel).getByRole('button', { name: /Reset 1/ })).toBeTruthy();
    await fireEvent.click(within(panel).getByRole('button', { name: /Reset 1/ }));
    await settle();
    expect(runtime.overrides.get()).toEqual({});
  });

  it("a click on a control's inner text or icon reaches its handler (persona, tab, theme)", async () => {
    const { runtime, panel } = await open();
    // Click the label span INSIDE the tab, not the tab button itself.
    const tabLabel = within(panel).getByRole('tab', { name: 'Personas' }).querySelector('span');
    await fireEvent.click(tabLabel as Element);
    await settle();
    const row = within(panel).getByRole('button', { name: /Victor Viewer/ });
    const name = within(row).getByText('Victor Viewer');
    expect(name).not.toBe(row);
    await fireEvent.click(name);
    await settle();
    expect(runtime.session.principal()?.persona.id).toBe('user_0002');

    await fireEvent.click(within(panel).getByRole('tab', { name: 'Look' }));
    await settle();
    const swatch = within(panel).getByRole('radio', { name: /Ocean/ });
    await fireEvent.click(swatch.querySelector('span') as Element);
    await settle();
    expect(runtime.theme.appearance().theme.value).toBe('ocean');
  });

  it('a persona switch shows immediate busy feedback, blocks double triggers and clears', async () => {
    const runtime = createFakeRuntime();
    const realSwitch = runtime.session.switchActor;
    let release!: () => void;
    const calls: string[] = [];
    runtime.session.switchActor = (id) => {
      calls.push(id);
      return new Promise<void>((r) => (release = r)).then(() => realSwitch(id));
    };
    const { panel } = await open(runtime);
    await fireEvent.click(within(panel).getByRole('tab', { name: 'Personas' }));
    await settle();
    const row = within(panel).getByRole('button', { name: /Victor Viewer/ });
    await fireEvent.click(row);
    flushSync();
    expect(row.getAttribute('aria-busy')).toBe('true');
    expect(row.getAttribute('aria-pressed')).toBe('true');
    expect(row.querySelector('.animate-spin')).not.toBeNull();
    expect(panel.querySelector('[data-dt-working]')).not.toBeNull();
    expect(panel.querySelector('header')?.getAttribute('aria-busy')).toBe('true');
    // Every persona control waits: no second switch can start.
    const rows = [...panel.querySelectorAll<HTMLButtonElement>('ul button[aria-pressed]')];
    expect(rows.length).toBeGreaterThan(1);
    for (const other of rows) expect(other.disabled).toBe(true);
    expect(
      (within(panel).getByRole('combobox', { name: /Role override/ }) as HTMLSelectElement).disabled
    ).toBe(true);
    await fireEvent.click(row);
    expect(calls).toEqual(['user_0002']);
    release();
    await settle();
    expect(runtime.session.principal()?.persona.id).toBe('user_0002');
    expect(row.hasAttribute('aria-busy')).toBe(false);
    expect(panel.querySelector('[data-dt-working]')).toBeNull();
  });

  it('shows a failed switch inline, next to the control', async () => {
    const runtime = createFakeRuntime();
    runtime.session.switchActor = () => Promise.reject(new Error('Persona store is locked.'));
    const { panel } = await open(runtime);
    await fireEvent.click(within(panel).getByRole('tab', { name: 'Personas' }));
    await settle();
    await fireEvent.click(within(panel).getByRole('button', { name: /Victor Viewer/ }));
    await settle();
    const alert = within(panel).getByRole('alert');
    expect(alert.textContent).toContain('Persona store is locked.');
    expect(alert.closest('section')?.textContent).toContain('Switch persona');
  });

  it('environment, theme and time controls show busy state while their change applies', async () => {
    const runtime = createFakeRuntime();
    const realSet = runtime.overrides.set;
    let releaseEnv!: () => void;
    runtime.overrides.set = (patch) =>
      new Promise<void>((r) => (releaseEnv = r)).then(() => realSet(patch));
    const { panel } = await open(runtime);
    await fireEvent.click(within(panel).getByRole('tab', { name: 'Env' }));
    await settle();
    const offline = within(panel).getByRole('radio', { name: 'Offline' });
    await fireEvent.click(offline);
    flushSync();
    expect(offline.querySelector('.animate-spin')).not.toBeNull();
    expect((within(panel).getByRole('radio', { name: 'Slow' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(panel.querySelector('[data-dt-working]')).not.toBeNull();
    releaseEnv();
    await settle();
    expect(runtime.overrides.get().environment?.network).toBe('offline');
    expect(offline.querySelector('.animate-spin')).toBeNull();

    const realOverride = runtime.theme.setOverride;
    let releaseTheme!: () => void;
    runtime.theme.setOverride = (patch) =>
      new Promise<void>((r) => (releaseTheme = r)).then(() => realOverride(patch));
    await fireEvent.click(within(panel).getByRole('tab', { name: 'Look' }));
    await settle();
    const ocean = within(panel).getByRole('radio', { name: /Ocean/ });
    await fireEvent.click(ocean);
    flushSync();
    expect(ocean.getAttribute('aria-busy')).toBe('true');
    expect(ocean.querySelector('.animate-spin')).not.toBeNull();
    releaseTheme();
    await settle();
    expect(ocean.hasAttribute('aria-busy')).toBe(false);

    const realAdvance = runtime.scenarios.advance;
    let releaseAdvance!: () => void;
    runtime.scenarios.advance = (d) =>
      new Promise<void>((r) => (releaseAdvance = r)).then(() => realAdvance(d));
    await fireEvent.click(within(panel).getByRole('tab', { name: 'Time' }));
    await settle();
    const one = within(panel).getByRole('button', { name: /Advance 1 day/ });
    await fireEvent.click(one);
    flushSync();
    expect(one.getAttribute('aria-busy')).toBe('true');
    expect(
      (within(panel).getByRole('button', { name: /Advance 7 days/ }) as HTMLButtonElement).disabled
    ).toBe(true);
    releaseAdvance();
    await settle();
    expect(one.hasAttribute('aria-busy')).toBe(false);
  });

  it('loads a scenario only after confirmation', async () => {
    const { runtime, panel } = await open();
    await fireEvent.click(within(panel).getByRole('radio', { name: /Busy/ }));
    await fireEvent.click(within(panel).getByRole('button', { name: 'Load “Busy”' }));
    await settle();
    expect(runtime.scenarios.active()?.scenario.id).toBe('empty');
    await fireEvent.click(within(panel).getByRole('button', { name: 'Replace data' }));
    await settle();
    expect(runtime.scenarios.active()?.scenario.id).toBe('busy');
    expect(within(panel).getByRole('status').textContent).toContain('Loaded “Busy”');
  });

  it('sets environment and appearance overrides with source badges', async () => {
    const { runtime, panel } = await open();
    await fireEvent.click(within(panel).getByRole('tab', { name: 'Env' }));
    await settle();
    await fireEvent.click(within(panel).getByRole('radio', { name: 'Offline' }));
    await settle();
    expect(runtime.overrides.get().environment?.network).toBe('offline');
    expect(within(panel).getAllByText('override').length).toBeGreaterThan(0);
    await fireEvent.input(within(panel).getByLabelText('Add failure scope prefix'), {
      target: { value: 'notes.' },
    });
    await fireEvent.submit(
      within(panel).getByLabelText('Add failure scope prefix').closest('form') as HTMLFormElement
    );
    await settle();
    expect(runtime.overrides.get().environment?.failureScope).toEqual(['notes.']);

    await fireEvent.click(within(panel).getByRole('tab', { name: 'Look' }));
    await settle();
    await fireEvent.click(within(panel).getByRole('radio', { name: /Ocean/ }));
    await settle();
    expect(runtime.theme.appearance().theme).toEqual({ value: 'ocean', source: 'override' });
    await fireEvent.click(within(panel).getByRole('radio', { name: 'Persona preference' }));
    await fireEvent.click(within(panel).getByRole('radio', { name: 'Dark' }));
    await settle();
    expect(runtime.theme.appearance().mode).toEqual({ value: 'dark', source: 'preference' });

    await fireEvent.change(within(panel).getByRole('slider', { name: 'Density' }), {
      target: { value: '0.875' },
    });
    await settle();
    expect(runtime.theme.appearance().density).toEqual({ value: 0.875, source: 'override' });
  });

  it('saves and deletes snapshots and shows table counts', async () => {
    const { runtime, panel } = await open();
    await runtime.scenarios.load('busy');
    await fireEvent.click(within(panel).getByRole('tab', { name: 'Data' }));
    await settle();
    expect(within(panel).getByRole('button', { name: /notes\s*1/ })).toBeTruthy();
    await fireEvent.click(within(panel).getByRole('tab', { name: 'Snaps' }));
    await settle();
    await fireEvent.input(within(panel).getByLabelText('Name'), {
      target: { value: 'Before demo' },
    });
    await fireEvent.submit(within(panel).getByLabelText('Name').closest('form') as HTMLFormElement);
    await settle();
    expect(within(panel).getByText('Before demo')).toBeTruthy();
    await fireEvent.click(within(panel).getByRole('button', { name: 'Delete' }));
    await fireEvent.click(within(panel).getByRole('button', { name: 'Delete snapshot' }));
    await settle();
    expect(await runtime.snapshots.list()).toEqual([]);
  });

  it('refuses oversized snapshot files without reading them', async () => {
    const { panel } = await open();
    await fireEvent.click(within(panel).getByRole('tab', { name: 'Snaps' }));
    await settle();
    const input = panel.querySelector('input[type="file"]') as HTMLInputElement;
    const text = vi.fn(async () => '{}');
    const huge = { name: 'huge.protoyard.json', size: 26 * 1024 * 1024, text };
    Object.defineProperty(input, 'files', { value: [huge], configurable: true });
    await fireEvent.change(input);
    await settle();
    expect(text).not.toHaveBeenCalled();
    expect(within(panel).getByRole('alert').textContent).toMatch(/larger than 25 MB/);
  });

  it('shows the sandbox and discards only it after confirmation', async () => {
    const onDiscard = vi.fn();
    const assign = vi.fn();
    vi.stubGlobal('location', { ...location, href: 'http://x.test/?sandbox=a#/', assign });
    const { panel } = await open(createFakeRuntime({ sandbox: 'a', onDiscard }));
    expect(within(panel).getByText('Sandbox: a')).toBeTruthy();
    await fireEvent.click(within(panel).getByRole('tab', { name: 'Data' }));
    await settle();
    await fireEvent.click(within(panel).getByRole('button', { name: 'Discard sandbox' }));
    await fireEvent.click(within(panel).getByRole('button', { name: 'Delete sandbox' }));
    await settle();
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('http://x.test/#/');
    vi.unstubAllGlobals();
  });

  it('clears other sandboxes from the default world', async () => {
    const make = (name: string) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(name);
        req.onsuccess = () => {
          req.result.close();
          resolve();
        };
        req.onerror = () => reject(req.error);
      });
    await make('protoyard.fake~a.data');
    await make('protoyard.fake~a.control');
    await make('protoyard.fake~b.data');
    const { panel } = await open();
    await fireEvent.click(within(panel).getByRole('tab', { name: 'Data' }));
    await settle();
    await fireEvent.click(within(panel).getByRole('button', { name: 'Clear 2 sandboxes' }));
    await fireEvent.click(within(panel).getByRole('button', { name: 'Delete sandboxes' }));
    // Deletions finish asynchronously; under load they can outlast settle(), so poll.
    await vi.waitFor(
      async () => {
        const left = (await indexedDB.databases())
          .map((d) => d.name)
          .filter((n) => n?.includes('~'));
        expect(left).toEqual([]);
      },
      { timeout: 5000, interval: 25 }
    );
  });

  it('lists mock API requests with status chips and expandable previews', async () => {
    const { createMockApi, json } = await import('@protoyard/http');
    const { runtime, panel } = await open();
    const api = createMockApi(runtime, {
      baseUrl: '/api',
      routes: { 'GET /ping': () => json({ ok: true }) },
    });
    await fireEvent.click(within(panel).getByRole('tab', { name: 'Env' }));
    await settle();
    expect(within(panel).getByText('No mock API requests yet.')).toBeTruthy();
    await api.fetch('/api/ping');
    await api.fetch('/api/missing');
    await settle();
    const list = within(panel).getByRole('list', { name: 'Mock API requests' });
    expect(within(list).getByText('200')).toBeTruthy();
    expect(within(list).getByText('404')).toBeTruthy();
    await fireEvent.click(within(list).getAllByRole('button')[1] as HTMLElement);
    await settle();
    expect(within(list).getByText('GET /ping')).toBeTruthy();
    await fireEvent.click(within(panel).getByRole('button', { name: 'Clear' }));
    await settle();
    expect(within(panel).getByText('No mock API requests yet.')).toBeTruthy();
    api.unregister();
  });

  it('builds reproducible links with only scenario coordinates', async () => {
    const runtime = createFakeRuntime();
    await runtime.scenarios.load('busy', { seed: 99 });
    await runtime.session.switchActor('user_0002');
    const link = reproducibleLink(runtime, {
      href: 'https://x.test/crm/?scenario=old&foo=1#/deals',
    });
    expect(link).toBe('https://x.test/crm/?foo=1&scenario=busy&actor=user_0002&seed=99#/deals');
    expect(reproducibleLink(runtime, { href: 'https://x.test/', presentation: true })).toContain(
      'devtools=0'
    );
  });

  it('includes the style preset overrides in the share link', async () => {
    const runtime = createFakeRuntime();
    await runtime.scenarios.load('busy');
    await runtime.overrides.set({
      radius: 'pill',
      elevation: 'flat',
      font: 'mono',
      motion: 'none',
    });
    const link = reproducibleLink(runtime, {
      href: 'https://x.test/crm/?radius=square&foo=1#/deals',
    });
    const params = new URL(link).searchParams;
    expect(params.get('radius')).toBe('pill');
    expect(params.get('elevation')).toBe('flat');
    expect(params.get('font')).toBe('mono');
    expect(params.get('motion')).toBe('none');
    expect(params.getAll('radius')).toHaveLength(1);
    expect(params.get('foo')).toBe('1');

    await runtime.overrides.clear(['radius', 'elevation', 'font', 'motion']);
    const cleared = new URL(
      reproducibleLink(runtime, { href: 'https://x.test/crm/?radius=square' })
    ).searchParams;
    expect(STYLE_KEYS.some((key) => cleared.has(key))).toBe(false);
  });

  it('selects a shell via setOverride and includes shell= in the share link', async () => {
    const { runtime, panel } = await open();
    const setOverride = vi.spyOn(runtime.theme, 'setOverride');

    await fireEvent.click(within(panel).getByRole('tab', { name: 'Look' }));
    await settle();

    await fireEvent.click(within(panel).getByRole('radio', { name: 'Phone' }));
    await settle();

    expect(setOverride).toHaveBeenCalledWith(expect.objectContaining({ shell: 'phone' }));
    expect(runtime.overrides.get().shell).toBe('phone');
    expect(runtime.theme.appearance().shell).toEqual({ value: 'phone', source: 'override' });

    await fireEvent.click(within(panel).getByRole('tab', { name: 'Share' }));
    await settle();
    const shareLinks = within(panel).getAllByTitle(/shell=phone/);
    expect(shareLinks.length).toBeGreaterThan(0);
    expect(shareLinks.every((el) => el.textContent?.includes('shell=phone'))).toBe(true);
    expect(reproducibleLink(runtime, { href: 'https://x.test/app/#/' })).toContain('shell=phone');

    // Device frame off forces full-bleed (shell none).
    await fireEvent.click(within(panel).getByRole('tab', { name: 'Look' }));
    await settle();
    await fireEvent.click(within(panel).getByRole('switch', { name: 'Device frame' }));
    await settle();
    expect(runtime.overrides.get().shell).toBe('none');
    expect(runtime.theme.appearance().shell.value).toBe('none');
  });
});
