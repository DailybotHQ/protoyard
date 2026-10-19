<script lang="ts" generics="D">
import type { Rect } from '@protoyard/charts';
import { seriesColor } from '@protoyard/charts/palette';
import type { Snippet } from 'svelte';
import {
  type ActivePoint,
  type ChartFormatters,
  type ChartSelection,
  edgeIndex,
  firstActive,
  nearestIndex,
  type PlotPoint,
  type PlotSeries,
  stepIndex,
  stepSeries,
} from './model.ts';
import Tooltip from './Tooltip.svelte';

type Props = {
  /** Accessible name of the plot (usually the chart title). */
  label: string;
  series: readonly PlotSeries<D>[];
  hidden?: ReadonlySet<string>;
  width: number;
  height: number;
  plot: Rect;
  formatters: ChartFormatters;
  /** Enter, Space or a click on the active point; use it for drill-down. */
  onselect?: (selection: ChartSelection<D>) => void;
  /** Vertical guide at the active x, or none. */
  crosshair?: 'x' | 'none';
  /**
   * `x` (default): points run left to right and the pointer picks the nearest x.
   * `y`: points run top to bottom (horizontal bars) and the pointer picks the nearest y.
   */
  orientation?: 'x' | 'y';
  /** Custom pointer lookup (e.g. a scatter grid index); return null for "nothing here". */
  hitTest?: (x: number, y: number) => ActivePoint | null;
  tooltip?: boolean;
  /** The chart's marks (bars, lines…) in the same pixel space. */
  children?: Snippet;
};

let {
  label,
  series,
  hidden = new Set<string>(),
  width,
  height,
  plot,
  formatters,
  onselect,
  crosshair = 'x',
  orientation = 'x',
  hitTest,
  tooltip = true,
  children,
}: Props = $props();

const uid = $props.id();
let active = $state<ActivePoint | null>(null);
let hover = $state<ActivePoint | null>(null);
let focused = $state(false);
let dismissed = $state(false);
let announcement = $state('');

// For horizontal layouts, look points up along y by swapping the axes once per data change.
const lookup = $derived(
  orientation === 'y'
    ? series.map((s) =>
        s.points.map((p) => ({ ...p, x: p.y ?? Number.NaN, y: Number.isFinite(p.x) ? p.x : null }))
      )
    : series.map((s) => s.points)
);
const along = (p: PlotPoint<D>) => (orientation === 'y' ? (p.y ?? Number.NaN) : p.x);

const colorOf = (k: number) => series[k]?.color ?? seriesColor(k);
const pointAt = (a: ActivePoint | null): PlotPoint<D> | undefined =>
  a ? series[a.series]?.points[a.index] : undefined;

// Keep the active point valid when series, data or visibility change.
$effect.pre(() => {
  const current = active;
  if (!current) return;
  const s = series[current.series];
  const p = s?.points[current.index];
  if (!s || hidden.has(s.id) || !p || p.y === null) active = firstActive(series, hidden);
});

const shown = $derived(hover ?? (focused ? active : null));
const shownPoint = $derived(pointAt(shown));

function describe(a: ActivePoint): string {
  const s = series[a.series] as PlotSeries<D>;
  const p = s.points[a.index] as PlotPoint<D>;
  const defined = s.points.filter((q) => q.y !== null);
  const position = defined.indexOf(p) + 1;
  return `${s.label}, ${formatters.x(p.xValue)}: ${formatters.y(p.yValue, s.id)}. Point ${position} of ${defined.length}.`;
}

/** Every visible series' value at the shown x, for the tooltip. */
const rows = $derived.by(() => {
  if (!shown || !shownPoint) return [];
  return series.flatMap((s, k) => {
    if (hidden.has(s.id)) return [];
    const i = k === shown.series ? shown.index : nearestIndex(lookup[k] ?? [], along(shownPoint));
    const p = s.points[i];
    if (!p || p.xValue !== shownPoint.xValue) return [];
    return [
      {
        id: s.id,
        label: s.label,
        color: colorOf(k),
        value: formatters.y(p.yValue, s.id),
        current: k === shown.series,
      },
    ];
  });
});

function setActive(next: ActivePoint) {
  active = next;
  dismissed = false;
  announcement = describe(next);
}

function onkeydown(event: KeyboardEvent) {
  const current = active ?? firstActive(series, hidden);
  if (!current) return;
  const points = (series[current.series] as PlotSeries<D>).points;
  let next: ActivePoint | null = null;
  switch (event.key) {
    case 'ArrowRight':
      next = { ...current, index: active ? stepIndex(points, current.index, 1) : current.index };
      break;
    case 'ArrowLeft':
      next = { ...current, index: active ? stepIndex(points, current.index, -1) : current.index };
      break;
    case 'Home':
      next = { ...current, index: edgeIndex(points, 1) };
      break;
    case 'End':
      next = { ...current, index: edgeIndex(points, -1) };
      break;
    case 'PageDown':
    case 'ArrowDown':
      next = stepSeries(series, hidden, current, 1);
      break;
    case 'PageUp':
    case 'ArrowUp':
      next = stepSeries(series, hidden, current, -1);
      break;
    case 'Enter':
    case ' ':
      event.preventDefault();
      if (active) select(active);
      return;
    case 'Escape':
      if (!dismissed) {
        event.preventDefault();
        dismissed = true;
        hover = null;
      }
      return;
    default:
      return;
  }
  event.preventDefault();
  if (next && next.index >= 0) setActive(next);
}

function select(a: ActivePoint) {
  const s = series[a.series];
  const p = s?.points[a.index];
  if (s && p) onselect?.({ series: s, index: a.index, datum: p.datum });
}

function onpointermove(event: PointerEvent) {
  const svg = event.currentTarget as SVGSVGElement;
  const rect = svg.getBoundingClientRect();
  const px = event.clientX - rect.left;
  const py = event.clientY - rect.top;
  if (hitTest) {
    hover = hitTest(px, py);
    dismissed = false;
    return;
  }
  const [x, y] = orientation === 'y' ? [py, px] : [px, py];
  // Nearest position along the axis first, then the series whose point is closest across it.
  let best: ActivePoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  series.forEach((s, k) => {
    if (hidden.has(s.id)) return;
    const points = lookup[k] ?? [];
    const i = nearestIndex(points, x);
    const p = points[i];
    if (!p || p.y === null) return;
    const distance = Math.abs(p.x - x) * 1000 + Math.abs(p.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { series: k, index: i };
    }
  });
  hover = best;
  dismissed = false;
}

function onfocus() {
  focused = true;
  if (!active) {
    const first = firstActive(series, hidden);
    if (first) setActive(first);
  } else announcement = describe(active);
}
</script>

<div class="relative" style:width="{width}px" style:height="{height}px">
  <!--
    One focusable plot with aria-activedescendant (the WAI-ARIA composite pattern): a single tab
    stop for any number of points, no role="application". Svelte's static check cannot see that
    a group with an active descendant is interactive.
  -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <svg
    {width}
    {height}
    viewBox="0 0 {width} {height}"
    role="group"
    aria-roledescription="chart"
    aria-label="{label}. Use arrow keys to move between points, Page Up and Page Down to switch series, Enter to select."
    aria-activedescendant={focused && active ? `${uid}-point` : undefined}
    tabindex="0"
    class="block overflow-visible rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    {onkeydown}
    {onfocus}
    onblur={() => (focused = false)}
    {onpointermove}
    onpointerleave={() => (hover = null)}
    onclick={() => {
      if (hover) {
        setActive(hover);
        select(hover);
      }
    }}
  >
    {@render children?.()}

    {#if shown && shownPoint && shownPoint.y !== null}
      {#if crosshair === 'x'}
        <line
          aria-hidden="true"
          data-crosshair=""
          x1={orientation === 'y' ? plot.x : shownPoint.x}
          x2={orientation === 'y' ? plot.x + plot.width : shownPoint.x}
          y1={orientation === 'y' ? shownPoint.y : plot.y}
          y2={orientation === 'y' ? shownPoint.y : plot.y + plot.height}
          stroke="var(--py-chart-axis, var(--py-muted-foreground))"
          stroke-dasharray="3 3"
          stroke-opacity="0.7"
        />
      {/if}
      <circle
        aria-hidden="true"
        cx={shownPoint.x}
        cy={shownPoint.y}
        r="4.5"
        fill={colorOf(shown.series)}
        stroke="var(--py-surface)"
        stroke-width="2"
      />
    {/if}
    {#if focused && active}
      {@const p = pointAt(active)}
      {#if p && p.y !== null}
        <g id="{uid}-point" role="img" aria-label={describe(active)} data-active-point="">
          <circle cx={p.x} cy={p.y} r="7" fill="none" stroke="var(--py-ring)" stroke-width="2" />
        </g>
      {/if}
    {/if}
  </svg>

  {#if tooltip && shown && shownPoint && shownPoint.y !== null && !dismissed && rows.length > 0}
    <Tooltip anchor={{ x: shownPoint.x, y: shownPoint.y }} bounds={{ width, height }}>
      <p class="mb-1 font-medium">{formatters.x(shownPoint.xValue)}</p>
      <ul class="m-0 grid list-none gap-0.5 p-0">
        {#each rows as row (row.id)}
          <li class="flex items-center justify-between gap-3 {row.current ? 'font-semibold' : ''}">
            <span class="inline-flex items-center gap-1.5">
              <span class="size-2 rounded-full" style:background={row.color}></span>{row.label}
            </span>
            <span class="tabular-nums">{row.value}</span>
          </li>
        {/each}
      </ul>
    </Tooltip>
  {/if}
  <p class="sr-only" aria-live="polite" data-chart-live="">{announcement}</p>
</div>
