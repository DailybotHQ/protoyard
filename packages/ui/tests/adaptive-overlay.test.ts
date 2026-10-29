import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ADAPTIVE_OVERLAY_BREAKPOINT,
  resolveAdaptiveOverlayPresentation,
} from '../src/components/adaptive-overlay/resolve.ts';
import { UNDO_TOASTER_ATTR } from '../src/components/overlay/focus-exempt.ts';
import { overlayStack } from '../src/components/overlay/overlay-stack.ts';
import { undoToast } from '../src/components/toast/undo.svelte.ts';
import AdaptiveOverlayHarness from './fixtures/AdaptiveOverlayHarness.svelte';
import DialogInDrawerHarness from './fixtures/DialogInDrawerHarness.svelte';

const settle = () => new Promise((r) => setTimeout(r, 30));

afterEach(() => {
  cleanup();
  overlayStack.reset();
  undoToast.dismiss();
  document.body.replaceChildren();
});

describe('resolveAdaptiveOverlayPresentation', () => {
  it('picks sheet below the breakpoint and the wide kind at or above it', () => {
    expect(resolveAdaptiveOverlayPresentation({ width: 390, kind: 'dialog' })).toBe('sheet');
    expect(resolveAdaptiveOverlayPresentation({ width: 767, kind: 'side-panel' })).toBe('sheet');
    expect(
      resolveAdaptiveOverlayPresentation({ width: ADAPTIVE_OVERLAY_BREAKPOINT, kind: 'dialog' })
    ).toBe('dialog');
    expect(resolveAdaptiveOverlayPresentation({ width: 1200, kind: 'side-panel' })).toBe(
      'side-panel'
    );
  });

  it('honours force over host width', () => {
    expect(resolveAdaptiveOverlayPresentation({ width: 390, force: 'dialog' })).toBe('dialog');
    expect(resolveAdaptiveOverlayPresentation({ width: 1400, force: 'sheet' })).toBe('sheet');
    expect(resolveAdaptiveOverlayPresentation({ width: 390, force: 'side-panel' })).toBe(
      'side-panel'
    );
  });
});

describe('AdaptiveOverlay', () => {
  beforeEach(() => {
    overlayStack.reset();
  });

  it('renders a bottom sheet on a narrow host and keeps Escape/close', async () => {
    const host = document.body.appendChild(document.createElement('div'));
    Object.defineProperty(host, 'getBoundingClientRect', {
      value: () => ({ width: 390, height: 800, top: 0, left: 0, right: 390, bottom: 800 }),
    });
    Object.defineProperty(host, 'clientWidth', { value: 390 });

    render(AdaptiveOverlayHarness, { open: true, host, kind: 'dialog' });
    await settle();
    const sheet = await screen.findByRole('dialog', { name: 'Filters' });
    expect(document.querySelector('[data-adaptive-overlay-presentation="sheet"]')).toBeTruthy();
    expect(sheet.classList.contains('tx-drawer')).toBe(true);
    expect(sheet.dataset.side).toBe('bottom');
    await fireEvent.keyDown(sheet, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull());
  });

  it('renders a centered dialog on a wide host', async () => {
    const host = document.body.appendChild(document.createElement('div'));
    Object.defineProperty(host, 'getBoundingClientRect', {
      value: () => ({ width: 1100, height: 800, top: 0, left: 0, right: 1100, bottom: 800 }),
    });
    Object.defineProperty(host, 'clientWidth', { value: 1100 });

    render(AdaptiveOverlayHarness, { open: true, host, kind: 'dialog' });
    await settle();
    const dialog = await screen.findByRole('dialog', { name: 'Filters' });
    expect(document.querySelector('[data-adaptive-overlay-presentation="dialog"]')).toBeTruthy();
    expect(dialog.classList.contains('tx-dialog')).toBe(true);
    expect(within(dialog).getByText('Overlay body')).toBeTruthy();
  });

  it('renders a side panel when kind is side-panel on a wide host', async () => {
    const host = document.body.appendChild(document.createElement('div'));
    Object.defineProperty(host, 'getBoundingClientRect', {
      value: () => ({ width: 1100, height: 800, top: 0, left: 0, right: 1100, bottom: 800 }),
    });
    Object.defineProperty(host, 'clientWidth', { value: 1100 });

    render(AdaptiveOverlayHarness, { open: true, host, kind: 'side-panel' });
    await settle();
    const panel = await screen.findByRole('dialog', { name: 'Filters' });
    expect(
      document.querySelector('[data-adaptive-overlay-presentation="side-panel"]')
    ).toBeTruthy();
    expect(panel.classList.contains('tx-detail-panel')).toBe(true);
  });

  it('force=dialog uses a dialog even on a narrow host', async () => {
    const host = document.body.appendChild(document.createElement('div'));
    Object.defineProperty(host, 'getBoundingClientRect', {
      value: () => ({ width: 320, height: 600, top: 0, left: 0, right: 320, bottom: 600 }),
    });
    Object.defineProperty(host, 'clientWidth', { value: 320 });

    render(AdaptiveOverlayHarness, { open: true, host, force: 'dialog' });
    await settle();
    await screen.findByRole('dialog', { name: 'Filters' });
    expect(document.querySelector('[data-adaptive-overlay-presentation="dialog"]')).toBeTruthy();
  });
});

describe('Dialog on the shared overlay stack', () => {
  it('paints a dialog opened inside a modal drawer above the drawer', async () => {
    overlayStack.reset();
    render(DialogInDrawerHarness, {});
    await fireEvent.click(screen.getByRole('button', { name: 'Open drawer' }));
    const drawer = await screen.findByRole('dialog', { name: 'Filters' });
    await fireEvent.click(within(drawer).getByRole('button', { name: 'Open dialog' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm filters' });

    const drawerZ = Number.parseInt(drawer.style.zIndex || '0', 10);
    const dialogZ = Number.parseInt(dialog.style.zIndex || '0', 10);
    expect(dialogZ).toBeGreaterThan(drawerZ);
    expect(overlayStack.size).toBe(2);

    await fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Confirm filters' })).toBeNull()
    );
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeTruthy();
    expect(overlayStack.size).toBe(1);
  });

  it('keeps UndoToaster keyboard-reachable while a modal drawer traps focus', async () => {
    overlayStack.reset();
    // Integration: toaster is marked, paints above the stack, and clicks do not close the drawer.
    render(DialogInDrawerHarness, {});
    await fireEvent.click(screen.getByRole('button', { name: 'Open drawer' }));
    const drawer = await screen.findByRole('dialog', { name: 'Filters' });
    undoToast.show({ message: 'Deleted item', onUndo: () => {} });
    const region = await screen.findByRole('region', { name: 'Undo notifications' });
    expect(region.hasAttribute(UNDO_TOASTER_ATTR)).toBe(true);
    expect(Number.parseInt(region.style.zIndex || '0', 10)).toBeGreaterThan(
      Number.parseInt(drawer.style.zIndex || '0', 10)
    );
    const undo = within(region).getByRole('button', { name: /Undo/ });
    expect(undo.tabIndex).toBeGreaterThanOrEqual(0);
    // The toaster is an inert exemption: the drawer's focus scope lets focus stay in it.
    undo.focus();
    await waitFor(() => expect(document.activeElement).toBe(undo));
    expect(region.closest('[inert]')).toBeNull();
    await fireEvent.click(undo);
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeTruthy();
  });
});
