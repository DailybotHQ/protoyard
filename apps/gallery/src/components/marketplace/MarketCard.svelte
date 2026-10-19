<script lang="ts">
import { withBase } from '@/lib/format';
import DeviceThumb from './DeviceThumb.svelte';
import { detailHref, label, type MarketEntry } from './model';

/** One marketplace item: framed thumbnail, name, product type and where it runs. */
let { entry, headingLevel = 3 }: { entry: MarketEntry; headingLevel?: 2 | 3 | 4 } = $props();
const href = $derived(withBase(detailHref(entry)));
</script>

<article
  class="group relative flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface transition-[box-shadow,translate] duration-200 ease-out focus-within:ring-2 focus-within:ring-accent hover:shadow-md motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none"
  data-testid="market-card"
  data-kind={entry.k}
  data-slug={entry.s}
>
  <DeviceThumb shell={entry.sh} src={entry.th ? withBase(`/${entry.th}`) : null} icon={entry.i} name={entry.n} />
  <div class="flex flex-1 flex-col gap-2 p-4">
    <div class="flex items-center gap-2 text-xs text-muted">
      <span class={['rounded-full px-2 py-0.5 font-medium', entry.k === 'prototype' ? 'bg-accent-soft text-accent-fg' : 'border border-line']}>
        {label(entry.k)}
      </span>
      {#if entry.pt}<span class="truncate">{entry.pt}</span>{/if}
    </div>
    <svelte:element this={`h${headingLevel}`} class="font-medium leading-snug">
      <!-- The stretched link makes the whole card clickable while keeping one tab stop. -->
      <a {href} class="after:absolute after:inset-0 focus-visible:outline-none">{entry.n}</a>
    </svelte:element>
    <p class="line-clamp-2 text-sm text-muted">{entry.d}</p>
    <ul class="mt-auto flex flex-wrap gap-1.5 pt-1 text-xs text-muted" aria-label="Runs on">
      {#each entry.pf as platform (platform)}
        <li class="rounded-md bg-surface-2 px-1.5 py-0.5">{label(platform)}</li>
      {/each}
      {#if entry.sh !== 'none'}<li class="rounded-md bg-surface-2 px-1.5 py-0.5">{label(entry.sh)}</li>{/if}
    </ul>
  </div>
</article>
