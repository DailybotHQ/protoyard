import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldDismissSwipe } from '../src/components/bottom-sheet/swipe.ts';
import KanbanHarness from './fixtures/KanbanHarness.svelte';
import PickersHarness from './fixtures/PickersHarness.svelte';
import SheetHarness from './fixtures/SheetHarness.svelte';
import ShellHarness from './fixtures/ShellHarness.svelte';
import Showcase from './fixtures/Showcase.svelte';

afterEach(() => cleanup());

describe('app-height layout tokens (no raw dvh)', () => {
  it('AppShell sizes the frame and desktop sidebar with min-h-app / h-app', () => {
    const { container } = render(ShellHarness);
    const root = container.querySelector('.min-h-app');
    expect(root).toBeTruthy();
    expect(root?.className).toContain('min-h-app');
    expect(root?.className).not.toMatch(/dvh/);

    const sidebar = screen.getByRole('complementary', { name: 'Navigation' });
    expect(sidebar.className).toContain('h-app');
    expect(sidebar.className).not.toMatch(/dvh/);

    // Sidebar fills the app-height column via h-full (no raw dvh of its own).
    const sidebarRoot = sidebar.firstElementChild as HTMLElement | null;
    expect(sidebarRoot?.className).toContain('h-full');
    expect(sidebarRoot?.className ?? '').not.toMatch(/dvh/);
  });

  it('BottomSheet max-height uses --py-app-height', async () => {
    render(SheetHarness);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.className).toContain('max-h-[calc(var(--py-app-height)*0.9)]');
    expect(dialog.className).not.toMatch(/dvh/);
  });

  it('Dialog max-height uses --py-app-height', async () => {
    render(Showcase, { overlay: 'dialog' });
    const dialog = await screen.findByRole('dialog', { name: 'Edit profile' });
    expect(dialog.className).toContain('max-h-[calc(var(--py-app-height)-2rem)]');
    expect(dialog.className).not.toMatch(/dvh/);
  });

  it('DetailPanel phone height uses --py-app-height', async () => {
    render(Showcase, { overlay: 'panel' });
    const dialog = await screen.findByRole('dialog');
    expect(dialog.className).toContain('h-[calc(var(--py-app-height)-1.5rem)]');
    expect(dialog.className).not.toMatch(/dvh/);
  });
});

describe('Select', () => {
  it('keeps the label as the accessible name and exposes the value as description', () => {
    render(PickersHarness);
    // A labelled button: the <label> wins over its text content for the name.
    const trigger = screen.getByRole('combobox', { name: 'Stage' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    const describedBy = trigger.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)?.textContent?.trim()).toBe('Won');
  });
});

describe('Combobox', () => {
  it('mirrors value changes made outside the component into its input', async () => {
    render(PickersHarness);
    const input = screen.getByRole('combobox', { name: 'Owner' }) as HTMLInputElement;
    expect(input.value).toBe('Lead');
    await fireEvent.click(screen.getByRole('button', { name: 'Set owner externally' }));
    await waitFor(() => expect(input.value).toBe('Won'));
    await fireEvent.click(screen.getByRole('button', { name: 'Clear owner' }));
    await waitFor(() => expect(input.value).toBe(''));
  });
});

describe('BottomSheet swipe-to-dismiss', () => {
  it('decides by distance or flick velocity', () => {
    expect(shouldDismissSwipe({ distance: 40, height: 400, durationMs: 400 })).toBe(false);
    expect(shouldDismissSwipe({ distance: 120, height: 400, durationMs: 400 })).toBe(true);
    expect(shouldDismissSwipe({ distance: 50, height: 400, durationMs: 50 })).toBe(true);
    expect(shouldDismissSwipe({ distance: -200, height: 400, durationMs: 50 })).toBe(false);
  });

  it('closes when the handle is dragged down and snaps back on a short drag', async () => {
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    render(SheetHarness);
    const handle = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-sheet-drag-handle]');
      if (!el) throw new Error('no handle');
      return el;
    });
    await fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientY: 100 });
    now = 500;
    await fireEvent.pointerMove(handle, { pointerId: 1, clientY: 130 });
    await fireEvent.pointerUp(handle, { pointerId: 1, clientY: 130 });
    expect(screen.getByTestId('state').textContent).toBe('open');

    await fireEvent.pointerDown(handle, { pointerId: 2, button: 0, clientY: 100 });
    now = 1000;
    await fireEvent.pointerMove(handle, { pointerId: 2, clientY: 400 });
    await fireEvent.pointerUp(handle, { pointerId: 2, clientY: 400 });
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('closed'));
    clock.mockRestore();
  });

  it('still closes with Escape', async () => {
    render(SheetHarness);
    const dialog = await screen.findByRole('dialog');
    await fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('closed'));
  });
});

describe('Kanban drag and drop', () => {
  it('moves a card when it is dropped on another column', async () => {
    const onMoved = vi.fn();
    render(KanbanHarness, { onMoved });
    const card = within(screen.getByRole('region', { name: 'To do' }))
      .getByText('Write brief')
      .closest('[draggable="true"]') as HTMLElement;
    const doneColumn = screen.getByRole('region', { name: 'Done' });
    const store = new Map<string, string>();
    const dataTransfer = {
      setData: (type: string, value: string) => store.set(type, value),
      getData: (type: string) => store.get(type) ?? '',
      effectAllowed: 'all',
      dropEffect: 'none',
    };
    await fireEvent.dragStart(card, { dataTransfer });
    await fireEvent.dragOver(doneColumn, { dataTransfer });
    await fireEvent.drop(doneColumn, { dataTransfer });
    await waitFor(() => expect(onMoved).toHaveBeenCalledWith('t1', 'done'));
    expect(
      within(screen.getByRole('region', { name: 'Done' })).getByText('Write brief')
    ).toBeTruthy();
  });
});
