import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DRAWER_SIZE,
  DRAWER_PLACEMENTS,
  drawerPlacementClasses,
  resolveDrawerSize,
} from '../src/components/overlay/drawer.ts';
import { OVERLAY_Z_BASE, OverlayStack } from '../src/components/overlay/overlay-stack.ts';
import {
  DEFAULT_UNDO_DURATION,
  MAX_UNDO_DURATION,
  MAX_UNDO_TOASTS,
  MIN_UNDO_DURATION,
  undoToast,
} from '../src/components/toast/undo.svelte.ts';
import { setOverlayPortalTarget } from '../src/lib/overlay-portal.ts';
import OverlayHarness from './fixtures/OverlayHarness.svelte';
import UndoHarness from './fixtures/UndoHarness.svelte';

// happy-dom lays nothing out, so Bits only counts a press outside the (empty) drawer rect.
const outsidePoint = { clientX: 500, clientY: 500, button: 0, pointerType: 'mouse' };
const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function button(label: string): HTMLButtonElement {
  return document.createElement('button').appendChild(document.createTextNode(label))
    .parentElement as HTMLButtonElement;
}

describe('OverlayStack', () => {
  let stack: OverlayStack;
  beforeEach(() => {
    stack = new OverlayStack();
  });
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('hands out increasing z-indexes in open order and tracks the top', () => {
    const first = stack.push();
    const second = stack.push({ modal: true });
    expect(first.zIndex).toBe(OVERLAY_Z_BASE + 1);
    expect(second.zIndex).toBeGreaterThan(first.zIndex);
    expect(stack.top()).toBe(second);
    expect(stack.isTop(second)).toBe(true);
    expect(stack.isTop(first)).toBe(false);
    expect(stack.size).toBe(2);
    expect(stack.hasModal()).toBe(true);
    expect(stack.topZIndex()).toBe(second.zIndex);
  });

  it('removes from the middle, keeps later entries on top, and resets z when empty', () => {
    const a = stack.push();
    const b = stack.push();
    const c = stack.push();
    expect(stack.remove(b)).toBe(true);
    expect(stack.remove(b)).toBe(false);
    expect(stack.entries()).toEqual([a, c]);
    expect(stack.top()).toBe(c);
    // A new entry still paints above everything that is open.
    expect(stack.push().zIndex).toBeGreaterThan(c.zIndex);
    stack.reset();
    expect(stack.size).toBe(0);
    expect(stack.topZIndex()).toBe(OVERLAY_Z_BASE);
    expect(stack.push().zIndex).toBe(OVERLAY_Z_BASE + 1);
  });

  it('notifies subscribers with the open count until they unsubscribe', () => {
    const listener = vi.fn();
    const stop = stack.subscribe(listener);
    const entry = stack.push();
    stack.remove(entry);
    stop();
    stack.push();
    expect(listener.mock.calls).toEqual([[1], [0]]);
  });

  it('captures the focused element as the opener and restores focus to it', () => {
    const opener = button('Open');
    const inside = button('Inside');
    const panel = document.createElement('div');
    panel.append(inside);
    document.body.append(opener, panel);
    opener.focus();
    const entry = stack.push();
    expect(entry.opener).toBe(opener);
    inside.focus();
    stack.remove(entry);
    expect(stack.restoreFocus(entry, { container: panel })).toBe(true);
    expect(document.activeElement).toBe(opener);
  });

  it('never steals focus the person moved to the page, nor targets a removed opener', () => {
    const opener = button('Open');
    const elsewhere = button('Elsewhere');
    document.body.append(opener, elsewhere);
    opener.focus();
    const entry = stack.push();
    elsewhere.focus();
    expect(stack.restoreFocus(entry, { container: null })).toBe(false);
    expect(document.activeElement).toBe(elsewhere);

    const gone = stack.push({ opener });
    opener.remove();
    elsewhere.blur();
    expect(stack.restoreFocus(gone)).toBe(false);
    // <body> is never captured as an opener.
    expect(stack.push().opener).toBeNull();
  });

  it('lets the innermost dismissible layer own Escape', () => {
    const overlay = document.createElement('div');
    const menu = document.createElement('div');
    const submenu = document.createElement('div');
    const item = button('Item');
    submenu.append(item);
    menu.append(submenu);
    overlay.append(menu);
    document.body.append(overlay);
    const closeMenu = vi.fn();
    const closeSubmenu = vi.fn();
    const stopMenu = stack.registerDismissibleLayer(menu, closeMenu);
    stack.registerDismissibleLayer(submenu, closeSubmenu);

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    Object.defineProperty(event, 'target', { value: item });
    expect(stack.dismissLayerFor(event, overlay)).toBe(true);
    expect(closeSubmenu).toHaveBeenCalledTimes(1);
    expect(closeMenu).not.toHaveBeenCalled();

    stopMenu();
    stack.reset();
    expect(stack.dismissLayerFor(event, overlay)).toBe(false);
  });
});

describe('drawer placement helpers', () => {
  it('maps each of the four edges to its own anchor and border', () => {
    const anchors = { right: 'right-0', left: 'left-0', top: 'top-0', bottom: 'bottom-0' };
    const borders = { right: 'border-l', left: 'border-r', top: 'border-b', bottom: 'border-t' };
    for (const placement of DRAWER_PLACEMENTS) {
      const classes = drawerPlacementClasses(placement).split(' ');
      expect(classes).toContain(anchors[placement]);
      expect(classes).toContain(borders[placement]);
    }
    expect(drawerPlacementClasses('left')).toContain('w-[var(--ui-drawer-size)]');
    expect(drawerPlacementClasses('bottom')).toContain('h-[var(--ui-drawer-size)]');
  });

  it('accepts plain lengths and pixels, and rejects anything that could inject CSS', () => {
    expect(resolveDrawerSize('right', '30rem')).toBe('30rem');
    expect(resolveDrawerSize('bottom', '40%')).toBe('40%');
    expect(resolveDrawerSize('left', 320.4)).toBe('320px');
    expect(resolveDrawerSize('right', '10px;background:red')).toBe(DEFAULT_DRAWER_SIZE.right);
    expect(resolveDrawerSize('top', 'var(--x)')).toBe(DEFAULT_DRAWER_SIZE.top);
    expect(resolveDrawerSize('right', -5)).toBe(DEFAULT_DRAWER_SIZE.right);
    expect(resolveDrawerSize('right')).toBe('24rem');
  });
});

describe('Drawer', () => {
  let stack: OverlayStack;
  beforeEach(() => {
    stack = new OverlayStack();
  });
  afterEach(() => {
    cleanup();
    setOverlayPortalTarget(null);
  });

  async function openOuter(): Promise<HTMLElement> {
    const trigger = screen.getByRole('button', { name: 'Open filters' });
    trigger.focus();
    await fireEvent.click(trigger);
    return screen.findByRole('dialog', { name: 'Filters' });
  }

  it.each(DRAWER_PLACEMENTS)(
    'renders from the %s edge with a sanitized size',
    async (placement) => {
      render(OverlayHarness, { stack, placement, size: '18rem' });
      const drawer = await openOuter();
      expect(drawer.dataset.placement).toBe(placement);
      expect(drawer.style.getPropertyValue('--ui-drawer-size').trim()).toBe('18rem');
      expect(drawer.className).toContain(drawerPlacementClasses(placement).split(' ')[0]);
      expect(drawer.getAttribute('aria-modal')).toBe('false');
    }
  );

  it('is non-modal by default: the page stays usable and outside clicks keep it open', async () => {
    render(OverlayHarness, { stack });
    const drawer = await openOuter();
    expect(within(drawer).getByText('Narrow the list')).toBeTruthy();
    await settle(50);
    const page = screen.getByRole('button', { name: 'Page action' });
    await fireEvent.pointerDown(page, outsidePoint);
    await settle(30);
    await fireEvent.pointerUp(page, outsidePoint);
    await fireEvent.click(page, outsidePoint);
    await settle(30);
    expect(screen.getByTestId('page-clicks').textContent).toBe('1');
    expect(screen.getByTestId('outer').textContent).toBe('open');
    expect(stack.hasModal()).toBe(false);
  });

  it('registers modal drawers as modal and dims the page', async () => {
    render(OverlayHarness, { stack, modal: true });
    const drawer = await openOuter();
    expect(drawer.getAttribute('aria-modal')).toBe('true');
    expect(stack.hasModal()).toBe(true);
  });

  it('stacks a nested drawer above its parent and Escape closes only the top one', async () => {
    render(OverlayHarness, { stack });
    const outer = await openOuter();
    await fireEvent.click(within(outer).getByRole('button', { name: 'Open details' }));
    const inner = await screen.findByRole('dialog', { name: 'Details' });
    expect(stack.size).toBe(2);
    const zOf = (el: HTMLElement) => Number(el.style.zIndex);
    expect(zOf(inner)).toBeGreaterThan(zOf(outer));

    await fireEvent.keyDown(inner, { key: 'Escape' });
    await waitFor(() => expect(screen.getByTestId('inner').textContent).toBe('closed'));
    expect(screen.getByTestId('outer').textContent).toBe('open');
    expect(stack.size).toBe(1);

    await fireEvent.keyDown(screen.getByRole('dialog', { name: 'Filters' }), { key: 'Escape' });
    await waitFor(() => expect(screen.getByTestId('outer').textContent).toBe('closed'));
    expect(stack.size).toBe(0);
  });

  it('returns focus to the opener of each drawer as they close', async () => {
    render(OverlayHarness, { stack });
    const outer = await openOuter();
    const openDetails = within(outer).getByRole('button', { name: 'Open details' });
    openDetails.focus();
    await fireEvent.click(openDetails);
    const inner = await screen.findByRole('dialog', { name: 'Details' });

    await fireEvent.click(within(inner).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(document.activeElement).toBe(openDetails));

    await fireEvent.click(within(outer).getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open filters' }))
    );
  });

  it('reports open changes from the close control and honors closeOnOutsideClick', async () => {
    const onOpenChange = vi.fn();
    render(OverlayHarness, { stack, closeOnOutsideClick: true, onOpenChange });
    await openOuter();
    // Bits debounces outside interactions and ignores the opening gesture.
    await settle(50);
    const page = screen.getByRole('button', { name: 'Page action' });
    await fireEvent.pointerDown(page, outsidePoint);
    await settle(30);
    await fireEvent.pointerUp(page, outsidePoint);
    await fireEvent.click(page, outsidePoint);
    await waitFor(() => expect(screen.getByTestId('outer').textContent).toBe('closed'));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('portals into the device frame when a shell sets the overlay target', async () => {
    const frame = document.createElement('div');
    frame.dataset.testid = 'device-screen';
    document.body.append(frame);
    setOverlayPortalTarget(frame);
    render(OverlayHarness, { stack });
    const drawer = await openOuter();
    expect(frame.contains(drawer)).toBe(true);
    frame.remove();
  });
});

describe('undo toast store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    undoToast.dismiss();
  });
  afterEach(() => {
    cleanup();
    undoToast.dismiss();
    vi.useRealTimers();
  });

  it('settles as expired after the window and never calls undo', () => {
    const onUndo = vi.fn();
    const onSettle = vi.fn();
    undoToast.show({ message: 'Deleted 3 tasks', onUndo, onSettle, duration: 5000 });
    expect(undoToast.items[0]).toMatchObject({ message: 'Deleted 3 tasks', undoLabel: 'Undo' });
    vi.advanceTimersByTime(4999);
    expect(onSettle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onSettle).toHaveBeenCalledExactlyOnceWith('expired');
    expect(onUndo).not.toHaveBeenCalled();
    expect(undoToast.items).toHaveLength(0);
  });

  it('runs the explicit undo callback once and closes without settling', async () => {
    const onUndo = vi.fn();
    const onSettle = vi.fn();
    const id = undoToast.show({ message: 'Archived', onUndo, onSettle });
    await expect(undoToast.undo(id)).resolves.toBe(true);
    await expect(undoToast.undo(id)).resolves.toBe(false);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onSettle).not.toHaveBeenCalled();
    expect(undoToast.items).toHaveLength(0);
    expect(undoToast.announcement?.text).toBe('Archived: undone.');
  });

  it('freezes the window while an async undo runs and keeps the toast on failure', async () => {
    let fail: (error: Error) => void = () => {};
    const onUndo = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          fail = reject;
        })
    );
    const onSettle = vi.fn();
    const id = undoToast.show({ message: 'Moved', onUndo, onSettle, duration: 2000 });
    vi.advanceTimersByTime(500);
    const running = undoToast.undo(id);
    expect(undoToast.items[0]?.status).toBe('undoing');
    vi.advanceTimersByTime(10_000);
    expect(onSettle).not.toHaveBeenCalled();
    // Dismissing while undoing is ignored, so the callback never races a settle.
    undoToast.dismiss(id);
    expect(undoToast.items).toHaveLength(1);

    fail(new Error('Storage is full'));
    await expect(running).resolves.toBe(false);
    expect(undoToast.items[0]).toMatchObject({ status: 'failed', error: 'Storage is full' });
    expect(undoToast.announcement).toMatchObject({ text: 'Storage is full', assertive: true });
    expect(undoToast.remaining(id)).toBe(1500);
    vi.advanceTimersByTime(1500);
    expect(onSettle).toHaveBeenCalledExactlyOnceWith('expired');
  });

  it('pauses and resumes the countdown with the remaining time', () => {
    const onSettle = vi.fn();
    undoToast.show({ message: 'Renamed', onUndo: () => {}, onSettle, duration: 1000 });
    vi.advanceTimersByTime(600);
    undoToast.pause();
    vi.advanceTimersByTime(30_000);
    expect(onSettle).not.toHaveBeenCalled();
    undoToast.resume();
    vi.advanceTimersByTime(399);
    expect(onSettle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onSettle).toHaveBeenCalledWith('expired');
  });

  it('settles replaced and evicted toasts with their reason, and dismissals as dismissed', () => {
    const replaced = vi.fn();
    undoToast.show({ id: 'move', message: 'Moved 1', onUndo: () => {}, onSettle: replaced });
    undoToast.show({ id: 'move', message: 'Moved 2', onUndo: () => {} });
    expect(replaced).toHaveBeenCalledExactlyOnceWith('replaced');
    expect(undoToast.items).toHaveLength(1);

    const evicted = vi.fn();
    undoToast.dismiss();
    undoToast.show({ message: 'First', onUndo: () => {}, onSettle: evicted });
    for (let i = 0; i < MAX_UNDO_TOASTS; i++)
      undoToast.show({ message: `n${i}`, onUndo: () => {} });
    expect(evicted).toHaveBeenCalledExactlyOnceWith('evicted');
    expect(undoToast.items).toHaveLength(MAX_UNDO_TOASTS);

    const dismissed = vi.fn();
    const id = undoToast.show({ message: 'Last', onUndo: () => {}, onSettle: dismissed });
    undoToast.dismiss(id);
    expect(dismissed).toHaveBeenCalledExactlyOnceWith('dismissed');
  });

  it('clamps the window to a sane range', () => {
    undoToast.show({ message: 'a', onUndo: () => {}, duration: 10 });
    undoToast.show({ message: 'b', onUndo: () => {}, duration: 10 * 60_000 });
    undoToast.show({ message: 'c', onUndo: () => {}, duration: Number.NaN });
    expect(undoToast.items.map((item) => item.duration)).toEqual([
      MIN_UNDO_DURATION,
      MAX_UNDO_DURATION,
      DEFAULT_UNDO_DURATION,
    ]);
  });
});

describe('UndoToaster', () => {
  afterEach(() => {
    cleanup();
    undoToast.dismiss();
  });

  it('shows the message and undoes through the button with pending feedback', async () => {
    let finish: () => void = () => {};
    const onUndo = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    render(UndoHarness, {});
    undoToast.show({ message: 'Deleted 2 notes', onUndo });
    const region = await screen.findByRole('region', { name: 'Undo notifications' });
    const undo = within(region).getByRole('button', { name: /Undo/ });
    expect(undo.getAttribute('aria-describedby')).toBeTruthy();
    await fireEvent.click(undo);
    expect(onUndo).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(undo.getAttribute('aria-busy')).toBe('true'));
    finish();
    await waitFor(() => expect(within(region).queryByText('Deleted 2 notes')).toBeNull());
  });

  it('dismisses with the close control or Escape, settling as dismissed', async () => {
    const onSettle = vi.fn();
    render(UndoHarness, {});
    undoToast.show({ message: 'Archived', onUndo: () => {}, onSettle });
    undoToast.show({ message: 'Moved', onUndo: () => {}, onSettle });
    const close = await screen.findByRole('button', { name: 'Dismiss: Archived' });
    await fireEvent.click(close);
    const moved = screen.getByText('Moved');
    await fireEvent.keyDown(moved, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('Moved')).toBeNull());
    expect(onSettle.mock.calls).toEqual([['dismissed'], ['dismissed']]);
  });

  it('shows a failed undo as text and offers a retry', async () => {
    render(UndoHarness, {});
    let attempts = 0;
    undoToast.show({
      message: 'Deleted',
      onUndo: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('Could not restore');
      },
    });
    await fireEvent.click(await screen.findByRole('button', { name: /Undo/ }));
    const region = screen.getByRole('region', { name: 'Undo notifications' });
    expect(await within(region).findByText('Could not restore')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: /Retry undo/ }));
    await waitFor(() => expect(screen.queryByText('Deleted')).toBeNull());
    expect(attempts).toBe(2);
  });

  it('paints above every open overlay', async () => {
    const { overlayStack } = await import('../src/components/overlay/overlay-stack.ts');
    overlayStack.reset();
    render(UndoHarness, {});
    undoToast.show({ message: 'Saved', onUndo: () => {} });
    const region = await screen.findByRole('region', { name: 'Undo notifications' });
    expect(region.style.zIndex).toBe('60');
    for (let i = 0; i < 12; i++) overlayStack.push({ opener: null });
    await waitFor(() => expect(region.style.zIndex).toBe(String(overlayStack.topZIndex() + 1)));
    overlayStack.reset();
  });
});
