import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { getInertRegistry } from '@texuli/core/inert';
import { afterEach, describe, expect, it } from 'vitest';
import { installPopoverOrder } from '../src/index.ts';
import DialogInDrawerHarness from './fixtures/DialogInDrawerHarness.svelte';

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

/**
 * Texuli 0.5.0 re-raised every inert exemption, the dialog backdrop among
 * them, whenever an overlay opened, so a Select opened inside a dialog ended
 * up under the backdrop; Protoyard re-ordered the top layer itself. Since
 * Texuli 0.6 (G75) backdrops register with `raise: false`, so only the toast
 * region is re-raised and the old fix is a no-op.
 */
describe('popover order over a dialog backdrop (Texuli G75)', () => {
  it('registers the backdrops of Protoyard overlays as exemptions Texuli never re-raises', async () => {
    render(DialogInDrawerHarness, {});
    await fireEvent.click(screen.getByRole('button', { name: 'Open drawer' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Open dialog' }));
    await screen.findByRole('dialog', { name: 'Confirm filters' });

    const exemptions = getInertRegistry().exemptions();
    const backdrops = exemptions.filter((entry) => /backdrop/.test(entry.label ?? ''));
    expect(backdrops.length).toBeGreaterThan(0);
    for (const backdrop of backdrops) expect(backdrop.raise).toBe(false);
    // The undo toaster is still raised above every overlay.
    const toaster = exemptions.find((entry) => entry.label === 'undo-toaster');
    expect(toaster?.raise).toBeUndefined();
  });

  it('keeps installPopoverOrder exported as a no-op', () => {
    const uninstall = installPopoverOrder(document);
    expect(typeof uninstall).toBe('function');
    expect(() => uninstall()).not.toThrow();
  });
});
