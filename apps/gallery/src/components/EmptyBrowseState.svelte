<script lang="ts">
import X from '@lucide/svelte/icons/x';
import { Button } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { withBase } from '../lib/format.ts';

export type EmptyKind = 'favorites' | 'recent' | 'filters' | 'none';

interface Props {
  kind: EmptyKind;
  onClearFilters?: () => void;
  onBrowseAll?: () => void;
}

let { kind, onClearFilters, onBrowseAll }: Props = $props();
</script>

<div
  class="mt-3 rounded-xl border border-dashed border-line p-10 text-center"
  data-testid="browse-empty"
  data-empty={kind}
>
  <p class="font-medium" data-testid="browse-empty-title">
    {#if kind === 'favorites'}
      No favorites yet
    {:else if kind === 'recent'}
      Nothing opened yet
    {:else if kind === 'filters'}
      Nothing matches these filters
    {:else}
      No prototypes yet
    {/if}
  </p>
  <p class="mt-1 text-sm text-muted">
    {#if kind === 'favorites'}
      Star a prototype to keep it here (stored in this browser only).
    {:else if kind === 'recent'}
      Prototypes you open appear here.
    {:else if kind === 'filters'}
      Try fewer words or clear the filters.
    {:else}
      Index the workspace or scaffold a prototype to fill the gallery.
    {/if}
  </p>
  <div class="mt-5 flex flex-wrap items-center justify-center gap-2" data-testid="browse-empty-actions">
    {#if kind === 'filters' && onClearFilters}
      <Button
        type="button"
        class="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-hover"
        data-testid="empty-clear-filters"
        onclick={onClearFilters}
      >
        <LucideIcon icon={X} size={14} aria-hidden="true" /> Clear filters
      </Button>
    {/if}
    {#if (kind === 'favorites' || kind === 'recent') && onBrowseAll}
      <Button
        type="button"
        class="inline-flex items-center rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-hover"
        data-testid="empty-browse-all"
        onclick={onBrowseAll}
      >
        Browse all prototypes
      </Button>
    {/if}
    <a
      href="#templates"
      class="inline-flex items-center rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-2"
      data-testid="empty-browse-templates"
    >
      Browse templates
    </a>
    <a
      href={withBase('/new/')}
      class="inline-flex items-center rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-2"
      data-testid="empty-create-prototype"
    >
      Create prototype
    </a>
  </div>
</div>
