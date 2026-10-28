<script lang="ts">
import ChevronLeft from '@lucide/svelte/icons/chevron-left';
import ChevronRight from '@lucide/svelte/icons/chevron-right';
import { LucideIcon } from 'texuli/icons/lucide';
import { Pagination, paginationItemClass, paginationListClass } from 'texuli/navigation';
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
</script>

<!--
  A thin adapter over Texuli's styled Pagination (`texuli/navigation`): its
  root owns the page state, count and labels; this adds the compact "Page n
  of m" mode, icon-plus-word previous/next buttons and `getPageTokens`, which
  keeps the token count stable so the control never shifts under the pointer.
-->
<Pagination.Root
  bind:page
  {pageCount}
  {total}
  {pageSize}
  {siblings}
  {onPageChange}
  {label}
  class={className}
>
  {#snippet children(ctx)}
    <ul class={paginationListClass()}>
      <li class={paginationItemClass()}>
        <Pagination.PreviousButton>
          <LucideIcon icon={ChevronLeft} size="sm" />
          <span class="hidden sm:inline">Previous</span>
        </Pagination.PreviousButton>
      </li>
      {#if compact}
        <li class={paginationItemClass({ class: 'ui-pagination__status' })} aria-current="page">
          Page {ctx.page} of {ctx.pageCount}
        </li>
      {:else}
        {#each getPageTokens(ctx.page, ctx.pageCount, siblings) as token (token)}
          <!-- Phones keep the first, last and current page; the rest show from `sm`. -->
          <li
            class={paginationItemClass({
              class:
                typeof token === 'number' && token !== ctx.page && token !== 1 && token !== ctx.pageCount
                  ? 'hidden sm:block'
                  : undefined,
            })}
          >
            {#if typeof token === 'number'}
              <Pagination.Page page={token}>{token}</Pagination.Page>
            {:else}
              <Pagination.Ellipsis />
            {/if}
          </li>
        {/each}
      {/if}
      <li class={paginationItemClass()}>
        <Pagination.NextButton>
          <span class="hidden sm:inline">Next</span>
          <LucideIcon icon={ChevronRight} size="sm" />
        </Pagination.NextButton>
      </li>
    </ul>
  {/snippet}
</Pagination.Root>

<style>
  .ui-pagination__status {
    padding-inline: 0.5rem;
    color: var(--tx-muted-foreground, GrayText);
    font-size: var(--tx-font-size-sm, 0.875rem);
    font-variant-numeric: tabular-nums;
  }
</style>
