import { z } from 'zod';

/*
 * Dashboard layouts as data: widgets on a 12-column grid in row units. The
 * layout is stored like any row (a prototype saves it through a service) and
 * every edit returns a new, compacted layout: no overlaps, and every widget
 * floats up as far as its columns allow. Pure and deterministic.
 */

export const GRID_COLUMNS = 12;
export const MAX_WIDGET_ROWS = 24;

export const DashboardWidgetSchema = z
  .strictObject({
    id: z.string().min(1).max(64),
    /** Which widget renders here (a key the prototype maps to a component). */
    widget: z.string().min(1).max(64),
    /** Optional label for menus and keyboard announcements. */
    title: z.string().max(80).optional(),
    x: z
      .number()
      .int()
      .min(0)
      .max(GRID_COLUMNS - 1),
    y: z.number().int().min(0).max(1000),
    w: z.number().int().min(1).max(GRID_COLUMNS),
    h: z.number().int().min(1).max(MAX_WIDGET_ROWS),
  })
  .refine((item) => item.x + item.w <= GRID_COLUMNS, {
    message: `A widget must fit inside ${GRID_COLUMNS} columns`,
    path: ['w'],
  });
export type DashboardWidget = z.infer<typeof DashboardWidgetSchema>;

export const DashboardLayoutSchema = z
  .array(DashboardWidgetSchema)
  .max(60)
  .refine((items) => new Set(items.map((i) => i.id)).size === items.length, {
    message: 'Widget ids must be unique',
  });
export type DashboardLayout = DashboardWidget[];

export type MoveDirection = 'up' | 'down' | 'left' | 'right';

const overlaps = (a: DashboardWidget, b: DashboardWidget) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const fit = (item: DashboardWidget): DashboardWidget => {
  const w = Math.min(GRID_COLUMNS, Math.max(1, Math.round(item.w)));
  const x = Math.min(GRID_COLUMNS - w, Math.max(0, Math.round(item.x)));
  const h = Math.min(MAX_WIDGET_ROWS, Math.max(1, Math.round(item.h)));
  return { ...item, x, w, h, y: Math.max(0, Math.round(item.y)) };
};

/**
 * Places widgets in `order` (default: by row, then column), each at the
 * highest row its columns leave free. The result has no overlaps and keeps
 * the input's array order.
 */
export function compactLayout(
  layout: readonly DashboardWidget[],
  order?: (a: DashboardWidget, b: DashboardWidget) => number
): DashboardLayout {
  const items = layout.map(fit);
  const sequence = [...items].sort(
    order ?? ((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))
  );
  const placed: DashboardWidget[] = [];
  const result = new Map<string, DashboardWidget>();
  for (const item of sequence) {
    const candidate = { ...item, y: 0 };
    // Jumping to the bottom of the first blocker is safe: every row in between overlaps it too.
    for (
      let blocker = placed.find((p) => overlaps(p, candidate));
      blocker;
      blocker = placed.find((p) => overlaps(p, candidate))
    ) {
      candidate.y = blocker.y + blocker.h;
    }
    placed.push(candidate);
    result.set(candidate.id, candidate);
  }
  return items.map((item) => result.get(item.id) as DashboardWidget);
}

/** Compacts with `id` placed before anything starting on its row or below (it wins collisions). */
function compactWithPriority(
  layout: readonly DashboardWidget[],
  id: string,
  rank: (w: DashboardWidget) => number
) {
  return compactLayout(
    layout,
    (a, b) => rank(a) - rank(b) || (a.id === id ? -1 : b.id === id ? 1 : 0) || a.x - b.x
  );
}

const sharesColumns = (a: DashboardWidget, b: DashboardWidget) =>
  a.x < b.x + b.w && b.x < a.x + a.w;

/**
 * Moves a widget one step. Left and right shift one column (widgets it lands
 * on move down). Up and down swap places with the nearest widget above or
 * below that shares a column, so every press visibly changes the layout.
 * Returns the same compacted layout when the move is impossible.
 */
export function moveWidget(
  layout: readonly DashboardWidget[],
  id: string,
  direction: MoveDirection
): DashboardLayout {
  const current = compactLayout(layout);
  const target = current.find((w) => w.id === id);
  if (!target) return current;
  if (direction === 'left' || direction === 'right') {
    const x = target.x + (direction === 'left' ? -1 : 1);
    if (x < 0 || x + target.w > GRID_COLUMNS) return current;
    const next = current.map((w) => (w.id === id ? { ...w, x } : w));
    return compactWithPriority(next, id, (w) => w.y);
  }
  const others = current.filter((w) => w.id !== id && sharesColumns(w, target));
  if (direction === 'up') {
    const above = others
      .filter((w) => w.y + w.h <= target.y)
      .sort((a, b) => b.y + b.h - (a.y + a.h) || b.y - a.y)[0];
    if (!above) return current;
    // Rank the moved widget just before the one above it.
    return compactWithPriority(current, id, (w) => (w.id === id ? above.y - 0.5 : w.y));
  }
  const below = others.filter((w) => w.y >= target.y + target.h).sort((a, b) => a.y - b.y)[0];
  if (!below) return current;
  // Swap ranks: the widget below is placed first, from the moved widget's old row, and the
  // moved one right after it. Plain gravity would float the moved widget back into its old
  // place whenever the widget below cannot rise (e.g. a full-width widget under two halves).
  return compactWithPriority(current, id, (w) =>
    w.id === id ? below.y + 0.5 : w.id === below.id ? target.y - 0.5 : w.y
  );
}

/** Changes a widget's size by whole cells, clamped to the grid; neighbours make room. */
export function resizeWidget(
  layout: readonly DashboardWidget[],
  id: string,
  change: { dw?: number; dh?: number }
): DashboardLayout {
  const current = compactLayout(layout);
  const target = current.find((w) => w.id === id);
  if (!target) return current;
  const w = Math.min(GRID_COLUMNS - target.x, Math.max(1, target.w + (change.dw ?? 0)));
  const h = Math.min(MAX_WIDGET_ROWS, Math.max(1, target.h + (change.dh ?? 0)));
  if (w === target.w && h === target.h) return current;
  const next = current.map((item) => (item.id === id ? { ...item, w, h } : item));
  return compactWithPriority(next, id, (item) => item.y);
}

/** Widgets in reading order (row, then column): the order a one-column layout shows them in. */
export function readingOrder(layout: readonly DashboardWidget[]): DashboardWidget[] {
  return [...layout].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
}

/** Rows the layout occupies. */
export function layoutRows(layout: readonly DashboardWidget[]): number {
  return layout.reduce((rows, w) => Math.max(rows, w.y + w.h), 0);
}
