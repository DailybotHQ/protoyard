import { getDevice, orient, safeAreaOf } from '@protoyard/core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExtensionPopupFrame from '../src/shell/frames/ExtensionPopupFrame.svelte';
import HomeIndicator from '../src/shell/frames/HomeIndicator.svelte';
import PhoneFrame from '../src/shell/frames/PhoneFrame.svelte';
import { FRAMES } from '../src/shell/frames/registry.ts';
import StatusBar from '../src/shell/frames/StatusBar.svelte';
import WidgetHostFrame from '../src/shell/frames/WidgetHostFrame.svelte';
import { createFakeRuntime } from './fixtures/fake-runtime.ts';
import WidgetHostHarness from './fixtures/WidgetHostHarness.svelte';

const runtimeMock = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('../src/context.ts', () => ({
  getRuntime: () => runtimeMock.current,
}));

afterEach(() => {
  cleanup();
  // Home indicator may assign location.hash.
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
