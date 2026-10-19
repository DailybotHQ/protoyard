<script lang="ts">
import type { Snippet } from 'svelte';
import Tooltip from '../interaction/Tooltip.svelte';
import type { Cell } from './model.ts';

type Props = {
  label: string;
  cells: readonly Cell[];
  width: number;
  height: number;
  onselect?: (cell: Cell) => void;
  /** Marks; give each cell's element `data-cell-index={index}` for the pointer. */
  children: Snippet<[{ active: number | null }]>;
};

let { label, cells, width, height, onselect, children }: Props = $props();

const uid = $props.id();
let active = $state<number | null>(null);
let hover = $state<number | null>(null);
let focused = $state(false);
let dismissed = $state(false);
let announcement = $state('');

const byPosition = $derived(new Map(cells.map((c, i) => [`${c.row}:${c.col}`, i])));
const rows = $derived([...new Set(cells.map((c) => c.row))].sort((a, b) => a - b));
const shown = $derived(hover ?? (focused ? active : null));

$effect.pre(() => {
  if (active !== null && active >= cells.length) active = cells.length ? 0 : null;
});

function setActive(i: number) {
  active = i;
  dismissed = false;
  const c = cells[i];
  if (c) announcement = c.description;
}

/** Nearest existing cell from (row, col) moving by (dr, dc); stays put at the edge. */
function step(from: Cell, dr: number, dc: number): number | null {
  let r = from.row + dr;
  let c = from.col + dc;
  for (let guard = 0; guard < 400; guard++) {
    const hit = byPosition.get(`${r}:${c}`);
    if (hit !== undefined) return hit;
    if (dr === 0) {
      // Moving along a row: skip gaps (calendars start mid-week).
      c += dc;
      if (!cells.some((x) => x.row === r && (dc > 0 ? x.col >= c : x.col <= c))) return null;
    } else {
      r += dr;
      if (!rows.some((x) => (dr > 0 ? x >= r : x <= r))) return null;
    }
  }
  return null;
}

function onkeydown(event: KeyboardEvent) {
  if (cells.length === 0) return;
  const current = cells[active ?? 0] as Cell;
  const inRow = cells.map((c, i) => [c, i] as const).filter(([c]) => c.row === current.row);
  let next: number | null = null;
  switch (event.key) {
    case 'ArrowRight':
      next = step(current, 0, 1);
      break;
    case 'ArrowLeft':
      next = step(current, 0, -1);
      break;
    case 'ArrowDown':
      next = step(current, 1, 0);
      break;
    case 'ArrowUp':
      next = step(current, -1, 0);
      break;
    case 'Home':
      next = event.ctrlKey ? 0 : (inRow.reduce((a, b) => (b[0].col < a[0].col ? b : a))[1] ?? null);
      break;
    case 'End':
      next = event.ctrlKey
        ? cells.length - 1
        : (inRow.reduce((a, b) => (b[0].col > a[0].col ? b : a))[1] ?? null);
      break;
    case 'Enter':
    case ' ':
      event.preventDefault();
      if (active !== null && cells[active]) onselect?.(cells[active] as Cell);
      return;
    case 'Escape':
      dismissed = true;
      hover = null;
      return;
    default:
      return;
  }
  event.preventDefault();
  if (next !== null) setActive(next);
  else if (active === null) setActive(0);
}

function indexAt(target: EventTarget | null): number | null {
  const el = (target as Element | null)?.closest?.('[data-cell-index]');
  const i = el ? Number(el.getAttribute('data-cell-index')) : Number.NaN;
  return Number.isInteger(i) && i >= 0 && i < cells.length ? i : null;
}
</script>

<div class="relative" style:width="{width}px" style:height="{height}px">
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <svg
    {width}
    {height}
    viewBox="0 0 {width} {height}"
    role="group"
    aria-roledescription="chart"
    aria-label="{label}. Use arrow keys to move between cells{onselect ? ', Enter to select' : ''}."
    aria-activedescendant={focused && active !== null ? `${uid}-cell` : undefined}
    tabindex="0"
    class="block overflow-visible rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    {onkeydown}
    onfocus={() => {
      focused = true;
      setActive(active ?? 0);
    }}
    onblur={() => (focused = false)}
    onpointermove={(e) => {
      hover = indexAt(e.target);
      dismissed = false;
    }}
    onpointerleave={() => (hover = null)}
    onclick={(e) => {
      const i = indexAt(e.target);
      if (i !== null) {
        setActive(i);
        if (cells[i]) onselect?.(cells[i] as Cell);
      }
    }}
  >
    {@render children({ active: shown })}
    {#if focused && active !== null && cells[active]}
      <g id="{uid}-cell" role="img" aria-label={cells[active]?.description} data-active-cell={active}></g>
    {/if}
  </svg>
  {#if shown !== null && cells[shown] && !dismissed}
    <Tooltip anchor={(cells[shown] as Cell).anchor} bounds={{ width, height }}>
      <p class="m-0">{cells[shown]?.description}</p>
    </Tooltip>
  {/if}
  <p class="sr-only" aria-live="polite" data-chart-live="">{announcement}</p>
</div>
