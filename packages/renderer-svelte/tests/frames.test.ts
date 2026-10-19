import { getDevice, orient, rotate, safeAreaOf } from '@protoyard/core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountPrototype } from '../src/index.ts';
import DesktopWindowFrame from '../src/shell/frames/DesktopWindowFrame.svelte';
import ExtensionPopupFrame from '../src/shell/frames/ExtensionPopupFrame.svelte';
import HomeIndicator from '../src/shell/frames/HomeIndicator.svelte';
import PhoneFrame from '../src/shell/frames/PhoneFrame.svelte';
import {
  activeFrame,
  FRAMES,
  SHELL_CSS_MARKER,
  screenInsetOf,
  windowVariant,
} from '../src/shell/frames/registry.ts';
import SidePanelFrame from '../src/shell/frames/SidePanelFrame.svelte';
import StatusBar from '../src/shell/frames/StatusBar.svelte';
import {
  loadSidePanelWidth,
  SIDE_PANEL_WIDTH_DEFAULT,
  SIDE_PANEL_WIDTH_STEP,
  sidePanelWidthKey,
} from '../src/shell/frames/side-panel-prefs.ts';
import TabletFrame from '../src/shell/frames/TabletFrame.svelte';
import WidgetHostFrame from '../src/shell/frames/WidgetHostFrame.svelte';
import { createFakeRuntime } from './fixtures/fake-runtime.ts';
import ProbeApp from './fixtures/ProbeApp.svelte';
import SidePanelHarness from './fixtures/SidePanelHarness.svelte';
import WidgetHostHarness from './fixtures/WidgetHostHarness.svelte';

// Unit tests load no stylesheet. Simulate a prototype whose app.css imports the
// renderer CSS (ShellHost frames only when its marker is present).
beforeEach(() => {
  document.documentElement.style.setProperty(SHELL_CSS_MARKER, '1');
});

const runtimeMock = vi.hoisted(() => ({ current: null as unknown }));

// Frames that read the runtime from context get this fake one; tests that mount
// a real prototype clear it and fall back to the real context module.
vi.mock('../src/context.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/context.ts')>();
  return {
    ...actual,
    getRuntime: () => runtimeMock.current ?? actual.getRuntime(),
  };
});

const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  cleanup();
  // Home indicator may assign location.hash.
  if (typeof location !== 'undefined' && location.hash) location.hash = '';
  delete window.__protoyardWidget;
  localStorage.clear();
  runtimeMock.current = null;
});

beforeEach(() => {
  const runtime = createFakeRuntime();
  runtimeMock.current = {
    ...runtime,
    manifest: { ...runtime.manifest, slug: 'demo-extension', name: 'Demo extension', icon: '🧪' },
  };
});

describe('device bezels never paint over the app', () => {
  // The phone and tablet bezels sit above the screen (frame z-index 1). They draw the
  // bezel with their border only; a background fill hid every framed app.
  const opaqueFill = /(^|\s)(dark:)?bg-(?!transparent\b)\S+/;

  it('keeps the phone and tablet bezel interiors transparent', () => {
    const phone = getDevice('phone-pill');
    const tablet = getDevice('tablet');
    if (!phone || !tablet) throw new Error('catalog devices missing');
    runtimeMock.current = createFakeRuntime();
    for (const [Frame, spec, shell] of [
      [PhoneFrame, phone, 'phone'],
      [TabletFrame, tablet, 'tablet'],
    ] as const) {
      const { container } = render(Frame, { spec, shell });
      const bezel = container.querySelector<HTMLElement>('[data-py-frame-decoration]');
      expect(bezel, shell).not.toBeNull();
      expect(bezel?.className, `${shell} bezel`).not.toMatch(opaqueFill);
      cleanup();
    }
  });
});

describe('the rotate control never covers the screen', () => {
  // jsdom has no layout, so check the geometry contract: the button is placed
  // beyond the right edge of the device (past its bezel), and the frame margin
  // reserves room for it. shell-layout.spec.ts measures the real rects.
  it('places the phone and tablet rotate buttons beside the bezel, inside the frame margin', () => {
    const phone = getDevice('phone-pill');
    const tablet = getDevice('tablet');
    if (!phone || !tablet) throw new Error('catalog devices missing');
    runtimeMock.current = createFakeRuntime();
    for (const [Frame, spec, shell, bezel] of [
      [PhoneFrame, phone, 'phone', 12],
      [TabletFrame, tablet, 'tablet', 22],
    ] as const) {
      const { container } = render(Frame, { spec, shell });
      const button = container.querySelector<HTMLElement>('[data-py-orientation-toggle]');
      expect(button, shell).not.toBeNull();
      const left = button?.style.left ?? '';
      const offset = Number(/^calc\(100% \+ (\d+)px\)$/.exec(left)?.[1] ?? Number.NaN);
      // Starts past the device edge and its bezel ring.
      expect(offset, `${shell} left: ${left}`).toBeGreaterThan(bezel);
      // No class pins it back inside the device (right-*, inset-*).
      expect(button?.className, shell).not.toMatch(/(^|\s)(right|inset|left)-/);
      // size-8 = 32 px; the margin used for fit scaling covers bezel + gap + button.
      expect(button?.className, shell).toMatch(/(^|\s)size-8(\s|$)/);
      expect(FRAMES[shell]?.margin ?? 0, `${shell} margin`).toBeGreaterThanOrEqual(offset + 32);
      cleanup();
    }
  });
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
    // The bezel ring is its border, with dark: variants (zinc-800 / zinc-950). Its
    // interior stays transparent so the app shows through (see "never paint over").
    const bezel = container.querySelector('[data-py-frame-decoration]');
    expect(bezel?.className).toMatch(/(^|\s)border-zinc-800(\s|$)/);
    expect(bezel?.className).toMatch(/dark:border-zinc-950/);
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
  it('keeps its hit area inside the bottom safe-area inset in both orientations', () => {
    const base = getDevice('phone-pill');
    if (!base) throw new Error('missing phone-pill');
    for (const spec of [base, orient(base, 'landscape')]) {
      const { container } = render(HomeIndicator, { spec });
      const host = container.querySelector<HTMLElement>('[data-py-home-indicator]');
      // Landscape: 21 px inset although the indicator spec says 34 px.
      expect(host?.style.height, spec.orientation).toBe(`${safeAreaOf(spec).bottom}px`);
      // The button fills that strip and never grows past it.
      const button = screen.getByRole('button', { name: 'Go home' });
      expect(button.className).toMatch(/(^|\s)h-full(\s|$)/);
      expect(button.className).not.toMatch(/(^|\s)p(y|t)?-[1-9]/);
      cleanup();
    }
  });

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

  it('lazy-loads SidePanelFrame for the side-panel shell', async () => {
    const entry = FRAMES['side-panel'];
    expect(entry).toBeDefined();
    const mod = await entry!.load();
    expect(mod.default).toBe(SidePanelFrame);
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

const laptop = getDevice('laptop-window');
const root = document.documentElement;

function renderWindow(props: { os?: 'mac' | 'windows'; maximized?: boolean } = {}) {
  const setMaximized = vi.fn();
  const setScreenHidden = vi.fn();
  if (!laptop) throw new Error('missing laptop-window');
  const result = render(DesktopWindowFrame, {
    spec: laptop,
    shell: 'desktop-window',
    chrome: props.os ? { os: props.os } : undefined,
    app: { name: 'Fake Prototype', icon: '🧪' },
    maximized: props.maximized ?? false,
    setMaximized,
    setScreenHidden,
  });
  return { ...result, setMaximized, setScreenHidden };
}

describe('desktop window frame', () => {
  afterEach(() => {
    cleanup();
    document.title = '';
  });

  it('desktop window: picks the variant from chrome.os, else from the visitor platform', () => {
    expect(windowVariant('mac', 'Win32')).toBe('mac-like');
    expect(windowVariant('windows', 'MacIntel')).toBe('windows-like');
    expect(windowVariant(undefined, 'Win32')).toBe('windows-like');
    expect(windowVariant(undefined, 'MacIntel')).toBe('mac-like');
    expect(windowVariant(undefined, 'Linux x86_64')).toBe('mac-like');
  });

  it('desktop window: draws mac-like and windows-like chrome with a dock or taskbar', () => {
    const mac = renderWindow({ os: 'mac' });
    expect(mac.container.querySelector('[data-window-chrome]')?.getAttribute('data-variant')).toBe(
      'mac-like'
    );
    expect(mac.container.querySelector('[data-py-dock]')?.getAttribute('data-py-dock')).toBe(
      'dock'
    );
    // The wallpaper is gradients from theme tokens, never an image.
    const wallpaper = mac.container.querySelector<HTMLElement>('[data-py-wallpaper]');
    const paint = wallpaper?.style.getPropertyValue('--py-wallpaper') ?? '';
    expect(paint).toMatch(/gradient/);
    expect(paint).toMatch(/var\(--color-primary\)/);
    expect(paint).not.toMatch(/url\(/);
    cleanup();

    const win = renderWindow({ os: 'windows' });
    expect(win.container.querySelector('[data-window-chrome]')?.getAttribute('data-variant')).toBe(
      'windows-like'
    );
    expect(win.container.querySelector('[data-py-dock]')?.getAttribute('data-py-dock')).toBe(
      'taskbar'
    );
    // Windows-like order: title first, then minimize · maximize · close.
    const controls = [...win.container.querySelectorAll('[data-window-control]')].map((el) =>
      el.getAttribute('data-window-control')
    );
    expect(controls).toEqual(['minimize', 'maximize', 'close']);
  });

  it('desktop window: keeps the title bar in sync with document.title', async () => {
    document.title = 'Items · Fake Prototype';
    const { container } = renderWindow({ os: 'mac' });
    const titleText = () => container.querySelector('[data-window-title]')?.textContent?.trim();
    expect(titleText()).toBe('Items · Fake Prototype');
    document.title = 'Deal · Fake Prototype';
    await vi.waitFor(() => expect(titleText()).toBe('Deal · Fake Prototype'));
  });

  it('desktop window: minimize, dock restore, close and reopen all work', async () => {
    const { container, setScreenHidden } = renderWindow({ os: 'mac' });
    expect(setScreenHidden).toHaveBeenLastCalledWith(false);

    await fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    expect(setScreenHidden).toHaveBeenLastCalledWith(true);
    expect(container.querySelector('[data-window-chrome]')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Restore Fake Prototype' }));
    expect(setScreenHidden).toHaveBeenLastCalledWith(false);
    expect(container.querySelector('[data-window-chrome]')?.getAttribute('data-state')).toBe(
      'open'
    );

    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(setScreenHidden).toHaveBeenLastCalledWith(true);
    expect(screen.getByText('Window closed')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Reopen Fake Prototype' }));
    expect(setScreenHidden).toHaveBeenLastCalledWith(false);

    // The dock also reopens a closed window.
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Open Fake Prototype' }));
    expect(setScreenHidden).toHaveBeenLastCalledWith(false);
  });

  it('desktop window: maximize asks the host to fill the stage and hides the dock', async () => {
    const { setMaximized, container, rerender } = renderWindow({ os: 'windows' });
    await fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));
    expect(setMaximized).toHaveBeenLastCalledWith(true);
    await rerender({ maximized: true });
    expect(container.querySelector('[data-py-dock]')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(setMaximized).toHaveBeenLastCalledWith(false);
  });

  it('desktop window: minimizing a maximized window keeps the dock reachable and restores it maximized', async () => {
    const { setMaximized, setScreenHidden, container, rerender } = renderWindow({ os: 'mac' });
    await fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));
    expect(setMaximized).toHaveBeenLastCalledWith(true);
    await rerender({ maximized: true });
    expect(container.querySelector('[data-py-dock]')).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    expect(setScreenHidden).toHaveBeenLastCalledWith(true);
    // The frame hands the stage back so the dock is on screen again…
    expect(setMaximized).toHaveBeenLastCalledWith(false);
    // …and the dock renders even before the host applies that change.
    const dock = screen.getByRole('button', { name: 'Restore Fake Prototype' });
    expect(container.querySelector('[data-py-dock]')).not.toBeNull();
    await rerender({ maximized: false });

    await fireEvent.click(dock);
    expect(setScreenHidden).toHaveBeenLastCalledWith(false);
    expect(setMaximized).toHaveBeenLastCalledWith(true);
    expect(container.querySelector('[data-window-chrome]')?.getAttribute('data-state')).toBe(
      'open'
    );
  });

  it('desktop window: registers a lazy frame with a title-bar inset and a fixed minimum width', async () => {
    const entry = FRAMES['desktop-window'];
    expect(entry).toBeDefined();
    expect(screenInsetOf(entry)).toEqual({ top: 40, right: 0, bottom: 0, left: 0 });
    expect(typeof (await entry?.load())?.default).toBe('function');
    const base = { shell: 'desktop-window' as const, spec: laptop, embedded: false };
    // Windows scale down on smaller desktops instead of going full-bleed…
    expect(activeFrame({ ...base, windowWidth: 1024 })).toBe('desktop-window');
    // …but a phone-sized window, or an embedded preview, gets the bare app.
    expect(activeFrame({ ...base, windowWidth: 600 })).toBe('none');
    expect(activeFrame({ ...base, windowWidth: 1440, embedded: true })).toBe('none');
  });
});

describe('desktop window shell in ShellHost', () => {
  let destroy: (() => Promise<void>) | undefined;
  beforeEach(() => {
    runtimeMock.current = null;
  });
  afterEach(async () => {
    await destroy?.();
    destroy = undefined;
    document.body.replaceChildren();
    localStorage.clear();
  });

  it('desktop window: insets the screen under the title bar and keeps the app mounted while minimized', async () => {
    const target = document.body.appendChild(document.createElement('div'));
    const runtime = createFakeRuntime();
    const mounted = await mountPrototype({
      definition: runtime.definition,
      App: ProbeApp,
      target,
      search: '',
      devtools: false,
      createRuntime: () => runtime,
    });
    destroy = mounted.destroy;
    const app = screen.getByTestId('who');

    await runtime.theme.setOverride({ shell: 'desktop-window' });
    flushSync();
    await vi.waitFor(() => expect(target.querySelector('[data-window-chrome]')).not.toBeNull());
    expect(root.dataset.pyShell).toBe('desktop-window');

    const screenEl = target.querySelector<HTMLElement>('[data-py-shell-part="screen"]');
    const device = target.querySelector<HTMLElement>('[data-py-shell-part="device"]');
    expect(device?.style.width).toBe(`${laptop?.width}px`);
    expect(device?.style.height).toBe(`${laptop?.height}px`);
    expect(screenEl?.style.inset).toBe('40px 0px 0px 0px');
    expect(screenEl?.style.getPropertyValue('--py-app-height')).toBe(
      `${(laptop?.height ?? 0) - 40}px`
    );
    // Only the bottom corners are rounded; the top ones meet the title bar.
    expect(screenEl?.style.borderRadius).toBe(
      `0px 0px ${laptop?.cornerRadius}px ${laptop?.cornerRadius}px`
    );

    await fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    expect(screenEl?.style.visibility).toBe('hidden');
    expect(screenEl?.getAttribute('aria-hidden')).toBe('true');
    // Minimized apps keep running: same component instance, nothing remounted.
    expect(screen.getByTestId('who')).toBe(app);
    await fireEvent.click(screen.getByRole('button', { name: /^Restore / }));
    expect(screenEl?.style.visibility).toBe('');
    expect(screen.getByTestId('who')).toBe(app);
  });
  it('desktop window: maximize, minimize, then restore from the dock in the mounted shell', async () => {
    const target = document.body.appendChild(document.createElement('div'));
    const runtime = createFakeRuntime();
    const mounted = await mountPrototype({
      definition: runtime.definition,
      App: ProbeApp,
      target,
      search: '',
      devtools: false,
      createRuntime: () => runtime,
    });
    destroy = mounted.destroy;
    await runtime.theme.setOverride({ shell: 'desktop-window' });
    flushSync();
    await vi.waitFor(() => expect(target.querySelector('[data-window-chrome]')).not.toBeNull());
    const device = target.querySelector<HTMLElement>('[data-py-shell-part="device"]');
    const screenEl = target.querySelector<HTMLElement>('[data-py-shell-part="screen"]');

    await fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));
    expect(device?.hasAttribute('data-py-maximized')).toBe(true);
    expect(target.querySelector('[data-py-dock]')).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    expect(screenEl?.style.visibility).toBe('hidden');
    // Never stranded: the stage is handed back and the dock can restore the window.
    expect(device?.hasAttribute('data-py-maximized')).toBe(false);
    const dock = target.querySelector<HTMLButtonElement>('[data-py-dock-app]');
    expect(dock).not.toBeNull();
    expect(dock?.getAttribute('aria-label')).toMatch(/^Restore /);

    await fireEvent.click(dock as HTMLButtonElement);
    expect(screenEl?.style.visibility).toBe('');
    expect(device?.hasAttribute('data-py-maximized')).toBe(true);
    expect(target.querySelector('[data-window-chrome]')?.getAttribute('data-state')).toBe('open');
  });
});

describe('side panel shell', () => {
  // The harness provides its own runtime through context; use the real module.
  beforeEach(() => {
    runtimeMock.current = null;
  });

  it('resizes the plugin panel with arrow keys on the separator', async () => {
    render(SidePanelHarness);
    const screenEl = await waitFor(() => screen.getByTestId('side-panel-screen'));
    await waitFor(() => expect(screenEl.style.width).toBe(`${SIDE_PANEL_WIDTH_DEFAULT}px`));
    const splitter = screen.getByRole('separator', { name: 'Resize plugin panel' });
    expect(splitter.getAttribute('aria-valuenow')).toBe(String(SIDE_PANEL_WIDTH_DEFAULT));

    await fireEvent.keyDown(splitter, { key: 'ArrowLeft' });
    const wider = SIDE_PANEL_WIDTH_DEFAULT + SIDE_PANEL_WIDTH_STEP;
    await waitFor(() => expect(splitter.getAttribute('aria-valuenow')).toBe(String(wider)));
    expect(screenEl.style.width).toBe(`${wider}px`);
    expect(screenEl.style.getPropertyValue('--py-app-height')).toMatch(/px$/);

    await fireEvent.keyDown(splitter, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(splitter.getAttribute('aria-valuenow')).toBe(String(SIDE_PANEL_WIDTH_DEFAULT))
    );
  });

  it('collapses and expands the plugin panel', async () => {
    render(SidePanelHarness);
    const screenEl = await waitFor(() => screen.getByTestId('side-panel-screen'));
    await waitFor(() => expect(screenEl.getAttribute('data-py-side-panel')).toBe('open'));

    await fireEvent.click(screen.getByRole('button', { name: 'Collapse plugin' }));
    await waitFor(() => expect(screenEl.getAttribute('data-py-side-panel')).toBe('collapsed'));
    expect(screenEl.style.width).toBe('0px');
    expect(
      screen.getByRole('button', { name: 'Expand plugin' }).getAttribute('aria-expanded')
    ).toBe('false');

    await fireEvent.click(screen.getByRole('button', { name: 'Expand plugin' }));
    await waitFor(() => expect(screenEl.getAttribute('data-py-side-panel')).toBe('open'));
    expect(
      screen.getByRole('button', { name: 'Collapse plugin' }).getAttribute('aria-expanded')
    ).toBe('true');
  });

  it('switches host variants and lazy-loads each host chunk', async () => {
    const { unmount } = render(SidePanelHarness, { hostVariant: 'chat-workspace' });
    await waitFor(() =>
      expect(document.querySelector('[data-py-side-host="chat-workspace"]')).not.toBeNull()
    );
    expect(
      document
        .querySelector('[data-py-frame="side-panel"]')
        ?.getAttribute('data-py-side-host-variant')
    ).toBe('chat-workspace');
    unmount();

    render(SidePanelHarness, { hostVariant: 'design-canvas' });
    await waitFor(() =>
      expect(document.querySelector('[data-py-side-host="design-canvas"]')).not.toBeNull()
    );

    cleanup();
    render(SidePanelHarness, { hostVariant: 'code-editor' });
    await waitFor(() =>
      expect(document.querySelector('[data-py-side-host="code-editor"]')).not.toBeNull()
    );
  });

  it('persists panel width as a local preference', async () => {
    render(SidePanelHarness);
    const splitter = await waitFor(() =>
      screen.getByRole('separator', { name: 'Resize plugin panel' })
    );
    await fireEvent.keyDown(splitter, { key: 'ArrowLeft' });
    const expected = SIDE_PANEL_WIDTH_DEFAULT + SIDE_PANEL_WIDTH_STEP;
    await waitFor(() =>
      expect(localStorage.getItem(sidePanelWidthKey('side-panel'))).toBe(String(expected))
    );
    expect(loadSidePanelWidth('side-panel')).toBe(expected);
  });
});

describe('browser frame', () => {
  let destroy: (() => Promise<void>) | undefined;
  // BrowserFrame reads the mounted runtime; use the real context module.
  beforeEach(() => {
    runtimeMock.current = null;
  });

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
    // Browser chrome sits above the app's screen (tab strip + address bar).
    expect(screenInsetOf(FRAMES.browser).top).toBe(88);
    // Like windows, it scales down on smaller desktops and needs only a fixed minimum width.
    const fits = FRAMES.browser?.minWindowWidth ?? 0;
    expect(fits).toBe(768);
    for (const [windowWidth, expected] of [
      [fits, 'browser'],
      [1024, 'browser'],
      [fits - 1, 'none'],
    ] as const) {
      expect(activeFrame({ shell: 'browser', spec: laptop, windowWidth, embedded: false })).toBe(
        expected
      );
    }
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
    // The frame is exactly the reserved toolbar strip, so it never paints over the app
    // (an inset-0 overlay with an opaque BrowserChrome hid every browser-shell app).
    const frame = target.querySelector<HTMLElement>('[data-py-frame="browser"]');
    expect(frame?.style.height).toBe(`${screenInsetOf(FRAMES.browser).top}px`);
    expect(frame?.className).not.toMatch(/\binset-0\b/);
    expect(target.querySelector<HTMLElement>('[data-py-shell-part="screen"]')?.style.inset).toBe(
      `${screenInsetOf(FRAMES.browser).top}px 0px 0px 0px`
    );

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
