import { fireEvent, screen, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeRuntime } from '../../renderer-svelte/tests/fixtures/fake-runtime.ts';
import { BUILTIN_THEMES } from '../../themes/src/index.ts';
import { LAYOUT_REGISTRY } from '../../ui/src/layouts/registry.ts';
import { mountDevtools } from '../src/index.ts';
import { reproducibleLink } from '../src/link.ts';

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  flushSync();
};

describe('DevTools layout picker', () => {
  let handle: ReturnType<typeof mountDevtools> | undefined;
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
    return { runtime, panel: screen.getByRole('complementary', { name: 'Protoyard DevTools' }) };
  }

  async function openLookTab(panel: HTMLElement) {
    await fireEvent.click(within(panel).getByRole('tab', { name: 'Look' }));
    await settle();
  }

  it('hides the layout section for a custom-only prototype', async () => {
    const { panel } = await open();
    await openLookTab(panel);
    expect(within(panel).queryByRole('combobox', { name: 'App layout' })).toBeNull();
  });

  it('lists supported layouts, applies a temporary override, shows its source, and waits while busy', async () => {
    const runtime = createFakeRuntime();
    Object.defineProperty(runtime.manifest.preview, 'layout', {
      configurable: true,
      value: { id: 'sidebar', supported: ['sidebar', 'marketing'] },
    });
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const setOverride = vi.fn(() => pending);
    runtime.theme.setOverride = setOverride;

    const { panel } = await open(runtime);
    await openLookTab(panel);
    const section = within(panel).getByText('Layout', { selector: 'h3' }).closest('section');
    expect(section).toBeTruthy();
    if (!section) return;
    const select = within(section).getByRole('combobox', {
      name: 'App layout',
    }) as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      'Sidebar',
      'Marketing page',
    ]);
    expect(within(section).getByText('default')).toBeTruthy();

    await fireEvent.change(select, { target: { value: 'marketing' } });
    await settle();
    expect(setOverride).toHaveBeenCalledWith({ layout: 'marketing' });
    expect(select.disabled).toBe(true);
    expect(select.getAttribute('aria-busy')).toBe('true');
    release?.();
    await settle();
    expect(select.disabled).toBe(false);
  });

  it('carries the layout override in the DevTools share link', async () => {
    const { runtime, panel } = await open();
    await runtime.overrides.set({ layout: 'marketing' });
    await fireEvent.click(within(panel).getByRole('tab', { name: 'Share' }));
    await settle();
    const link = within(panel).getByText('Open this scenario').parentElement?.querySelector('code');
    expect(link?.textContent).toContain('layout=marketing');
    expect(
      reproducibleLink(runtime, { href: 'https://x.test/app/?layout=sidebar#/signin' })
    ).toContain('layout=marketing');
  });

  it('loads every registered layout through its own lazy loader', async () => {
    const expected = [
      'sidebar',
      'rail',
      'top-nav',
      'dual-sidebar',
      'master-detail',
      'dashboard-grid',
      'docs',
      'marketing',
      'wizard',
      'auth-split',
      'mobile-tabs',
      'mobile-drawer',
    ];
    expect(Object.keys(LAYOUT_REGISTRY).sort()).toEqual(expected.sort());
    for (const id of expected) {
      const entry = LAYOUT_REGISTRY[id as keyof typeof LAYOUT_REGISTRY];
      expect(entry?.load, id).toBeTypeOf('function');
      expect((await entry?.load())?.default, id).toBeTruthy();
    }
  }, 30000);
});
