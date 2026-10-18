import { getDevice, orient, safeAreaOf } from '@protoyard/core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountPrototype } from '../src/index.ts';
import HomeIndicator from '../src/shell/frames/HomeIndicator.svelte';
import PhoneFrame from '../src/shell/frames/PhoneFrame.svelte';
import { activeFrame, FRAMES, STAGE_GUTTER } from '../src/shell/frames/registry.ts';
import StatusBar from '../src/shell/frames/StatusBar.svelte';
import { createFakeRuntime } from './fixtures/fake-runtime.ts';
import ProbeApp from './fixtures/ProbeApp.svelte';

const tick = () => new Promise((r) => setTimeout(r, 0));
const root = document.documentElement;

afterEach(() => {
  cleanup();
  if (typeof location !== 'undefined' && location.hash) location.hash = '';
});

describe('PhoneFrame', () => {
  it('matches catalog dimensions, safe-area CSS vars contract, and cutout for phone-pill', () => {
    const spec = getDevice('phone-pill');
    expect(spec).toBeDefined();
    if (!spec) return;

    const { container } = render(PhoneFrame, { spec, shell: 'phone' });
    const frame = container.querySelector<HTMLElement>('[data-py-frame="phone"]');
    expect(frame).not.toBeNull();
    expect(frame?.style.width).toBe(`${spec.width}px`);
    expect(frame?.style.height).toBe(`${spec.height}px`);
    expect(frame?.getAttribute('data-py-device')).toBe('phone-pill');
    expect(frame?.getAttribute('data-py-cutout')).toBe('pill');
    expect(container.querySelector('[data-py-cutout-shape="pill"]')).not.toBeNull();

    const status = container.querySelector<HTMLElement>('[data-py-status-bar]');
    expect(status).not.toBeNull();
    const insets = safeAreaOf(spec);
    const expectedHeight = Math.max(spec.statusBar.height, insets.top);
    expect(status?.style.height).toBe(`${expectedHeight}px`);
    expect(status?.getAttribute('data-py-status-style')).toBe('split');
    expect(screen.getByText('9:41').tagName).toBe('TIME');

    expect(container.querySelector('[data-py-home-indicator]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Go home' })).toBeTruthy();
  });

  it('draws a punch-hole cutout and standard status bar for phone-punch-hole', () => {
    const spec = getDevice('phone-punch-hole');
    expect(spec).toBeDefined();
    if (!spec) return;

    const { container } = render(PhoneFrame, { spec, shell: 'phone' });
    expect(container.querySelector('[data-py-cutout-shape="punch-hole"]')).not.toBeNull();
    expect(
      container.querySelector('[data-py-status-bar]')?.getAttribute('data-py-status-style')
    ).toBe('standard');
  });

  it('follows light and dark bezel classes from the document color mode tokens', () => {
    const spec = getDevice('phone-pill');
    if (!spec) return;
    const { container } = render(PhoneFrame, { spec, shell: 'phone' });
    // Bezel uses dark: Tailwind variants (zinc-800 / zinc-950) — class list carries both.
    const bezel = container.querySelector('[data-py-frame="phone"] > div');
    expect(bezel?.className).toMatch(/dark:bg-zinc-950/);
    expect(bezel?.className).toMatch(/bg-zinc-800/);
  });

  it('keeps landscape orientation dimensions from orient()', () => {
    const base = getDevice('phone-pill');
    if (!base) return;
    const spec = orient(base, 'landscape');
    const { container } = render(PhoneFrame, { spec, shell: 'phone' });
    const frame = container.querySelector<HTMLElement>('[data-py-frame="phone"]');
    expect(frame?.style.width).toBe(`${spec.width}px`);
    expect(frame?.style.height).toBe(`${spec.height}px`);
    expect(spec.width).toBe(base.height);
    expect(spec.height).toBe(base.width);
  });
});

describe('HomeIndicator', () => {
  it('navigates to the app root hash when activated', async () => {
    const spec = getDevice('phone-pill');
    if (!spec) return;
    render(HomeIndicator, { spec });
    await fireEvent.click(screen.getByRole('button', { name: 'Go home' }));
    expect(location.hash).toBe('#/');
  });
});

describe('StatusBar', () => {
  it('fills the top safe-area inset height', () => {
    const spec = getDevice('phone-pill');
    if (!spec) return;
    const { container } = render(StatusBar, { spec });
    const bar = container.querySelector<HTMLElement>('[data-py-status-bar]');
    const insets = safeAreaOf(spec);
    expect(bar?.style.height).toBe(`${Math.max(spec.statusBar.height, insets.top)}px`);
  });
});

describe('frame registry', () => {
  it('lazy-loads PhoneFrame for the phone shell', async () => {
    const entry = FRAMES.phone;
    expect(entry).toBeDefined();
    const mod = await entry!.load();
    expect(mod.default).toBe(PhoneFrame);
  });
});

describe('browser frame', () => {
  let destroy: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await destroy?.();
    destroy = undefined;
    cleanup();
    document.body.replaceChildren();
    root.removeAttribute('style');
    root.className = '';
    root.removeAttribute('data-py-shell');
    localStorage.clear();
    window.history.replaceState(null, '', `${window.location.pathname}`);
    document.title = '';
  });

  async function boot(options: { origin?: string } = {}) {
    const target = document.body.appendChild(document.createElement('div'));
    location.hash = '#/home';
    document.title = 'CRM Demo';
    const runtime = createFakeRuntime({ persistent: true });
    if (options.origin) {
      const preview = runtime.definition.manifest.preview as {
        chrome?: { origin?: string };
      };
      preview.chrome = { ...(preview.chrome ?? {}), origin: options.origin };
    }
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });

    const mounted = await mountPrototype({
      definition: runtime.definition,
      App: ProbeApp,
      target,
      search: '',
      devtools: false,
      createRuntime: () => runtime,
    });
    destroy = mounted.destroy;
    return { mounted, runtime, target };
  }

  it('registers the browser shell frame and frames it when the window fits', () => {
    expect(FRAMES.browser).toBeDefined();
    const laptop = getDevice('laptop-window');
    expect(laptop).toBeDefined();
    const margin = FRAMES.browser?.margin ?? 0;
    const fits = (laptop?.width ?? 0) + 2 * (margin + STAGE_GUTTER);
    expect(
      activeFrame({
        shell: 'browser',
        spec: laptop,
        windowWidth: fits,
        embedded: false,
      })
    ).toBe('browser');
    expect(
      activeFrame({
        shell: 'browser',
        spec: laptop,
        windowWidth: fits - 1,
        embedded: false,
      })
    ).toBe('none');
  });

  it('shows the fictional origin and follows hash route changes', async () => {
    const { runtime, target } = await boot();
    await runtime.theme.setOverride({ shell: 'browser' });
    flushSync();
    await vi.waitFor(() =>
      expect(target.querySelector('[data-py-frame="browser"]')).not.toBeNull()
    );

    expect(root.dataset.pyShell).toBe('browser');
    expect(
      target.querySelector('[data-py-browser-origin]')?.getAttribute('data-py-browser-origin')
    ).toBe('https://fake.example');

    const address = screen.getByRole('textbox', { name: 'Address' }) as HTMLInputElement;
    expect(address.value).toBe('https://fake.example/#/home');
    expect(screen.getByRole('tab', { name: 'CRM Demo' })).toBeTruthy();

    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const forward = vi.spyOn(window.history, 'forward').mockImplementation(() => {});
    expect(screen.getByRole('button', { name: 'Back' }).hasAttribute('disabled')).toBe(true);

    location.hash = '#/deals/42';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await waitFor(() => expect(address.value).toBe('https://fake.example/#/deals/42'));
    expect(screen.getByRole('button', { name: 'Back' }).hasAttribute('disabled')).toBe(false);

    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(back).toHaveBeenCalledOnce();
    await fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
    void forward;

    await fireEvent.input(address, { target: { value: 'https://fake.example/#/settings' } });
    await fireEvent.submit(address.closest('form') as HTMLFormElement);
    await waitFor(() => expect(window.location.hash).toBe('#/settings'));
    await waitFor(() => expect(address.value).toBe('https://fake.example/#/settings'));

    back.mockRestore();
    forward.mockRestore();
  });

  it('uses preview.chrome.origin when the manifest sets one', async () => {
    const { runtime, target } = await boot({ origin: 'https://acme.example' });
    await runtime.theme.setOverride({ shell: 'browser' });
    flushSync();
    await vi.waitFor(() =>
      expect(target.querySelector('[data-py-frame="browser"]')).not.toBeNull()
    );
    const address = screen.getByRole('textbox', { name: 'Address' }) as HTMLInputElement;
    expect(address.value).toBe('https://acme.example/#/home');
    expect(
      target.querySelector('[data-py-browser-origin]')?.getAttribute('data-py-browser-origin')
    ).toBe('https://acme.example');
  });

  it('does not remount the app when switching to the browser shell', async () => {
    const { runtime, target } = await boot();
    const before = screen.getByTestId('who');
    await runtime.theme.setOverride({ shell: 'browser' });
    flushSync();
    await vi.waitFor(() =>
      expect(target.querySelector('[data-py-frame="browser"]')).not.toBeNull()
    );
    expect(screen.getByTestId('who')).toBe(before);
    await tick();
  });
});
