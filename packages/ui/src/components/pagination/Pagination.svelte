<script lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/svelte';
import { cn } from '../../lib/cn.ts';
import { buttonVariants } from '../button/button-variants.ts';
import { getPageTokens } from './pages.ts';

interface Props {
  /** 1-based current page. */
  page?: number;
  /** Total pages; alternatively pass `total` and `pageSize`. */
  pageCount?: number;
  total?: number;
  pageSize?: number;
  siblings?: number;
  onPageChange?: (page: number) => void;
  label?: string;
  /** Hide numbered pages (prev/next only), e.g. in tight toolbars. */
  compact?: boolean;
  class?: string;
}

let {
  page = $bindable(1),
  pageCount,
  total,
  pageSize = 10,
  siblings = 1,
  onPageChange,
  label = 'Pagination',
  compact = false,
  class: className,
}: Props = $props();

const count = $derived(Math.max(1, pageCount ?? Math.ceil((total ?? 0) / Math.max(1, pageSize))));
const tokens = $derived(getPageTokens(page, count, siblings));

function go(next: number): void {
  const clamped = Math.min(Math.max(1, next), count);
  if (clamped === page) return;
  page = clamped;
  onPageChange?.(clamped);
}

const itemClass = cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'tabular-nums');
</script>

<nav aria-label={label} class={cn('flex items-center', className)}>
  <ul class="flex items-center gap-1">
    <li>
      <button
        type="button"
        class={cn(buttonVariants({ variant: 'ghost', size: 'md' }), 'gap-1 px-2.5')}
        disabled={page <= 1}
        onclick={() => go(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft aria-hidden="true" />
        <span class="hidden sm:inline">Previous</span>
      </button>
    </li>
    {#if compact}
      <li class="px-2 text-sm text-muted-foreground tabular-nums" aria-current="page">
        Page {page} of {count}
      </li>
    {:else}
      {#each tokens as token (token)}
        <li class={typeof token === 'number' && token !== page && token !== 1 && token !== count ? 'hidden sm:block' : undefined}>
          {#if typeof token === 'number'}
            <button
              type="button"
              class={cn(itemClass, token === page && 'border border-input bg-surface shadow-soft')}
              aria-current={token === page ? 'page' : undefined}
              aria-label={`Page ${token}`}
              onclick={() => go(token)}
            >
              {token}
            </button>
          {:else}
            <span class="flex size-9 items-center justify-center text-muted-foreground" aria-hidden="true">…</span>
          {/if}
        </li>
      {/each}
    {/if}
    <li>
      <button
        type="button"
        class={cn(buttonVariants({ variant: 'ghost', size: 'md' }), 'gap-1 px-2.5')}
        disabled={page >= count}
        onclick={() => go(page + 1)}
        aria-label="Next page"
      >
        <span class="hidden sm:inline">Next</span>
        <ChevronRight aria-hidden="true" />
      </button>
    </li>
  </ul>
</nav>
