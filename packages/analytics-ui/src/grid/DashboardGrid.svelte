<script lang="ts">
import {
  compactLayout,
  type DashboardLayout,
  type DashboardWidget,
  GRID_COLUMNS,
  MAX_WIDGET_ROWS,
} from '@protoyard/analytics';
import {
  Dashboard,
  type DashboardBreakpoint,
  type DashboardLayout as TexuliLayout,
  DashboardWidget as TexuliWidget,
} from '@texuli/data/dashboard';
import { type Snippet, setContext, untrack } from 'svelte';
import { WIDGET_CARD_EMBEDDED } from './context.ts';

type Props = {
  /** The saved layout (data); the grid always shows it compacted. */
  layout: DashboardLayout;
  /** Accessible name of the dashboard region. */
  label: string;
  /** Edit mode: move and resize handles on every widget. */
  editing?: boolean;
  /**
   * Called with the new layout after every edit. Return the service promise:
   * the grid shows the change at once, marks itself busy until it settles,
   * and restores the previous layout if it rejects.
   */
  onchange?: (layout: DashboardLayout) => unknown;
  /** Renders one widget (usually a WidgetCard). */
  widget: Snippet<[DashboardWidget]>;
  /** Height of one row unit in CSS pixels. */
  rowHeight?: number;
  /** Gap between widgets in CSS pixels (mapped to Texuli's gap steps). */
  gap?: number;
  /** Below this container width the grid becomes a single column in reading order. */
  collapseBelow?: number;
  class?: string;
};

let {
  layout,
  label,
  editing = false,
  onchange,
  widget,
  rowHeight = 80,
  gap = 16,
  collapseBelow = 640,
  class: className = '',
}: Props = $props();

/*
 * Texuli's dashboard (`@texuli/data/dashboard`) owns the grid: reading order,
 * pointer drag and resize, the keyboard pick-up contract, the arrange toolbar
 * (no drag needed), announcements, layout motion and the responsive
 * breakpoints. This adapter keeps Protoyard's saved layout (widget keys and
 * titles on 12 columns) and its persistence: an edit on the full grid goes to
 * `onchange`, the grid is busy until it settles, and a failed save restores
 * the previous layout. A layout arranged on the stacked phone grid stays for the session.
 */

// A WidgetCard inside paints no card chrome or heading of its own: the
// dashboard's widget already draws both.
setContext(WIDGET_CARD_EMBEDDED, true);

// The saved layout's 12 columns from `collapseBelow`, one stacked column below
// (Protoyard's grid had the same two steps); Texuli reflows in reading order.
const WIDEST = 'lg';
const breakpoints = $derived<DashboardBreakpoint[]>([
  { id: WIDEST, minWidth: collapseBelow, columns: GRID_COLUMNS },
  { id: 'sm', minWidth: 0, columns: 1 },
]);
const gapStep = $derived(gap <= 0 ? 'none' : gap <= 8 ? 'small' : gap <= 16 ? 'medium' : 'large');

const toTexuli = (items: DashboardLayout): TexuliLayout =>
  items.map(({ id, x, y, w, h }) => ({ id, x, y, w, h, maxH: MAX_WIDGET_ROWS }));

/** Texuli's positions back onto the saved widgets (keys, titles and config ride along). */
function fromTexuli(next: TexuliLayout, base: DashboardLayout): DashboardLayout {
  const placed = new Map(next.map((item) => [item.id, item]));
  return base.map((item) => {
    const at = placed.get(item.id);
    return at ? { ...item, x: at.x, y: at.y, w: at.w, h: at.h } : item;
  });
}

let saved = $state<DashboardLayout>([]);
let shown = $state<TexuliLayout>([]);
let narrower = $state<Record<string, TexuliLayout>>({});
let pending = $state(0);
let failure = $state('');

// The saved layout wins whenever it changes (a scenario load, another tab, a saved edit).
$effect.pre(() => {
  const next = compactLayout(layout);
  untrack(() => {
    saved = next;
    shown = toTexuli(next);
    narrower = {};
  });
});

const ordered = $derived(
  [...saved].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))
);
const name = (item: DashboardWidget) => item.title ?? item.widget;

async function persist(next: TexuliLayout, breakpoint: string): Promise<void> {
  if (breakpoint !== WIDEST || !onchange) return;
  const before = saved;
  const after = fromTexuli(next, before);
  saved = after;
  failure = '';
  pending += 1;
  try {
    await onchange(after);
  } catch {
    saved = before;
    shown = toTexuli(before);
    // Texuli keeps the committed layout per breakpoint; drop it so the restored one shows.
    const { [WIDEST]: _dropped, ...rest } = narrower;
    narrower = rest;
    failure = 'The layout could not be saved; the previous layout is back';
  } finally {
    pending -= 1;
  }
}
</script>

<div
  class="min-w-0 {className}"
  data-editing={editing ? '' : undefined}
  aria-busy={pending > 0 ? 'true' : undefined}
>
  <Dashboard
    {label}
    editable={editing}
    columns={GRID_COLUMNS}
    {breakpoints}
    {rowHeight}
    gap={gapStep}
    bind:layout={shown}
    bind:layouts={narrower}
    onLayoutChange={(next, { breakpoint }) => void persist(next, breakpoint)}
  >
    {#each ordered as item (item.id)}
      <TexuliWidget id={item.id} title={name(item)} x={item.x} y={item.y} w={item.w} h={item.h} maxH={MAX_WIDGET_ROWS}>
        {@render widget(item)}
      </TexuliWidget>
    {/each}
  </Dashboard>
  <p class="sr-only" role="status" aria-live="polite">{failure}</p>
</div>
