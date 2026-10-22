<script lang="ts">
import type { Snippet } from 'svelte';

let {
  list,
  detail,
  empty,
  listLabel = 'List',
  detailLabel = 'Details',
  detailActive = $bindable(false),
  class: className = '',
}: {
  list: Snippet;
  detail?: Snippet;
  empty?: Snippet;
  listLabel?: string;
  detailLabel?: string;
  /** On narrow containers, choose the visible pane. Callers own route and back behavior. */
  detailActive?: boolean;
  class?: string;
} = $props();

const hasDetail = $derived(Boolean(detail));
const selectedDetail = $derived(detailActive && hasDetail);
</script>

<div
  class="split-view @container min-h-0 min-w-0 {className}"
  data-py-split-view
  data-has-detail={hasDetail ? 'true' : 'false'}
  data-detail-active={selectedDetail ? 'true' : 'false'}
>
  <div class="split-view__panes min-h-0 min-w-0">
    <section class="split-view__list min-h-0 min-w-0" aria-label={listLabel}>
      {@render list()}
    </section>
    <section class="split-view__detail min-h-0 min-w-0" aria-label={detailLabel}>
      {#if detail}
        {@render detail()}
      {:else if empty}
        {@render empty()}
      {/if}
    </section>
  </div>
</div>

<style>
  .split-view {
    min-width: 0;
    container-type: inline-size;
  }

  .split-view__panes {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    height: 100%;
  }

  .split-view__list,
  .split-view__detail {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
  }

  .split-view__detail {
    display: none;
  }

  [data-has-detail='true'][data-detail-active='false'] .split-view__detail {
    display: none;
  }

  [data-has-detail='true'][data-detail-active='false'] .split-view__list {
    display: block;
  }

  [data-has-detail='true'][data-detail-active='true'] .split-view__list {
    display: none;
  }

  [data-detail-active='true'] .split-view__detail {
    display: block;
  }

  @container (min-width: 56rem) {
    .split-view__panes {
      grid-template-columns: minmax(15rem, 22.5rem) minmax(0, 1fr);
    }

    .split-view__list,
    [data-has-detail='true'][data-detail-active='true'] .split-view__list,
    [data-has-detail='true'][data-detail-active='false'] .split-view__list,
    .split-view__detail,
    [data-detail-active='true'] .split-view__detail {
      display: block;
    }
  }
</style>
