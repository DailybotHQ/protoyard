<script lang="ts">
import Layers from '@lucide/svelte/icons/layers';
import { PLATFORM_LABEL, STATUS_LABEL, withBase } from '@/lib/format';
import { transitionName } from '@/lib/transitions';
import type { CompactEntry } from '@/lib/types';
import FavoriteButton from './FavoriteButton.svelte';
import ProjectIcon from './ProjectIcon.svelte';

let { entry }: { entry: CompactEntry } = $props();
const href = $derived(withBase(entry.k === 'template' ? `/t/${entry.s}/` : `/p/${entry.s}/`));
// Only prototype cards morph into their detail page (see lib/transitions.ts).
const morph = $derived(entry.k === 'prototype');
</script>

<article
  class="group relative flex h-full flex-col rounded-xl border border-line bg-surface p-4 transition-[box-shadow,translate,scale] duration-200 ease-out focus-within:ring-2 focus-within:ring-accent hover:shadow-md motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.99] motion-reduce:transition-none"
  data-testid="project-card"
  data-slug={entry.s}
>
  {#if entry.th}
    <!-- Decorative: the name below is the accessible label. -->
    <img
      src={withBase(`/${entry.th}`)}
      alt=""
      loading="lazy"
      decoding="async"
      width="640"
      height="400"
      class="-mx-4 -mt-4 mb-4 aspect-[16/10] w-[calc(100%+2rem)] max-w-none rounded-t-xl border-b border-line bg-surface-2 object-cover object-top"
    />
  {/if}
  <div class="flex items-start gap-3">
    <span class="shrink-0 rounded-xl" style:view-transition-name={morph ? transitionName('icon', entry.s) : undefined}>
      <ProjectIcon icon={entry.i} name={entry.n} />
    </span>
    <div class="min-w-0 flex-1">
      <h3 class="w-fit max-w-full truncate font-medium" style:view-transition-name={morph ? transitionName('title', entry.s) : undefined}>
        <!-- The stretched link makes the whole card clickable while keeping one tab stop. -->
        <a {href} class="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">{entry.n}</a>
      </h3>
      <p class="truncate font-mono text-xs text-muted">{entry.s}</p>
    </div>
    <div class="relative z-10">
      <FavoriteButton slug={entry.s} name={entry.n} />
    </div>
  </div>
  <p class="mt-3 line-clamp-2 min-h-10 text-sm text-muted">{entry.d || 'No description yet.'}</p>
  <div class="mt-3 flex flex-wrap gap-1.5">
    {#each entry.t.slice(0, 4) as tag (tag)}
      <span class="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs text-muted">#{tag}</span>
    {/each}
  </div>
  <dl class="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-xs text-muted">
    <div class="flex gap-1"><dt class="sr-only">Platform</dt><dd>{PLATFORM_LABEL[entry.p]}</dd></div>
    <div class="flex gap-1">
      <dt class="sr-only">Scenarios</dt>
      <dd class="inline-flex items-center gap-1"><Layers size={12} aria-hidden="true" />{entry.sc} scenario{entry.sc === 1 ? '' : 's'}</dd>
    </div>
    {#if entry.rv}
      <div role="group" class="flex gap-1" aria-label={`Review comments: ${entry.rv.open} open, ${entry.rv.resolved} resolved`}>
        <dt class="sr-only">Review comments</dt>
        <dd>{entry.rv.open} open · {entry.rv.resolved} resolved</dd>
      </div>
    {/if}
    {#if entry.e}
      <div class="flex gap-1"><dt class="sr-only">Live demo</dt><dd class="text-success">Live demo</dd></div>
    {/if}
    {#if entry.tp}
      <div class="flex gap-1"><dt class="sr-only">Template</dt><dd>from {entry.tp}</dd></div>
    {/if}
    <div class="ml-auto flex gap-1">
      <dt class="sr-only">Status</dt>
      <dd
        class={[
          'rounded-full px-2 py-0.5 font-medium',
          entry.st === 'ready' && 'bg-accent-soft text-accent-fg',
          entry.st === 'active' && 'bg-surface-2 text-fg',
          (entry.st === 'draft' || entry.st === 'archived') && 'border border-line',
        ]}
      >
        {entry.k === 'template' ? 'Template' : STATUS_LABEL[entry.st]}
      </dd>
    </div>
  </dl>
</article>
