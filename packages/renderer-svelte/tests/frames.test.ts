import { getDevice, orient, safeAreaOf } from '@protoyard/core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import HomeIndicator from '../src/shell/frames/HomeIndicator.svelte';
import PhoneFrame from '../src/shell/frames/PhoneFrame.svelte';
import { FRAMES } from '../src/shell/frames/registry.ts';
import SidePanelFrame from '../src/shell/frames/SidePanelFrame.svelte';
import StatusBar from '../src/shell/frames/StatusBar.svelte';
import {
  loadSidePanelWidth,
  SIDE_PANEL_WIDTH_DEFAULT,
  SIDE_PANEL_WIDTH_STEP,
  sidePanelWidthKey,
} from '../src/shell/frames/side-panel-prefs.ts';
import WidgetHostFrame from '../src/shell/frames/WidgetHostFrame.svelte';
import SidePanelHarness from './fixtures/SidePanelHarness.svelte';
import WidgetHostHarness from './fixtures/WidgetHostHarness.svelte';

afterEach(() => {
  cleanup();
  // Home indicator may assign location.hash.
  if (typeof location !== 'undefined' && location.hash) location.hash = '';
  delete window.__protoyardWidget;
  localStorage.clear();
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

describe('side panel shell', () => {
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
