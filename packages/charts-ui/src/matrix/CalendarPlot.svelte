<script lang="ts">
import { calendarLayout } from '@protoyard/charts/layout';
import { getChartFrameContext } from '../frame/context.ts';
import CellPlot from './CellPlot.svelte';
import { type Cell, rampScale } from './model.ts';

type Props = {
  label: string;
  start: string;
  end: string;
  values: Readonly<Record<string, number>>;
  weekStartsOn: number;
  width: number;
  height: number;
  format: (value: number | null) => string;
  onselect?: (day: { date: string; value: number | null }) => void;
};

let { label, start, end, values, weekStartsOn, width, height, format, onselect }: Props = $props();

const frame = getChartFrameContext();
const LEFT = 30;
const TOP = 16;
const dayName = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' });
const longDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});
const monthName = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' });

const view = $derived.by(() => {
  const probe = calendarLayout({ start, end }, { weekStartsOn, cellSize: 1, gap: 0 });
  const size = Math.max(
    4,
    Math.min(
      16,
      Math.floor(Math.min((width - LEFT) / Math.max(1, probe.weeks), (height - TOP) / 7)) - 2
    )
  );
  const cal = calendarLayout({ start, end }, { values, weekStartsOn, cellSize: size, gap: 2 });
  const ramp = rampScale(
    cal.cells.map((c) => c.value),
    frame?.palette,
    { min: 0 }
  );
  const cells: (Cell & {
    x: number;
    y: number;
    size: number;
    value: number | null;
    fill: string;
  })[] = cal.cells.map((c) => ({
    id: c.date,
    row: c.weekday,
    col: c.week,
    description: `${longDate.format(Date.parse(c.date))}: ${c.value === null ? 'no data' : format(c.value)}`,
    anchor: { x: LEFT + c.x + size / 2, y: TOP + c.y + size / 2 },
    x: LEFT + c.x,
    y: TOP + c.y,
    size,
    value: c.value,
    fill: ramp.fill(c.value),
  }));
  // Weekday labels on alternate rows, as calendars usually do.
  const days = [1, 3, 5].map((row) => {
    const sample = cal.cells.find((c) => c.weekday === row);
    return sample
      ? { row, label: dayName.format(Date.parse(sample.date)), y: TOP + sample.y + size / 2 }
      : null;
  });
  const months = cal.months.map((m) => ({
    ...m,
    label: monthName.format(Date.parse(`${m.month}-01`)),
    x: LEFT + m.week * (size + 2),
  }));
  return { cells, days, months, ramp };
});
</script>

<CellPlot
  {label}
  cells={view.cells}
  {width}
  {height}
  onselect={(c) => onselect?.({ date: c.id, value: values[c.id] ?? null })}
>
  {#snippet children({ active })}
    {#each view.months as m (m.month)}
      <text aria-hidden="true" data-month={m.month} x={m.x} y="10" class="fill-muted-foreground text-[10px]">{m.label}</text>
    {/each}
    {#each view.days as d (d?.row)}
      {#if d}<text aria-hidden="true" x={LEFT - 4} y={d.y} dy="0.32em" text-anchor="end" class="fill-muted-foreground text-[10px]">{d.label}</text>{/if}
    {/each}
    {#each view.cells as c, i (c.id)}
      <rect
        data-cell-index={i}
        data-day={c.id}
        data-empty={c.value === null ? '' : undefined}
        x={c.x}
        y={c.y}
        width={c.size}
        height={c.size}
        rx="2"
        fill={c.fill}
        stroke={active === i ? 'var(--py-ring)' : c.value === null ? 'var(--py-border)' : 'none'}
        stroke-width={active === i ? 2 : 1}
        stroke-dasharray={c.value === null && active !== i ? '2 1' : undefined}
      />
    {/each}
  {/snippet}
</CellPlot>
