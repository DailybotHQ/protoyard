<script lang="ts">
import { withBase } from '../../lib/format';
import DeviceThumb from './DeviceThumb.svelte';
import {
  detailHref,
  label,
  type MarketEntry,
  type MarketTheme,
  tryThemeHref,
  tryThemes,
} from './model';

/**
 * One marketplace item: framed thumbnail, name, product type, where it runs,
 * its default theme and, for runnable items, a "Try in theme" list that opens
 * the live demo in another library theme.
 */
let {
  entry,
  headingLevel = 3,
  themes = [],
}: { entry: MarketEntry; headingLevel?: 2 | 3 | 4; themes?: readonly MarketTheme[] } = $props();
const href = $derived(withBase(detailHref(entry)));
const choices = $derived(entry.k === 'blueprint' ? [] : tryThemes(themes, entry));
/** The list renders on first open only, so 1000 cards do not ship 7000 links in their HTML. */
let tryOpen = $state(false);
</script>

{#snippet swatch(theme: MarketTheme)}
  {#if theme.s.length}
    <span class="inline-flex shrink-0 -space-x-1" aria-hidden="true">
      {#each theme.s as color, index (index)}
        <span class="size-3 rounded-full border border-surface ring-1 ring-line" style:background-color={color}></span>
      {/each}
    </span>
  {/if}
{/snippet}

<article
  class="group relative flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface transition-[box-shadow,translate] duration-200 ease-out focus-within:ring-2 focus-within:ring-accent hover:shadow-md motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none"
  data-testid="market-card"
  data-kind={entry.k}
  data-content-kind={entry.contentKind}
  data-slug={entry.s}
>
  <DeviceThumb shell={entry.sh} src={entry.th ? withBase(`/${entry.th}`) : null} icon={entry.i} name={entry.n} />
  <div class="flex flex-1 flex-col gap-2 p-4">
    <div class="flex items-center gap-2 text-xs text-muted">
      <span class={['rounded-full px-2 py-0.5 font-medium', entry.k === 'prototype' ? 'bg-accent-soft text-accent-fg' : 'border border-line']}>
        {label(entry.k)}
      </span>
      <span class="rounded-full border border-line px-2 py-0.5" data-testid="market-content-kind">
        {label(entry.contentKind)}
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
    {#if entry.tm}
      <p class="flex min-w-0 items-center gap-1.5 text-xs text-muted" data-testid="market-theme">
        {@render swatch(entry.tm)}
        <span class="truncate">Theme: <span class="text-fg">{entry.tm.n}</span></span>
      </p>
    {/if}
    {#if choices.length}
      <!-- Above the stretched link, so the disclosure and its links stay clickable. -->
      <details
        class="relative z-10 text-xs"
        data-testid="market-try-theme"
        ontoggle={(event) => (tryOpen = event.currentTarget.open)}
      >
        <summary class="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-accent-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent">
          Try in theme<span class="sr-only">: {entry.n}</span>
        </summary>
        {#if tryOpen}
        <ul class="mt-1 grid gap-0.5" aria-label={`Open ${entry.n} in another theme`}>
          {#each choices as theme (theme.i)}
            <li>
              <a
                class="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
                href={withBase(tryThemeHref(entry, theme.i))}
              >
                {@render swatch(theme)}
                <span class="truncate text-fg">{theme.n}</span>
                <span class="ml-auto shrink-0 text-muted">{label(theme.c)}</span>
              </a>
            </li>
          {/each}
          <li>
            <a class="block rounded-md px-1.5 py-1 text-accent-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent" href={withBase('/themes/')}>
              All themes
            </a>
          </li>
        </ul>
        {/if}
      </details>
    {/if}
  </div>
</article>
