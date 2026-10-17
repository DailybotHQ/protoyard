import { fireEvent, screen, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeRuntime } from '../../renderer-svelte/tests/fixtures/fake-runtime.ts';
import { BUILTIN_THEMES } from '../../themes/src/index.ts';
import { type DevtoolsHandle, mountDevtools, reproducibleLink } from '../src/index.ts';
import { loadPrefs } from '../src/persist.ts';

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
    await settle();
    const left = (await indexedDB.databases()).map((d) => d.name).filter((n) => n?.includes('~'));
    expect(left).toEqual([]);
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
});
