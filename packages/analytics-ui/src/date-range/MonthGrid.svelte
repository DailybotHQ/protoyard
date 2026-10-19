<script lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/svelte';
import { DAY_MS } from '@protoyard/analytics';
import { tick } from 'svelte';
import { isoDay, monthGrid, weekdayNames } from './model.ts';

type Props = {
  /** Selected span as `YYYY-MM-DD` days (end may be missing while picking). */
  start?: string | null;
  end?: string | null;
  /** The day that holds focus first (`YYYY-MM-DD`); also sets the visible month. */
  initial: string;
  /** Days after this instant cannot be picked (the simulated "now"). */
  max?: number;
  weekStartsOn?: number;
  onpick: (day: string) => void;
};

let { start = null, end = null, initial, max, weekStartsOn = 1, onpick }: Props = $props();

const toMs = (day: string) => Date.parse(`${day}T00:00:00.000Z`);
// svelte-ignore state_referenced_locally
let focused = $state(initial);
let grid = $state<HTMLTableElement | null>(null);

const view = $derived(new Date(toMs(focused)));
const weeks = $derived(monthGrid(view.getUTCFullYear(), view.getUTCMonth(), weekStartsOn));
const names = $derived(weekdayNames(weekStartsOn));
const title = $derived(
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(view)
);
const fullDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});
const lastDay = $derived(
  max === undefined ? Number.POSITIVE_INFINITY : Math.floor(max / DAY_MS) * DAY_MS
);
const lo = $derived(start && end ? (start < end ? start : end) : start);
const hi = $derived(start && end ? (start < end ? end : start) : start);

function shiftMonths(day: string, months: number): string {
  const d = new Date(toMs(day));
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const days = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  return isoDay(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d.getUTCDate(), days))
  );
}

async function moveTo(day: string) {
  focused = day;
  await tick();
  grid?.querySelector<HTMLButtonElement>(`[data-date="${day}"]`)?.focus();
}

function onkeydown(event: KeyboardEvent) {
  const ms = toMs(focused);
  const weekday = (new Date(ms).getUTCDay() - weekStartsOn + 7) % 7;
  const next: Record<string, () => string> = {
    ArrowLeft: () => isoDay(ms - DAY_MS),
    ArrowRight: () => isoDay(ms + DAY_MS),
    ArrowUp: () => isoDay(ms - 7 * DAY_MS),
    ArrowDown: () => isoDay(ms + 7 * DAY_MS),
    Home: () => isoDay(ms - weekday * DAY_MS),
    End: () => isoDay(ms + (6 - weekday) * DAY_MS),
    PageUp: () => shiftMonths(focused, event.shiftKey ? -12 : -1),
    PageDown: () => shiftMonths(focused, event.shiftKey ? 12 : 1),
  };
  const go = next[event.key];
  if (!go) return;
  event.preventDefault();
  void moveTo(go());
}
</script>

<div class="grid gap-2">
  <div class="flex items-center justify-between gap-2">
    <button
      type="button"
      class="inline-flex size-8 items-center justify-center rounded-md text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      aria-label="Previous month"
      onclick={() => (focused = shiftMonths(focused, -1))}><ChevronLeft class="size-4" aria-hidden="true" /></button
    >
    <p class="text-sm font-medium" aria-live="polite">{title}</p>
    <button
      type="button"
      class="inline-flex size-8 items-center justify-center rounded-md text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      aria-label="Next month"
      onclick={() => (focused = shiftMonths(focused, 1))}><ChevronRight class="size-4" aria-hidden="true" /></button
    >
  </div>
  <table bind:this={grid} role="grid" aria-label={title} class="w-full border-collapse text-center text-xs" {onkeydown}>
    <thead>
      <tr>
        {#each names as name (name)}
          <th scope="col" abbr={name} class="pb-1 font-normal text-muted-foreground">{name.slice(0, 2)}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each weeks as week (week[0]?.date)}
        <tr>
          {#each week as cell (cell.date)}
            {@const disabled = cell.ms > lastDay}
            {@const edge = cell.date === lo || cell.date === hi}
            {@const inside = lo !== null && hi !== null && cell.date > lo && cell.date < hi}
            <td role="gridcell" aria-selected={edge || inside} class="p-0">
              <button
                type="button"
                data-date={cell.date}
                tabindex={cell.date === focused ? 0 : -1}
                aria-label={fullDate.format(cell.ms)}
                aria-disabled={disabled ? 'true' : undefined}
                class="m-px inline-flex size-8 items-center justify-center rounded-md tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {edge
                  ? 'bg-primary text-primary-foreground'
                  : inside
                    ? 'bg-primary/15 text-foreground'
                    : cell.inMonth
                      ? 'text-foreground hover:bg-muted'
                      : 'text-muted-foreground hover:bg-muted'} {disabled ? 'cursor-not-allowed opacity-40' : ''}"
                onclick={() => {
                  focused = cell.date;
                  if (!disabled) onpick(cell.date);
                }}
              >
                {cell.day}
              </button>
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
