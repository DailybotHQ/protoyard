import { cleanup, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setOverlayPortalTarget, Toaster, toast } from '../src/index.ts';

/**
 * The `@protoyard/ui` Toaster is Texuli's top-layer toast stack without a
 * frame, and Texuli's `contained` stack (G77) inside the framed screen while a
 * shell sets an overlay portal target, so toasts stay inside the simulated
 * screen.
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
    toast.success('Saved');
    flushSync();
    expect(viewport()?.getAttribute('popover')).toBe('manual');
    expect(viewport()?.getAttribute('data-mode')).not.toBe('contained');
    expect(screenEl.contains(viewport())).toBe(false);
  });

  it('leaves the top layer while a frame sets the portal target, and returns without one', () => {
    setOverlayPortalTarget(screenEl);
    render(Toaster);
    toast.success('Saved');
    flushSync();
    const region = viewport();
    expect(region?.hasAttribute('popover')).toBe(false);
    expect(region?.getAttribute('data-mode')).toBe('contained');
    expect(screenEl.contains(region)).toBe(true);

    setOverlayPortalTarget(null);
    flushSync();
    expect(viewport()?.getAttribute('popover')).toBe('manual');
    expect(screenEl.contains(viewport())).toBe(false);

    setOverlayPortalTarget(screenEl);
    flushSync();
    expect(viewport()?.hasAttribute('popover')).toBe(false);
    expect(screenEl.contains(viewport())).toBe(true);
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
