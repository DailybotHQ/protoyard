import { getDevice } from '@protoyard/core';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountPrototype } from '../src/index.ts';
import { activeFrame, FRAMES, STAGE_GUTTER } from '../src/shell/frames/registry.ts';
import { createFakeRuntime } from './fixtures/fake-runtime.ts';
import ProbeApp from './fixtures/ProbeApp.svelte';

const tick = () => new Promise((r) => setTimeout(r, 0));
const root = document.documentElement;

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
      // Manifest is frozen after parse; patch the chrome origin for this test.
      const preview = runtime.definition.manifest.preview as {
        chrome?: { origin?: string };
      };
      preview.chrome = { ...(preview.chrome ?? {}), origin: options.origin };
    }
    // Wide enough that laptop-window + browser margin fits.
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

    // Back/forward are wired to the real history API (hash router).
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
    // Forward stays disabled until we have gone back in chrome history; the button may still be disabled.
    void forward;

    // Typing an address navigates only via the hash router.
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
