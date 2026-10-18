import { getDevice } from '@protoyard/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountPrototype } from '../src/index.ts';
import DesktopWindowFrame from '../src/shell/frames/DesktopWindowFrame.svelte';
import { activeFrame, FRAMES, screenInsetOf, windowVariant } from '../src/shell/frames/registry.ts';
import { createFakeRuntime } from './fixtures/fake-runtime.ts';
import ProbeApp from './fixtures/ProbeApp.svelte';

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
});
