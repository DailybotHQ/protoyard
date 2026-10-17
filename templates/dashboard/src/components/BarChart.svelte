<script lang="ts">
import type { DailyTotal } from '../domain/metrics.ts';
import { formatDay, money, moneyCompact } from '../lib/format.ts';

/**
 * Dependency-free bar chart built from stored rows. Bars are decorative;
 * screen readers get the same numbers as a visually hidden table.
 */
let {
  data,
  currency = 'USD',
  label,
}: { data: DailyTotal[]; currency?: string; label: string } = $props();

const max = $derived(Math.max(1, ...data.map((d) => d.total)));
const total = $derived(data.reduce((s, d) => s + d.total, 0));
let hovered = $state<number | null>(null);
const focus = $derived(hovered === null ? null : (data[hovered] ?? null));
</script>

<figure class="m-0">
  <div class="flex items-baseline justify-between gap-2">
    <p class="text-2xl font-semibold tabular-nums">{money(total, currency)}</p>
    <p class="text-xs text-muted-foreground" aria-live="polite">
      {#if focus}
        {formatDay(focus.day)} · {money(focus.total, currency)} · {focus.count} order{focus.count === 1 ? '' : 's'}
      {:else}
        Hover a bar for details
      {/if}
    </p>
  </div>
  <div class="mt-4 flex h-52 items-end gap-1 sm:gap-1.5" aria-hidden="true">
    {#each data as point, i (point.day)}
      <div
        class="group relative flex h-full flex-1 items-end"
        role="presentation"
        onmouseenter={() => (hovered = i)}
        onmouseleave={() => (hovered = null)}
      >
        <div
          class={[
            'w-full rounded-t-sm transition-[height,background-color] duration-300 motion-reduce:transition-none',
            point.total > 0 ? 'bg-primary/70 group-hover:bg-primary' : 'bg-muted',
            hovered === i && 'bg-primary',
          ]}
          style:height={point.total > 0 ? `${Math.max(4, (point.total / max) * 100)}%` : '3px'}
        ></div>
      </div>
    {/each}
  </div>
  <div class="mt-2 flex justify-between text-xs text-muted-foreground" aria-hidden="true">
    <span>{data[0] ? formatDay(data[0].day) : ''}</span>
    <span>{data.at(-1) ? formatDay(data.at(-1)?.day ?? '') : ''}</span>
  </div>
  <table class="sr-only">
    <caption>{label}</caption>
    <thead><tr><th scope="col">Day</th><th scope="col">Revenue</th><th scope="col">Orders</th></tr></thead>
    <tbody>
      {#each data as point (point.day)}
        <tr><td>{formatDay(point.day)}</td><td>{moneyCompact(point.total, currency)}</td><td>{point.count}</td></tr>
      {/each}
    </tbody>
  </table>
  <figcaption class="sr-only">{label}</figcaption>
</figure>
