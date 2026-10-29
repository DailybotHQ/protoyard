import { cleanup, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setOverlayPortalTarget, Toaster, toast } from '../src/index.ts';

/**
 * Texuli 0.5.0's toast viewport is always a top-layer popover (gap N32). The
 * `@protoyard/ui` Toaster keeps it in the page's top layer without a frame,
 * and takes it out while a shell sets an overlay portal target (a framed
 * screen), so its fixed box stays inside the simulated screen.
 */
let screenEl: HTMLElement;

beforeEach(() => {
  screenEl = document.createElement('div');
  document.body.append(screenEl);
});

afterEach(() => {
  setOverlayPortalTarget(null);
  cleanup();
  toast.dismiss();
  screenEl.remove();
});

const viewport = () => document.querySelector<HTMLElement>('[data-tx-toast-viewport]');

describe('Toaster inside a framed screen', () => {
  it('stays Texuli’s top-layer popover without a frame', () => {
    render(Toaster);
    flushSync();
    expect(viewport()?.getAttribute('popover')).toBe('manual');
    expect(viewport()?.hasAttribute('data-py-toaster-contained')).toBe(false);
    expect(viewport()?.style.zIndex).toBe('');
  });

  it('leaves the top layer while a frame sets the portal target, and returns without one', () => {
    setOverlayPortalTarget(screenEl);
    render(Toaster);
    flushSync();
    const region = viewport();
    expect(region?.hasAttribute('popover')).toBe(false);
    expect(region?.hasAttribute('data-py-toaster-contained')).toBe(true);
    expect(Number(region?.style.zIndex)).toBeGreaterThanOrEqual(60);

    setOverlayPortalTarget(null);
    flushSync();
    expect(viewport()?.getAttribute('popover')).toBe('manual');
    expect(viewport()?.hasAttribute('data-py-toaster-contained')).toBe(false);

    setOverlayPortalTarget(screenEl);
    flushSync();
    expect(viewport()?.hasAttribute('popover')).toBe(false);
  });

  it('keeps the named region and its toasts while contained, so toasts are announced', () => {
    setOverlayPortalTarget(screenEl);
    render(Toaster, { label: 'Prototype notifications' });
    toast.success('Saved', { description: 'All changes stored.' });
    flushSync();
    const region = screen.getByRole('region', { name: 'Prototype notifications' });
    expect(region).toBe(viewport());
    expect(region.textContent).toContain('Saved');
    expect(region.textContent).toContain('All changes stored.');
  });
});
