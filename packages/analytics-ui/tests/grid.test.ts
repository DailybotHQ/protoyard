import {
  type DashboardLayout,
  DashboardLayoutSchema,
  type DashboardWidget,
} from '@protoyard/analytics';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DashboardGrid from '../src/grid/DashboardGrid.svelte';

const w = (id: string, x: number, y: number, width: number, h: number): DashboardWidget => ({
  id,
  widget: 'kpi',
  title: id[0]?.toUpperCase() + id.slice(1),
  x,
  y,
  w: width,
  h,
});

/** Every pair of widgets is disjoint. */
const noOverlaps = (layout: readonly DashboardWidget[]) =>
  layout.every((a, i) =>
    layout
      .slice(i + 1)
      .every((b) => !(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h))
  );
const pos = (layout: readonly DashboardWidget[]) =>
  Object.fromEntries(layout.map((item) => [item.id, [item.x, item.y, item.w, item.h]]));

describe('layout data', () => {
  it('validates widgets and layouts', () => {
    expect(DashboardLayoutSchema.safeParse([w('a', 0, 0, 6, 2)]).success).toBe(true);
    expect(DashboardLayoutSchema.safeParse([w('a', 8, 0, 6, 2)]).error?.issues[0]?.path).toEqual([
      0,
      'w',
    ]);
    expect(DashboardLayoutSchema.safeParse([w('a', 0, 0, 6, 2), w('a', 6, 0, 6, 2)]).success).toBe(
      false
    );
  });
});

afterEach(() => {
  cleanup();
});

const widget = createRawSnippet((item: () => DashboardWidget) => ({
  render: () => `<article data-testid="widget-${item().id}">${item().title}</article>`,
}));

const LAYOUT: DashboardLayout = [
  w('revenue', 0, 0, 8, 3),
  w('signups', 8, 0, 4, 3),
  w('funnel', 0, 3, 12, 4),
];

/** The Texuli widget cell that holds a widget's content. */
const cell = (id: string) =>
  screen.getByTestId(`widget-${id}`).closest('[data-dashboard-widget]') as HTMLElement;

describe('DashboardGrid (Texuli dashboard)', () => {
  it('moves with the keyboard pick-up contract and saves the new layout as data', async () => {
    const onchange = vi.fn(async (_layout: DashboardLayout) => {});
    render(DashboardGrid, { layout: LAYOUT, label: 'Growth', widget, editing: true, onchange });
    const handle = screen.getByRole('button', { name: 'Move Funnel' });
    handle.focus();
    await fireEvent.keyDown(handle, { key: ' ' });
    expect(handle.getAttribute('aria-pressed')).toBe('true');
    await fireEvent.keyDown(handle, { key: 'ArrowUp' });
    // Texuli announces each step and keeps focus on the handle as the widget moves.
    await waitFor(() => expect(screen.getByText('Funnel moved to column 1, row 1.')).toBeTruthy());
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Move Funnel');
    // Nothing is saved while the widget is held.
    expect(onchange).not.toHaveBeenCalled();
    await fireEvent.keyDown(document.activeElement as Element, { key: ' ' });
    await waitFor(() => expect(onchange).toHaveBeenCalledTimes(1));
    const moved = onchange.mock.calls[0]?.[0] as DashboardLayout;
    // Saved in Protoyard's format: widget keys and titles ride along, no overlaps.
    expect(DashboardLayoutSchema.safeParse(moved).success).toBe(true);
    expect(moved.map((item) => item.widget)).toEqual(['kpi', 'kpi', 'kpi']);
    // The full-width funnel moves to the top; revenue and signups sit under it.
    expect(pos(moved)).toEqual({
      revenue: [0, 4, 8, 3],
      signups: [8, 4, 4, 3],
      funnel: [0, 0, 12, 4],
    });
    expect(noOverlaps(moved)).toBe(true);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Move Funnel');
  });

  it('is busy while the save runs and restores the previous layout when it fails', async () => {
    let fail: (error: Error) => void = () => {};
    const onchange = vi.fn(() => new Promise<void>((_, reject) => (fail = reject)));
    const { container } = render(DashboardGrid, {
      layout: LAYOUT,
      label: 'Growth',
      widget,
      editing: true,
      onchange,
    });
    // Picking a handle up (a click or Enter) shows the arrange toolbar.
    await fireEvent.keyDown(screen.getByRole('button', { name: 'Resize Signups' }), {
      key: 'Enter',
    });
    const toolbar = screen.getByRole('group', { name: 'Arrange Signups' });
    await fireEvent.click(within(toolbar).getByRole('button', { name: 'Narrower' }));
    await fireEvent.click(within(toolbar).getByRole('button', { name: 'Done' }));
    const root = container.querySelector('[data-editing]') as HTMLElement;
    await waitFor(() => expect(root.getAttribute('aria-busy')).toBe('true'));
    expect(cell('signups').style.gridColumn).toBe('9 / span 3');
    fail(new Error('offline'));
    await waitFor(() => expect(root.getAttribute('aria-busy')).toBeNull());
    expect(cell('signups').style.gridColumn).toBe('9 / span 4');
    expect(screen.getByText(/could not be saved/)).toBeTruthy();
  });
});
