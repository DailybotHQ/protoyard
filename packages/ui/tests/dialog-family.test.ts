import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { getInertRegistry } from '@texuli/core/inert';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { overlayStack } from '../src/components/overlay/overlay-stack.ts';
import { undoToast } from '../src/components/toast/undo.svelte.ts';
import { setOverlayPortalTarget } from '../src/lib/overlay-portal.ts';
import AlertDialogHarness from './fixtures/AlertDialogHarness.svelte';
import DialogFamilyHarness from './fixtures/DialogFamilyHarness.svelte';

/*
 * Dialog, AlertDialog, the drawers and sheets run on @texuli/primitives. These
 * cover the seams Protoyard owns: the undo toaster stays usable under a modal
 * (an inert exemption, never "outside", F6 reaches Undo), overlays are
 * contained by a framed device screen, and Escape on an alert cancels.
 */

afterEach(() => {
  cleanup();
  setOverlayPortalTarget(null);
  for (const item of [...undoToast.items]) undoToast.dismiss(item.id);
  overlayStack.reset();
});

async function openDialog(): Promise<HTMLElement> {
  await fireEvent.click(screen.getByRole('button', { name: 'Edit deal' }));
  return screen.findByRole('dialog', { name: 'Edit deal' });
}

describe('dialog family on Texuli', () => {
  it('keeps the undo toaster usable under a modal dialog, and F6 reaches Undo', async () => {
    render(DialogFamilyHarness);
    const dialog = await openDialog();
    const onUndo = vi.fn();
    undoToast.show({ message: 'Deal archived', onUndo });
    const region = await screen.findByRole('region', { name: 'Undo notifications' });
    expect(getInertRegistry().isExempt(region)).toBe(true);
    expect(region.closest('[inert]')).toBeNull();

    await fireEvent.keyDown(within(dialog).getByRole('button', { name: 'Amount' }), {
      key: 'F6',
    });
    const undo = within(region).getByRole('button', { name: /Undo/ });
    expect(document.activeElement).toBe(undo);

    await fireEvent.pointerDown(undo);
    await fireEvent.click(undo);
    await waitFor(() => expect(onUndo).toHaveBeenCalledOnce());
    expect(screen.getByTestId('dialog-state').textContent).toBe('open');
  });

  it('opens contained by the device screen a shell sets, and closes with Escape', async () => {
    const screenFrame = document.body.appendChild(document.createElement('div'));
    setOverlayPortalTarget(screenFrame);
    render(DialogFamilyHarness);
    const dialog = await openDialog();
    expect(screenFrame.contains(dialog)).toBe(true);
    await fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.getByTestId('dialog-state').textContent).toBe('closed'));
    screenFrame.remove();
  });

  it('cancels an alert with Escape', async () => {
    const onCancel = vi.fn();
    render(AlertDialogHarness, { onCancel });
    await fireEvent.click(screen.getByRole('button', { name: 'Delete project' }));
    const alert = await screen.findByRole('alertdialog');
    await fireEvent.keyDown(alert, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
