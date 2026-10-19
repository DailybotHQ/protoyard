import {
  compactLayout,
  type DashboardLayout,
  DashboardLayoutSchema,
  type DashboardWidget,
  layoutRows,
  moveWidget,
  readingOrder,
  resizeWidget,
} from '@protoyard/analytics';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardGrid from '../src/grid/DashboardGrid.svelte';
import WidgetCard from '../src/grid/WidgetCard.svelte';

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

  it('compacts upward and resolves collisions without overlaps', () => {
    const layout = compactLayout([w('a', 0, 3, 6, 2), w('b', 6, 7, 6, 3), w('c', 0, 2, 12, 2)]);
    // c starts highest, so it takes row 0 across the grid; a and b float up under it.
    expect(pos(layout)).toEqual({ a: [0, 2, 6, 2], b: [6, 2, 6, 3], c: [0, 0, 12, 2] });
    expect(noOverlaps(layout)).toBe(true);
    expect(layoutRows(layout)).toBe(5);
    // Out-of-range widgets are clamped into the grid.
    expect(pos(compactLayout([{ ...w('z', 11, 0, 4, 1) }]))).toEqual({ z: [8, 0, 4, 1] });
  });

  it('moves left and right by one column and pushes widgets it lands on', () => {
    const layout = compactLayout([w('a', 0, 0, 4, 2), w('b', 4, 0, 4, 2)]);
    const right = moveWidget(layout, 'a', 'right');
    expect(pos(right)).toEqual({ a: [1, 0, 4, 2], b: [4, 2, 4, 2] });
    expect(noOverlaps(right)).toBe(true);
    expect(moveWidget(layout, 'a', 'left')).toEqual(layout);
    expect(moveWidget(compactLayout([w('a', 8, 0, 4, 1)]), 'a', 'right')).toEqual(
      compactLayout([w('a', 8, 0, 4, 1)])
    );
  });

  it('moves up and down by swapping with the nearest widget in its columns', () => {
    const layout = compactLayout([
      w('top', 0, 0, 12, 2),
      w('mid', 0, 2, 6, 3),
      w('side', 6, 2, 6, 1),
    ]);
    const down = moveWidget(layout, 'top', 'down');
    expect(pos(down)).toEqual({ top: [0, 3, 12, 2], mid: [0, 0, 6, 3], side: [6, 0, 6, 1] });
    expect(noOverlaps(down)).toBe(true);
    const up = moveWidget(down, 'top', 'up');
    expect(readingOrder(up)[0]?.id).toBe('top');
    expect(noOverlaps(up)).toBe(true);
    expect(moveWidget(layout, 'top', 'up')).toEqual(layout);
    expect(moveWidget(layout, 'missing', 'up')).toEqual(layout);
  });

  it('resizes within the grid and makes room', () => {
    const layout = compactLayout([w('a', 0, 0, 6, 2), w('b', 6, 0, 6, 2)]);
    const wider = resizeWidget(layout, 'a', { dw: 1 });
    expect(pos(wider)).toEqual({ a: [0, 0, 7, 2], b: [6, 2, 6, 2] });
    expect(noOverlaps(wider)).toBe(true);
    expect(pos(resizeWidget(layout, 'a', { dh: 3 })).a).toEqual([0, 0, 6, 5]);
    expect(resizeWidget(layout, 'a', { dw: -10 }).find((x) => x.id === 'a')?.w).toBe(1);
    expect(resizeWidget(layout, 'b', { dw: 1 })).toEqual(layout);
  });
});

/** ResizeObserver stand-in reporting a fixed container width. */
class FixedWidthObserver {
  static width = 1200;
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: { width: FixedWidthObserver.width, height: 600 },
        } as unknown as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver
    );
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  FixedWidthObserver.width = 1200;
  vi.stubGlobal('ResizeObserver', FixedWidthObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const widget = createRawSnippet((item: () => DashboardWidget) => ({
  render: () => `<article data-testid="widget-${item().id}">${item().title}</article>`,
}));

const LAYOUT: DashboardLayout = [
  w('revenue', 0, 0, 8, 3),
  w('signups', 8, 0, 4, 3),
  w('funnel', 0, 3, 12, 4),
];

const cell = (id: string) => screen.getByTestId(`widget-${id}`).parentElement as HTMLElement;

describe('DashboardGrid', () => {
  it('places widgets on 12 columns in reading order', () => {
    render(DashboardGrid, { layout: LAYOUT, label: 'Growth', widget });
    const region = screen.getByRole('region', { name: 'Growth' });
    expect(region.dataset.columns).toBe('12');
    expect(cell('revenue').style.gridColumn).toBe('1 / span 8');
    expect(cell('signups').style.gridColumn).toBe('9 / span 4');
    expect(cell('funnel').style.gridRow).toBe('4 / span 4');
    expect(
      [...region.querySelectorAll('[data-widget-id]')].map((el) =>
        el.getAttribute('data-widget-id')
      )
    ).toEqual(['revenue', 'signups', 'funnel']);
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('collapses to one column in reading order on a narrow container', () => {
    FixedWidthObserver.width = 390;
    render(DashboardGrid, { layout: [...LAYOUT].reverse(), label: 'Growth', widget });
    const region = screen.getByRole('region', { name: 'Growth' });
    expect(region.dataset.columns).toBe('1');
    expect(cell('signups').style.gridColumn).toBe('1 / -1');
    expect(cell('signups').style.gridRow).toBe('span 3');
    expect(
      [...region.querySelectorAll('[data-widget-id]')].map((el) =>
        el.getAttribute('data-widget-id')
      )
    ).toEqual(['revenue', 'signups', 'funnel']);
  });

  it('moves and resizes with the keyboard and reports the new layout as data', async () => {
    const onchange = vi.fn(async (_layout: DashboardLayout) => {});
    render(DashboardGrid, { layout: LAYOUT, label: 'Growth', widget, editing: true, onchange });
    const handle = screen.getByRole('button', { name: /^Revenue, column 1, row 1/ });
    handle.focus();
    await fireEvent.keyDown(handle, { key: 'ArrowDown' });
    await waitFor(() => expect(onchange).toHaveBeenCalledTimes(1));
    const moved = onchange.mock.calls[0]?.[0] as DashboardLayout;
    // The full-width funnel moves to the top; revenue and signups sit under it.
    expect(pos(moved)).toEqual({
      revenue: [0, 4, 8, 3],
      signups: [8, 4, 4, 3],
      funnel: [0, 0, 12, 4],
    });
    expect(noOverlaps(moved)).toBe(true);
    expect(
      screen.getByText('Revenue moved: column 1, row 5, 8 columns wide, 3 rows tall')
    ).toBeTruthy();
    // Focus follows the widget after the list reorders.
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-widget-handle')).toBe('revenue')
    );

    await fireEvent.keyDown(document.activeElement as Element, {
      key: 'ArrowLeft',
      shiftKey: true,
    });
    await waitFor(() => expect(onchange).toHaveBeenCalledTimes(2));
    expect(pos(onchange.mock.calls[1]?.[0] as DashboardLayout).revenue?.[2]).toBe(7);
  });

  it('announces when a move is not possible and does not save', async () => {
    const onchange = vi.fn();
    render(DashboardGrid, { layout: LAYOUT, label: 'Growth', widget, editing: true, onchange });
    await fireEvent.keyDown(screen.getByRole('button', { name: /^Revenue, column 1/ }), {
      key: 'ArrowLeft',
    });
    expect(screen.getByText('Revenue cannot move further')).toBeTruthy();
    expect(onchange).not.toHaveBeenCalled();
  });

  it('shows pending feedback on toolbar buttons and reverts when saving fails', async () => {
    let fail: (error: Error) => void = () => {};
    const onchange = vi.fn(() => new Promise<void>((_, reject) => (fail = reject)));
    render(DashboardGrid, { layout: LAYOUT, label: 'Growth', widget, editing: true, onchange });
    const toolbar = screen.getByRole('toolbar', { name: 'Arrange Signups' });
    await fireEvent.click(within(toolbar).getByRole('button', { name: 'Move left: Signups' }));
    const region = screen.getByRole('region', { name: 'Growth' });
    expect(region.getAttribute('aria-busy')).toBe('true');
    expect(cell('signups').style.gridColumn).toBe('8 / span 4');
    expect(
      within(toolbar).getByRole('button', { name: 'Move left: Signups' }).getAttribute('aria-busy')
    ).toBe('true');
    fail(new Error('offline'));
    await waitFor(() => expect(region.getAttribute('aria-busy')).toBeNull());
    expect(cell('signups').style.gridColumn).toBe('9 / span 4');
    expect(screen.getByText(/could not be saved/)).toBeTruthy();
  });

  it('follows the saved layout when it changes', async () => {
    const view = render(DashboardGrid, { layout: LAYOUT, label: 'Growth', widget });
    await view.rerender({ layout: [w('revenue', 4, 0, 8, 3)], label: 'Growth', widget });
    expect(cell('revenue').style.gridColumn).toBe('5 / span 8');
    expect(screen.queryByTestId('widget-signups')).toBeNull();
  });
});

describe('WidgetCard', () => {
  const content = createRawSnippet((state: () => { expanded: boolean }) => ({
    render: () => `<p data-testid="body">${state().expanded ? 'expanded' : 'inline'}</p>`,
  }));

  it('renders a labelled section with its content', () => {
    render(WidgetCard, { title: 'Revenue', description: 'Last 30 days', children: content });
    const section = screen.getByRole('region', { name: 'Revenue' });
    expect(within(section).getByText('Last 30 days')).toBeTruthy();
    expect(within(section).getByTestId('body').textContent).toBe('inline');
  });

  it('shows loading, empty and error states with a pending retry', async () => {
    const view = render(WidgetCard, { title: 'Revenue', loading: true, children: content });
    expect(screen.getByRole('status', { name: 'Loading Revenue' })).toBeTruthy();
    await view.rerender({
      title: 'Revenue',
      loading: false,
      empty: 'No orders yet',
      children: content,
    });
    expect(screen.getByText('No orders yet')).toBeTruthy();
    let finish: () => void = () => {};
    const onretry = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    await view.rerender({
      title: 'Revenue',
      empty: false,
      error: 'Could not load',
      onretry,
      children: content,
    });
    expect(screen.getByRole('alert').textContent).toContain('Could not load');
    const retry = screen.getByRole('button', { name: 'Retry' });
    await fireEvent.click(retry);
    expect(retry.getAttribute('aria-busy')).toBe('true');
    finish();
    await waitFor(() => expect(retry.getAttribute('aria-busy')).toBeNull());
    expect(onretry).toHaveBeenCalledTimes(1);
  });

  it('opens a full-screen view of the same content', async () => {
    render(WidgetCard, { title: 'Revenue', children: content });
    await fireEvent.click(screen.getByRole('button', { name: 'Expand Revenue' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revenue' });
    expect(within(dialog).getByTestId('body').textContent).toBe('expanded');
  });

  it('offers a widget menu', async () => {
    const onSelect = vi.fn();
    render(WidgetCard, {
      title: 'Revenue',
      menu: [{ label: 'Remove widget', onSelect }],
      children: content,
    });
    expect(screen.getByRole('button', { name: 'Revenue options' })).toBeTruthy();
  });
});
