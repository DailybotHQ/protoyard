import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KanbanHarness from './fixtures/KanbanHarness.svelte';
import PickersHarness from './fixtures/PickersHarness.svelte';
import SheetHarness from './fixtures/SheetHarness.svelte';
import ShellHarness from './fixtures/ShellHarness.svelte';
import Showcase from './fixtures/Showcase.svelte';

afterEach(() => cleanup());

describe('app-height layout tokens (no raw dvh)', () => {
  it("AppShell is Texuli's shell, sized by the app-frame height token", () => {
    const { container } = render(ShellHarness);
    const root = container.querySelector<HTMLElement>('[data-tx-app-shell]');
    expect(root?.classList.contains('tx-app-shell')).toBe(true);
    expect(root?.className ?? '').not.toMatch(/dvh/);

    const sidebar = screen.getByRole('complementary', { name: 'Navigation' });
    expect(sidebar.dataset.txAppShellSlot).toBe('sidebar');
    expect(sidebar.className).not.toMatch(/dvh/);

    // Texuli's shell sizes from --tx-app-height; @protoyard/ui maps it to the frame height.
    const styles = readFileSync(join(process.cwd(), 'packages/ui/src/styles.css'), 'utf8');
    expect(styles).toMatch(/\.tx-app-shell[^{]*\{\s*--tx-app-height:\s*var\(--py-app-height/);
  });

  // The overlays are Texuli surfaces sized by their stylesheets against the
  // containing frame (sheet-parts.css), never by viewport-unit utilities.
  it('BottomSheet is a Texuli drawer surface from the bottom edge', async () => {
    render(SheetHarness);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.classList.contains('tx-drawer')).toBe(true);
    expect(dialog.classList.contains('ui-bottom-sheet')).toBe(true);
    expect(dialog.dataset.side).toBe('bottom');
    expect(dialog.className).not.toMatch(/dvh|--py-/);
  });

  it('Dialog is a Texuli dialog surface', async () => {
    render(Showcase, { overlay: 'dialog' });
    const dialog = await screen.findByRole('dialog', { name: 'Edit profile' });
    expect(dialog.classList.contains('tx-dialog')).toBe(true);
    expect(dialog.className).not.toMatch(/dvh|--py-/);
  });

  it('DetailPanel is a Texuli detail-panel surface on the end side', async () => {
    render(Showcase, { overlay: 'panel' });
    const dialog = await screen.findByRole('dialog');
    expect(dialog.classList.contains('tx-detail-panel')).toBe(true);
    expect(dialog.dataset.side).toBe('right');
    expect(dialog.className).not.toMatch(/dvh|--py-/);
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
  // Texuli's drawer settles a release by projected distance against the
  // sheet's measured height (jsdom has no layout, so the height is stubbed).
  it('closes when the sheet is dragged down and snaps back on a short drag', async () => {
    render(SheetHarness);
    const dialog = await screen.findByRole('dialog');
    dialog.getBoundingClientRect = () => new DOMRect(0, 400, 400, 400);
    const handle = dialog.querySelector<HTMLElement>('[data-drawer-handle]');
    if (!handle) throw new Error('no handle');
    const pointer = async (
      kind: 'pointerDown' | 'pointerMove' | 'pointerUp',
      init: { pointerId: number; clientY: number },
      timeStamp: number
    ) => {
      const event = createEvent[kind](handle, { ...init, button: 0, clientX: 10, bubbles: true });
      Object.defineProperty(event, 'timeStamp', { value: timeStamp });
      await fireEvent(handle, event);
    };

    await pointer('pointerDown', { pointerId: 1, clientY: 100 }, 0);
    await pointer('pointerMove', { pointerId: 1, clientY: 130 }, 500);
    await pointer('pointerUp', { pointerId: 1, clientY: 130 }, 1000);
    expect(screen.getByTestId('state').textContent).toBe('open');

    await pointer('pointerDown', { pointerId: 2, clientY: 100 }, 2000);
    await pointer('pointerMove', { pointerId: 2, clientY: 400 }, 2500);
    await pointer('pointerUp', { pointerId: 2, clientY: 400 }, 3000);
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('closed'));
  });

  it('still closes with Escape', async () => {
    render(SheetHarness);
    const dialog = await screen.findByRole('dialog');
    await fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('closed'));
  });
});

describe('Kanban drag and drop', () => {
  const column = (name: string) => screen.getByRole('list', { name });
  const handle = (title: string) => screen.getByRole('button', { name: `Drag ${title}` });
  const live = () => document.querySelector('[aria-live="polite"]')?.textContent ?? '';

  async function keyboardMove(title: string, keys: string[]): Promise<void> {
    handle(title).focus();
    await fireEvent.keyDown(handle(title), { key: ' ' });
    for (const key of keys) await fireEvent.keyDown(handle(title), { key });
    await fireEvent.keyDown(handle(title), { key: ' ' });
  }

  it('moves a card to another column with the keyboard drag handle', async () => {
    const onMoved = vi.fn();
    render(KanbanHarness, { onMoved });
    await keyboardMove('Write brief', ['ArrowRight', 'ArrowRight']);
    await waitFor(() => expect(onMoved).toHaveBeenCalledWith('t1', 'done'));
    await waitFor(() => expect(within(column('Done')).getByText('Write brief')).toBeTruthy());
  });

  it('never reorders inside a column and honors canMove', async () => {
    const onMoved = vi.fn();
    render(KanbanHarness, { onMoved });
    await keyboardMove('Write brief', ['ArrowDown']);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onMoved).not.toHaveBeenCalled();
    expect(live()).toContain('Write brief is already in To do.');

    // canMove(t3, 'done') is false in the harness.
    await keyboardMove('Plan sprint', ['ArrowRight', 'ArrowRight']);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onMoved).not.toHaveBeenCalledWith('t3', 'done');
    expect(within(column('Done')).queryByText('Plan sprint')).toBeNull();
  });

  // Texuli's column-only Board (no getRank, G69): a moved card settles in the
  // order of `items`, the same order a reload shows, with no local rank map.
  it('orders a moved card by the items order once the host saves its column', async () => {
    const onMoved = vi.fn();
    render(KanbanHarness, { onMoved });
    await keyboardMove('Ship kit', ['ArrowLeft']);
    await waitFor(() => expect(onMoved).toHaveBeenCalledWith('t2', 'todo'));
    await waitFor(() =>
      expect(
        within(column('To do'))
          .getAllByRole('listitem')
          .map((item) => item.textContent?.match(/Write brief|Ship kit|Plan sprint/)?.[0])
      ).toEqual(['Write brief', 'Ship kit', 'Plan sprint'])
    );
  });

  it('puts the card back and announces it when onMove throws', async () => {
    render(KanbanHarness, { fail: true });
    await keyboardMove('Write brief', ['ArrowRight']);
    await waitFor(() =>
      expect(live()).toBe('Write brief was not moved. It returned to its previous position.')
    );
    expect(within(column('To do')).getByText('Write brief')).toBeTruthy();
    expect(within(column('In progress')).queryByText('Write brief')).toBeNull();
  });
});
