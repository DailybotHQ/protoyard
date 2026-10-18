import { getDevice, orient, safeAreaOf } from '@protoyard/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ExtensionPopupFrame from '../src/shell/frames/ExtensionPopupFrame.svelte';
import HomeIndicator from '../src/shell/frames/HomeIndicator.svelte';
import PhoneFrame from '../src/shell/frames/PhoneFrame.svelte';
import { FRAMES } from '../src/shell/frames/registry.ts';
import StatusBar from '../src/shell/frames/StatusBar.svelte';

vi.mock('../src/context.ts', () => ({
  getRuntime: () => ({
    manifest: { slug: 'demo-extension', name: 'Demo extension', icon: '🧪' },
  }),
}));

afterEach(() => {
  cleanup();
  // Home indicator may assign location.hash.
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
