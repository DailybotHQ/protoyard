import { getDevice, orient, rotate, safeAreaOf } from '@protoyard/core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountPrototype } from '../src/index.ts';
import ExtensionPopupFrame from '../src/shell/frames/ExtensionPopupFrame.svelte';
import HomeIndicator from '../src/shell/frames/HomeIndicator.svelte';
import PhoneFrame from '../src/shell/frames/PhoneFrame.svelte';
import { activeFrame, FRAMES, STAGE_GUTTER } from '../src/shell/frames/registry.ts';
import StatusBar from '../src/shell/frames/StatusBar.svelte';
import TabletFrame from '../src/shell/frames/TabletFrame.svelte';
import WidgetHostFrame from '../src/shell/frames/WidgetHostFrame.svelte';
import { createFakeRuntime } from './fixtures/fake-runtime.ts';
import ProbeApp from './fixtures/ProbeApp.svelte';
import WidgetHostHarness from './fixtures/WidgetHostHarness.svelte';

const runtimeMock = vi.hoisted(() => ({ current: null as unknown }));

const tick = () => new Promise((r) => setTimeout(r, 0));
const root = document.documentElement;

vi.mock('../src/context.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/context.ts')>();
  return {
    ...actual,
    getRuntime: () => runtimeMock.current ?? actual.getRuntime(),
  };
});

afterEach(() => {
  cleanup();
  if (typeof location !== 'undefined' && location.hash) location.hash = '';
  delete window.__protoyardWidget;
  runtimeMock.current = null;
});

beforeEach(() => {
  const runtime = createFakeRuntime();
  runtimeMock.current = {
    ...runtime,
    manifest: { ...runtime.manifest, slug: 'demo-extension', name: 'Demo extension', icon: '🧪' },
  };
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
    expect(screen.getByRole('time').tagName).toBe('TIME');

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
    expect(safeAreaOf(spec)).toEqual({ top: 0, right: 59, bottom: 21, left: 59 });
  });

  it('persists the phone orientation toggle as a runtime appearance override', async () => {
    const spec = getDevice('phone-pill');
    const runtime = createFakeRuntime();
    runtimeMock.current = runtime;
    if (!spec) return;

    render(PhoneFrame, { spec, shell: 'phone' });
    await fireEvent.click(screen.getByRole('button', { name: 'Rotate phone to landscape' }));
    expect(runtime.theme.appearance().orientation.value).toBe('landscape');
  });
});

describe('tablet frame', () => {
  it('renders catalog dimensions and persists orientation from its control', async () => {
    const runtime = createFakeRuntime();
    runtimeMock.current = runtime;
    const spec = getDevice('tablet');
    if (!spec) return;

    const { container } = render(TabletFrame, { spec, shell: 'tablet' });
    const frame = container.querySelector<HTMLElement>('[data-py-frame="tablet"]');
    expect(frame?.style.width).toBe(`${spec.width}px`);
    expect(frame?.style.height).toBe(`${spec.height}px`);
    expect(container.querySelector('[data-py-home-indicator]')).not.toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Rotate tablet to landscape' }));
    expect(runtime.theme.appearance().orientation.value).toBe('landscape');
  });

  it('rotates tablet and phone catalog geometry and safe-area insets', () => {
    const tablet = getDevice('tablet');
    const phone = getDevice('phone-pill');
    if (!tablet || !phone) return;

    const landscapeTablet = rotate(tablet);
    expect(landscapeTablet.width).toBe(tablet.height);
    expect(landscapeTablet.height).toBe(tablet.width);
    expect(landscapeTablet.orientation).toBe('landscape');
    expect(safeAreaOf(landscapeTablet)).toEqual(tablet.safeArea.landscape);

    const landscapePhone = rotate(phone);
    expect(landscapePhone.width).toBe(phone.height);
    expect(landscapePhone.height).toBe(phone.width);
    expect(safeAreaOf(landscapePhone)).toEqual({ top: 0, right: 59, bottom: 21, left: 59 });
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

describe('status bar', () => {
  it('fills the top safe-area inset height', () => {
    runtimeMock.current = createFakeRuntime();
    const spec = getDevice('phone-pill');
    if (!spec) return;
    const { container } = render(StatusBar, { spec });
    const bar = container.querySelector<HTMLElement>('[data-py-status-bar]');
    const insets = safeAreaOf(spec);
    expect(bar?.style.height).toBe(`${Math.max(spec.statusBar.height, insets.top)}px`);
  });

  it('updates its accessible clock and network glyph from the simulated runtime', async () => {
    const runtime = createFakeRuntime();
    runtimeMock.current = runtime;
    const spec = getDevice('phone-pill');
    if (!spec) return;

    const { container } = render(StatusBar, { spec });
    const time = screen.getByRole('time');
    expect(time.textContent).toBe(
      new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(
        new Date('2026-10-16T10:00:00Z')
      )
    );
    expect(time.getAttribute('datetime')).toBe('2026-10-16T10:00:00.000Z');
    expect(screen.getByLabelText('Signal strong (simulated)')).toBeTruthy();

    runtime.clock.setTime('2026-10-16T15:45:00Z');
    await waitFor(() =>
      expect(time.textContent).toBe(
        new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(
          new Date('2026-10-16T15:45:00Z')
        )
      )
    );
    expect(time.getAttribute('datetime')).toBe('2026-10-16T15:45:00.000Z');

    runtime.environment.set({ network: 'offline' });
    await waitFor(() => expect(screen.getByLabelText('Offline (simulated)')).toBeTruthy());
    expect(container.querySelector('[data-py-signal="offline"]')).toBeTruthy();

    runtime.environment.set({ network: 'online', latencyMs: 1_500 });
    await waitFor(() => expect(screen.getByLabelText('Signal degraded (simulated)')).toBeTruthy());
  });
});

describe('frame registry', () => {
  it('lazy-loads PhoneFrame for the phone shell', async () => {
    const entry = FRAMES.phone;
    expect(entry).toBeDefined();
    const mod = await entry!.load();
    expect(mod.default).toBe(PhoneFrame);
  });

  it('lazy-loads TabletFrame for the tablet shell', async () => {
    const entry = FRAMES.tablet;
    expect(entry).toBeDefined();
    const mod = await entry!.load();
    expect(mod.default).toBe(TabletFrame);
  });

  it('lazy-loads ExtensionPopupFrame for the extension-popup shell', async () => {
    const entry = FRAMES['extension-popup'];
    expect(entry).toBeDefined();
    const mod = await entry!.load();
    expect(mod.default).toBe(ExtensionPopupFrame);
  });
});

describe('extension popup frame', () => {
  const props = { spec: getDevice('laptop-window')!, shell: 'extension-popup' as const };

  it('opens in review mode with the manifest name, icon and popup dimensions', () => {
    const { container } = render(ExtensionPopupFrame, props);
    const frame = container.querySelector<HTMLElement>('[data-py-frame="extension-popup"]');
    const popup = container.querySelector<HTMLElement>('[data-py-extension-chrome]');

    expect(frame?.dataset.open).toBe('true');
    expect(popup?.className).toContain('w-[360px]');
    expect(popup?.className).toContain('h-[688px]');
    expect(screen.getByRole('button', { name: 'Open Demo extension' }).textContent).toContain('🧪');
  });

  it('toggles from the toolbar and closes on Escape or an outside click', async () => {
    const { container } = render(ExtensionPopupFrame, props);
    const frame = container.querySelector<HTMLElement>('[data-py-frame="extension-popup"]');
    const trigger = screen.getByRole('button', { name: 'Open Demo extension' });

    await fireEvent.click(screen.getByRole('button', { name: 'Toggle extensions menu' }));
    expect(screen.getByRole('menu', { name: 'Browser extensions' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Demo extension' }));
    expect(screen.queryByRole('menu', { name: 'Browser extensions' })).toBeNull();
    expect(frame?.dataset.open).toBe('true');

    await fireEvent.click(trigger);
    expect(frame?.dataset.open).toBe('false');
    await fireEvent.click(trigger);
    expect(frame?.dataset.open).toBe('true');
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(frame?.dataset.open).toBe('false');

    await fireEvent.click(trigger);
    await fireEvent.pointerDown(document.body);
    expect(frame?.dataset.open).toBe('false');
  });

  it('stays open after an outside click while pinned', async () => {
    const { container } = render(ExtensionPopupFrame, props);
    const frame = container.querySelector<HTMLElement>('[data-py-frame="extension-popup"]');

    await fireEvent.click(screen.getByRole('button', { name: 'Pin extension popup' }));
    expect(
      screen.getByRole('button', { name: 'Unpin extension popup' }).getAttribute('aria-pressed')
    ).toBe('true');
    await fireEvent.pointerDown(document.body);
    expect(frame?.dataset.open).toBe('true');
  });
});

describe('frame registry', () => {
  it('lazy-loads WidgetHostFrame for the widget-host shell', async () => {
    const entry = FRAMES['widget-host'];
    expect(entry).toBeDefined();
    const mod = await entry!.load();
    expect(mod.default).toBe(WidgetHostFrame);
  });
});

describe('widget host shell', () => {
  it('opens and closes the panel from the launcher with aria-expanded', async () => {
    render(WidgetHostHarness);
    const launcher = screen.getByRole('button', { name: 'Open chat' });
    const panel = screen.getByTestId('widget-screen');
    expect(launcher.getAttribute('aria-expanded')).toBe('false');
    expect(panel.getAttribute('data-py-widget-panel')).toBe('closed');

    await fireEvent.click(launcher);
    expect(screen.getByRole('button', { name: 'Close chat' }).getAttribute('aria-expanded')).toBe(
      'true'
    );
    expect(panel.getAttribute('data-py-widget-panel')).toBe('open');
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.style.getPropertyValue('--py-app-height')).toMatch(/px$/);

    await fireEvent.click(screen.getByRole('button', { name: 'Close chat' }));
    expect(screen.getByRole('button', { name: 'Open chat' }).getAttribute('aria-expanded')).toBe(
      'false'
    );
    expect(panel.getAttribute('data-py-widget-panel')).toBe('closed');
  });

  it('closes on Escape and returns focus to the launcher', async () => {
    render(WidgetHostHarness);
    const launcher = screen.getByRole('button', { name: 'Open chat' });
    await fireEvent.click(launcher);
    expect(screen.getByTestId('widget-screen').getAttribute('data-py-widget-panel')).toBe('open');

    await fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.getByTestId('widget-screen').getAttribute('data-py-widget-panel')).toBe(
        'closed'
      )
    );
    await waitFor(() => expect(document.activeElement).toBe(launcher));
  });

  it('drives the unread badge through window.__protoyardWidget.setUnread', async () => {
    render(WidgetHostHarness);
    expect(window.__protoyardWidget).toBeDefined();
    expect(screen.queryByLabelText(/unread/)).toBeNull();

    window.__protoyardWidget?.setUnread(3);
    await waitFor(() => expect(screen.getByLabelText('3 unread')).toBeTruthy());
    expect(
      screen.getByTestId('widget-screen').ownerDocument.querySelector('[data-py-widget-badge]')
        ?.textContent
    ).toBe('3');

    window.__protoyardWidget?.setUnread(0);
    await waitFor(() => expect(screen.queryByLabelText(/unread/)).toBeNull());
  });

  it('renders the fictional host brand on the customer site', () => {
    render(WidgetHostHarness);
    expect(screen.getByText(/Northwind Outfitters \(fictional\)/)).toBeTruthy();
    expect(document.querySelector('[data-py-host-site]')?.getAttribute('data-theme')).toBe('light');
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
    runtimeMock.current = null;
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

  it('rotates the mounted tablet shell and updates safe-area tokens live', async () => {
    const { runtime, target } = await boot();
    await runtime.theme.setOverride({ shell: 'tablet', device: 'tablet' });
    flushSync();
    await vi.waitFor(() => expect(target.querySelector('[data-py-frame="tablet"]')).not.toBeNull());

    const device = target.querySelector<HTMLElement>('[data-py-shell-part="device"]');
    const screen = target.querySelector<HTMLElement>('[data-py-shell-part="screen"]');
    expect(device?.style.width).toBe('820px');
    expect(device?.style.height).toBe('1180px');

    await fireEvent.click(
      target.querySelector('[data-py-orientation-toggle]') as HTMLButtonElement
    );
    await vi.waitFor(() => expect(device?.style.width).toBe('1180px'));
    expect(device?.style.height).toBe('820px');
    expect(screen?.style.getPropertyValue('--py-safe-top')).toBe('24px');
    expect(runtime.theme.appearance().orientation.value).toBe('landscape');
  });

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
