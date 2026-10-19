<script lang="ts">
import { matrixLayout } from '@protoyard/charts/layout';
import { getChartFrameContext } from '../frame/context.ts';
import CellPlot from './CellPlot.svelte';
import { type Cell, rampScale } from './model.ts';

type Props = {
  label: string;
  rows: readonly string[];
  cols: readonly string[];
  values: readonly (readonly (number | null)[])[];
  width: number;
  height: number;
  format: (value: number | null) => string;
  diverging: boolean;
  mid: number;
  showValues: boolean;
  onselect?: (cell: { row: number; col: number; value: number | null }) => void;
};

let {
  label,
  rows,
  cols,
  values,
  width,
  height,
  format,
  diverging,
  mid,
  showValues,
  onselect,
}: Props = $props();

const frame = getChartFrameContext();
const LEFT = 72;
const TOP = 20;

const view = $derived.by(() => {
  const ramp = rampScale(values.flat(), frame?.palette, { diverging, mid });
  const grid = matrixLayout(rows, cols, {
    width: Math.max(0, width - LEFT),
    height: Math.max(0, height - TOP),
    gap: 2,
  });
  const fits = grid.cellWidth >= 30 && grid.cellHeight >= 16;
  const cells: (Cell & {
    x: number;
    y: number;
    w: number;
    h: number;
    value: number | null;
    fill: string;
    text: string | null;
  })[] = grid.cells.map((c) => {
    const value = values[c.rowIndex]?.[c.colIndex] ?? null;
    const x = LEFT + c.x;
    const y = TOP + c.y;
    return {
      id: `${c.rowIndex}:${c.colIndex}`,
      row: c.rowIndex,
      col: c.colIndex,
      description: `${c.row}, ${c.col}: ${format(value)}`,
      anchor: { x: x + c.width / 2, y: y + c.height / 2 },
      x,
      y,
      w: c.width,
      h: c.height,
      value,
      fill: ramp.fill(value),
      text: showValues && fits ? ramp.text(value) : null,
    };
  });
  return { cells, grid };
});
</script>

<CellPlot
  {label}
  cells={view.cells}
  {width}
  {height}
  onselect={(c) => onselect?.({ row: c.row, col: c.col, value: values[c.row]?.[c.col] ?? null })}
>
  {#snippet children({ active })}
    {#each cols as col, j (j)}
      <text aria-hidden="true" x={LEFT + j * (view.grid.cellWidth + 2) + view.grid.cellWidth / 2} y="12" text-anchor="middle" class="fill-muted-foreground text-[10px]">{col}</text>
    {/each}
    {#each rows as row, i (i)}
      <text aria-hidden="true" x={LEFT - 6} y={TOP + i * (view.grid.cellHeight + 2) + view.grid.cellHeight / 2} dy="0.32em" text-anchor="end" class="fill-muted-foreground text-[10px]">{row}</text>
    {/each}
    {#each view.cells as c, i (c.id)}
      <g data-cell-index={i} data-heat-cell={c.id}>
        <rect
          x={c.x}
          y={c.y}
          width={c.w}
          height={c.h}
          rx="2"
          fill={c.fill}
          stroke={c.value === null ? 'var(--py-border)' : active === i ? 'var(--py-ring)' : 'none'}
          stroke-dasharray={c.value === null ? '2 2' : undefined}
          stroke-width={active === i ? 2 : 1}
        />
        {#if c.text}
          <text aria-hidden="true" data-cell-text="" x={c.x + c.w / 2} y={c.y + c.h / 2} dy="0.32em" text-anchor="middle" fill={c.text} class="text-[10px] tabular-nums">{format(c.value)}</text>
        {/if}
      </g>
    {/each}
  {/snippet}
</CellPlot>
