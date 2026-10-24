import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { lazyDialog, lazyMenu, lazyPopover } from '../src/lib/lazy-overlays.svelte.ts';
import LazyMenuHarness from './fixtures/LazyMenuHarness.svelte';

/*
 * Menus, popovers and dialogs load on first use (bundle budget). A trigger
 * is a plain button until then; the first click loads the real overlay and
 * opens it, and focus stays on the trigger across the swap.
 */
afterEach(() => cleanup());

// The first dynamic import transforms dialog, menu and popover
// modules; on a busy machine (the full suite in parallel) that takes seconds.
const SLOW_IMPORT_MS = 90_000;

describe('lazy overlays', () => {
  it(
    'load once and share the loaded component',
    async () => {
      const first = lazyDialog.load();
      expect(lazyDialog.load()).toBe(first);
      const AlertDialog = await first;
      expect(lazyDialog.current).toBe(AlertDialog);
      expect(await lazyPopover.load()).toBe(lazyPopover.current);
    },
    SLOW_IMPORT_MS
  );

  it(
    'opens the real menu on the first click and keeps focus on the trigger',
    async () => {
      render(LazyMenuHarness);
      const trigger = screen.getByRole('button', { name: 'Card options' });
      expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
      trigger.focus();
      await fireEvent.click(trigger);
      expect(
        await screen.findByRole('menuitem', { name: 'Archive' }, { timeout: SLOW_IMPORT_MS })
      ).toBeTruthy();
      expect(lazyMenu.current).not.toBeNull();
      await fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
      // Bits returns focus to the (swapped-in) trigger when the menu closes.
      await waitFor(() =>
        expect(document.activeElement?.getAttribute('aria-label')).toBe('Card options')
      );
    },
    SLOW_IMPORT_MS
  );
});
