<script lang="ts">
import type { Snippet } from 'svelte';
import Tooltip from '../interaction/Tooltip.svelte';
import type { PlotItem } from './model.ts';

type Props = {
  label: string;
  items: readonly PlotItem[];
  width: number;
  height: number;
  /** Enter, Space or a click on an item. */
  onselect?: (index: number) => void;
  /** Escape when nothing is left to dismiss, or Backspace (treemap: go up a level). */
  onback?: () => void;
  /** Marks; give each one `data-item={index}` so the pointer can find it. */
  children: Snippet<[{ active: number | null; idOf: (index: number) => string }]>;
  /** Tooltip body for an item (defaults to its description). */
  tip?: Snippet<[number]>;
};

let { label, items, width, height, onselect, onback, children, tip }: Props = $props();

const uid = $props.id();
let active = $state<number | null>(null);
let hover = $state<number | null>(null);
let focused = $state(false);
let dismissed = $state(false);
let announcement = $state('');

const idOf = (i: number) => `${uid}-item-${i}`;
const shown = $derived(hover ?? (focused ? active : null));
const current = $derived(shown === null ? undefined : items[shown]);

// Keep the active item valid when the items change (data update, drill-down).
$effect.pre(() => {
  if (active !== null && active >= items.length) active = items.length ? 0 : null;
});

function setActive(i: number) {
  active = i;
  dismissed = false;
  const item = items[i];
  if (item) announcement = `${item.description}. ${i + 1} of ${items.length}.`;
}

function onkeydown(event: KeyboardEvent) {
  const n = items.length;
  if (n === 0) return;
  const at = active ?? 0;
  const moves: Record<string, number> = {
    ArrowRight: Math.min(n - 1, at + 1),
    ArrowDown: Math.min(n - 1, at + 1),
    ArrowLeft: Math.max(0, at - 1),
    ArrowUp: Math.max(0, at - 1),
    Home: 0,
    End: n - 1,
  };
  if (event.key in moves) {
    event.preventDefault();
    setActive(active === null ? 0 : (moves[event.key] as number));
  } else if ((event.key === 'Enter' || event.key === ' ') && active !== null) {
    event.preventDefault();
    onselect?.(active);
  } else if (event.key === 'Escape') {
    if (!dismissed && shown !== null) {
      dismissed = true;
      hover = null;
    } else onback?.();
  } else if (event.key === 'Backspace' && onback) {
    event.preventDefault();
    onback();
  }
}

function itemAt(target: EventTarget | null): number | null {
  const el = (target as Element | null)?.closest?.('[data-item]');
  const i = el ? Number(el.getAttribute('data-item')) : Number.NaN;
  return Number.isInteger(i) && i >= 0 && i < items.length ? i : null;
}
</script>

<div class="relative" style:width="{width}px" style:height="{height}px">
  <!-- One focusable chart with aria-activedescendant, as in InteractivePlot. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <svg
    {width}
    {height}
    viewBox="0 0 {width} {height}"
    role="group"
    aria-roledescription="chart"
    aria-label="{label}. Use arrow keys to move between items{onselect ? ', Enter to select' : ''}."
    aria-activedescendant={focused && active !== null ? idOf(active) : undefined}
    tabindex="0"
    class="block overflow-visible rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    {onkeydown}
    onfocus={() => {
      focused = true;
      setActive(active ?? 0);
    }}
    onblur={() => (focused = false)}
    onpointermove={(e) => {
      hover = itemAt(e.target);
      dismissed = false;
    }}
    // A tap has no pointermove before it: set the hover on pointerdown so the tooltip shows on touch.
    onpointerdown={(e) => {
      hover = itemAt(e.target);
      dismissed = false;
    }}
    onpointerleave={() => (hover = null)}
    onclick={(e) => {
      const i = itemAt(e.target);
      if (i !== null) {
        setActive(i);
        onselect?.(i);
      }
    }}
  >
    {@render children({ active: shown, idOf })}
    {#if focused && active !== null && items[active]}
      <g id={idOf(active)} role="img" aria-label={items[active]?.description} data-active-item={active}></g>
    {/if}
  </svg>
  {#if current && !dismissed && shown !== null}
    <Tooltip anchor={current.anchor} bounds={{ width, height }}>
      {#if tip}{@render tip(shown)}{:else}<p class="m-0">{current.description}</p>{/if}
    </Tooltip>
  {/if}
  <p class="sr-only" aria-live="polite" data-chart-live="">{announcement}</p>
</div>
