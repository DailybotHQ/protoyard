<script lang="ts">
import { getChartFrameContext } from '../frame/context.ts';
import CellPlot from '../matrix/CellPlot.svelte';
import { type Cell, rampScale } from '../matrix/model.ts';
import type { Tile } from './layouts.ts';

type Props = {
  label: string;
  layout: readonly Tile[];
  tileValue: (id: string) => number | null;
  width: number;
  height: number;
  format: (value: number | null) => string;
  onselect?: (tile: Tile, value: number | null) => void;
};

let { label, layout, tileValue, width, height, format, onselect }: Props = $props();

const frame = getChartFrameContext();

const view = $derived.by(() => {
  const cols = Math.max(1, ...layout.map((t) => t.col + 1));
  const rows = Math.max(1, ...layout.map((t) => t.row + 1));
  const gap = 4;
  const size = Math.max(
    8,
    Math.floor(Math.min((width - gap * (cols - 1)) / cols, (height - gap * (rows - 1)) / rows))
  );
  // Centre the grid in the box.
  const left = (width - (cols * size + (cols - 1) * gap)) / 2;
  const top = (height - (rows * size + (rows - 1) * gap)) / 2;
  const ramp = rampScale(
    layout.map((t) => tileValue(t.id)),
    frame?.palette
  );
  const cells: (Cell & {
    tile: Tile;
    x: number;
    y: number;
    size: number;
    value: number | null;
    fill: string;
    text: string | null;
  })[] = [...layout]
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((tile) => {
      const value = tileValue(tile.id);
      const x = left + tile.col * (size + gap);
      const y = top + tile.row * (size + gap);
      return {
        id: tile.id,
        row: tile.row,
        col: tile.col,
        description: `${tile.label}: ${value === null ? 'no data' : format(value)}`,
        anchor: { x: x + size / 2, y: y + size / 2 },
        tile,
        x,
        y,
        size,
        value,
        fill: ramp.fill(value),
        text:
          size >= 28
            ? (ramp.text(value) ?? (value === null ? 'var(--py-muted-foreground)' : null))
            : null,
      };
    });
  return { cells };
});
</script>

<CellPlot {label} cells={view.cells} {width} {height} onselect={(c) => {
  const cell = view.cells.find((x) => x.id === c.id);
  if (cell) onselect?.(cell.tile, cell.value);
}}>
  {#snippet children({ active })}
    {#each view.cells as c, i (c.id)}
      <g data-cell-index={i} data-tile={c.id}>
        <rect
          x={c.x}
          y={c.y}
          width={c.size}
          height={c.size}
          rx="4"
          fill={c.value === null ? 'var(--py-muted)' : c.fill}
          stroke={active === i ? 'var(--py-ring)' : c.value === null ? 'var(--py-border)' : 'none'}
          stroke-width={active === i ? 2 : 1}
          stroke-dasharray={c.value === null && active !== i ? '3 2' : undefined}
        />
        {#if c.text}
          <text aria-hidden="true" data-tile-label="" x={c.x + c.size / 2} y={c.y + c.size / 2} dy="0.32em" text-anchor="middle" fill={c.text} class="text-[10px] font-medium">{c.tile.abbr}</text>
        {/if}
      </g>
    {/each}
  {/snippet}
</CellPlot>
