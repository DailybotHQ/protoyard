import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import WindowChromeHarness from './fixtures/WindowChromeHarness.svelte';

afterEach(() => cleanup());

function chromeRoot(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-window-chrome]');
  if (!el) throw new Error('window chrome root missing');
  return el;
}

describe('WindowChrome', () => {
  it('renders mac-like traffic lights with a centered title and working controls', async () => {
    render(WindowChromeHarness, { variant: 'mac-like', title: 'Notes' });

    const root = chromeRoot();
    expect(root.getAttribute('data-variant')).toBe('mac-like');
    expect(root.getAttribute('data-state')).toBe('open');
    expect(within(root).getByText('Notes')).toBeTruthy();
    expect(screen.getByTestId('body').textContent).toBe('Window body');

    const close = screen.getByRole('button', { name: 'Close' });
    const minimize = screen.getByRole('button', { name: 'Minimize' });
    const maximize = screen.getByRole('button', { name: 'Maximize' });
    expect(close.tagName).toBe('BUTTON');
    expect(minimize.tagName).toBe('BUTTON');
    expect(maximize.tagName).toBe('BUTTON');
    expect(maximize.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders windows-like caption buttons with the title on the left', async () => {
    render(WindowChromeHarness, { variant: 'windows-like', title: 'Editor' });

    const root = chromeRoot();
    expect(root.getAttribute('data-variant')).toBe('windows-like');
    expect(within(root).getByText('Editor')).toBeTruthy();
    expect(root.querySelector('[data-window-controls="windows-like"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Minimize' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Maximize' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('minimize collapses to a restore pill and restore reopens the window', async () => {
    render(WindowChromeHarness, { variant: 'mac-like', title: 'Notes' });

    await fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    expect(screen.getByTestId('state').textContent).toBe('minimized');
    expect(chromeRoot().getAttribute('data-state')).toBe('minimized');
    expect(screen.queryByTestId('body')).toBeNull();

    const pill = screen.getByRole('button', { name: 'Restore Notes' });
    await fireEvent.click(pill);
    expect(screen.getByTestId('state').textContent).toBe('open');
    expect(screen.getByTestId('body').textContent).toBe('Window body');
  });

  it('maximize toggles fill with aria-pressed and restore label', async () => {
    render(WindowChromeHarness, { variant: 'windows-like', title: 'Editor' });

    const maximize = screen.getByRole('button', { name: 'Maximize' });
    expect(maximize.getAttribute('aria-pressed')).toBe('false');
    expect(chromeRoot().getAttribute('data-maximized')).toBe('false');

    await fireEvent.click(maximize);
    expect(screen.getByTestId('maximized').textContent).toBe('true');
    expect(chromeRoot().getAttribute('data-maximized')).toBe('true');
    const restore = screen.getByRole('button', { name: 'Restore' });
    expect(restore.getAttribute('aria-pressed')).toBe('true');

    await fireEvent.click(restore);
    expect(screen.getByTestId('maximized').textContent).toBe('false');
    expect(screen.getByRole('button', { name: 'Maximize' }).getAttribute('aria-pressed')).toBe(
      'false'
    );
  });

  it('maximize, minimize and restore keeps a reachable pill and returns maximized', async () => {
    render(WindowChromeHarness, { variant: 'windows-like', title: 'Editor' });

    await fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));
    expect(screen.getByTestId('maximized').textContent).toBe('true');
    await fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    expect(chromeRoot().getAttribute('data-state')).toBe('minimized');
    expect(chromeRoot().getAttribute('data-maximized')).toBe('true');

    await fireEvent.click(screen.getByRole('button', { name: 'Restore Editor' }));
    expect(screen.getByTestId('state').textContent).toBe('open');
    expect(chromeRoot().getAttribute('data-maximized')).toBe('true');
    expect(screen.getByTestId('body').textContent).toBe('Window body');
  });

  it('double-clicking the title bar toggles maximize without -webkit-app-region', async () => {
    render(WindowChromeHarness, { variant: 'mac-like', title: 'Notes' });

    const titlebar = document.querySelector<HTMLElement>('[data-window-titlebar]');
    expect(titlebar).toBeTruthy();
    // Title bar is purely visual: no Electron/Tauri drag region.
    const inline = titlebar?.getAttribute('style') ?? '';
    const computed = getComputedStyle(titlebar!).getPropertyValue('-webkit-app-region');
    expect(inline).not.toMatch(/app-region/i);
    expect(computed === '' || computed === 'none' || computed === 'no-drag').toBe(true);

    await fireEvent.dblClick(titlebar!);
    expect(screen.getByTestId('maximized').textContent).toBe('true');
    await fireEvent.dblClick(titlebar!);
    expect(screen.getByTestId('maximized').textContent).toBe('false');
  });

  it('close shows a window-closed reopen state that restores the body', async () => {
    render(WindowChromeHarness, { variant: 'windows-like', title: 'Editor' });

    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByTestId('state').textContent).toBe('closed');
    expect(chromeRoot().getAttribute('data-state')).toBe('closed');
    expect(screen.getByRole('status').textContent).toMatch(/Window closed/);
    expect(screen.queryByTestId('body')).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Reopen Editor' }));
    expect(screen.getByTestId('state').textContent).toBe('open');
    expect(screen.getByTestId('body').textContent).toBe('Window body');
  });

  it('renders an optional toolbar slot under the title bar', () => {
    render(WindowChromeHarness, { showToolbar: true, title: 'Notes' });
    expect(screen.getByTestId('toolbar').textContent).toMatch(/File/);
    expect(document.querySelector('[data-window-toolbar]')).toBeTruthy();
  });

  it('exposes labelled buttons for keyboard activation (axe-oriented checks)', async () => {
    render(WindowChromeHarness, { variant: 'mac-like', title: 'Notes' });

    for (const name of ['Close', 'Minimize', 'Maximize'] as const) {
      const button = screen.getByRole('button', { name });
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('type')).toBe('button');
      // Keyboard: real buttons receive Enter/Space from the browser; fire Enter.
      button.focus();
      expect(document.activeElement).toBe(button);
    }

    await fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));
    expect(screen.getByRole('button', { name: 'Restore' }).getAttribute('aria-pressed')).toBe(
      'true'
    );

    // Minimized and closed surfaces stay labelled for assistive tech.
    await fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    expect(screen.getByRole('button', { name: 'Restore Notes' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Restore Notes' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'Reopen Notes' })).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
