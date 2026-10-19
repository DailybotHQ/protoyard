<script lang="ts">
import type { Snippet } from 'svelte';
import { onMount } from 'svelte';

interface Props {
  list?: Snippet;
  detail?: Snippet;
  /** LayoutHost integration; the stable routed screen is mounted in the detail pane. */
  mountScreen?: (target: HTMLElement) => void;
  /** Bind to route selection so narrow screens show the routed detail pane. */
  detailActive?: boolean;
  listLabel?: string;
  detailLabel?: string;
  backLabel?: string;
  storageKey?: string;
  class?: string;
}

const MIN_LIST_WIDTH = 240;
const MAX_LIST_WIDTH = 640;
const WIDTH_STEP = 16;

let {
  list,
  detail,
  mountScreen,
  detailActive = $bindable(false),
  listLabel = 'Items',
  detailLabel = 'Details',
  backLabel = 'Back to list',
  storageKey,
  class: className,
}: Props = $props();

let root = $state<HTMLDivElement | undefined>();
let screenTarget = $state<HTMLDivElement | undefined>();
let listWidth = $state(360);

$effect(() => {
  if (mountScreen && screenTarget) mountScreen(screenTarget);
});

onMount(() => {
  const key = getStorageKey();
  if (!key) return;
  try {
    const stored = Number(localStorage.getItem(key));
    if (Number.isFinite(stored) && stored >= MIN_LIST_WIDTH && stored <= MAX_LIST_WIDTH) {
      listWidth = stored;
    }
  } catch {
    // Storage is an optional convenience; an unavailable store keeps defaults.
  }
});

function getStorageKey(): string | undefined {
  if (storageKey) return storageKey;
  if (typeof location === 'undefined') return undefined;
  return `protoyard:master-detail:${location.pathname}`;
}

function persistWidth(): void {
  const key = getStorageKey();
  if (!key) return;
  try {
    localStorage.setItem(key, String(listWidth));
  } catch {
    // Continue working when browser storage is disabled or full.
  }
}

function setWidth(next: number): void {
  listWidth = Math.min(MAX_LIST_WIDTH, Math.max(MIN_LIST_WIDTH, next));
  persistWidth();
}

function onSplitterKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowLeft') setWidth(listWidth - WIDTH_STEP);
  else if (event.key === 'ArrowRight') setWidth(listWidth + WIDTH_STEP);
  else if (event.key === 'Home') setWidth(MIN_LIST_WIDTH);
  else if (event.key === 'End') setWidth(MAX_LIST_WIDTH);
  else return;
  event.preventDefault();
}

function updateFromPointer(event: PointerEvent): void {
  if (!root) return;
  const bounds = root.getBoundingClientRect();
  listWidth = Math.min(MAX_LIST_WIDTH, Math.max(MIN_LIST_WIDTH, event.clientX - bounds.left));
}

function onSplitterPointerDown(event: PointerEvent): void {
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  updateFromPointer(event);
}

function onBack(): void {
  detailActive = false;
}
</script>

<div
  bind:this={root}
  class="master-detail @container min-w-0 {className ?? ''}"
  data-py-master-detail
  data-py-layout-host-mode={mountScreen || undefined}
  data-detail-active={mountScreen ? true : detailActive}
  style={`--py-master-detail-list-width: ${listWidth}px`}
>
  <div class="master-detail__panes">
    {#if list}
      <section class="master-detail__list" aria-label={listLabel}>
        {@render list()}
      </section>
    {/if}
    {#if list && detail}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        class="master-detail__splitter"
        role="separator"
        tabindex="0"
        aria-label="Resize list panel"
        aria-orientation="vertical"
        aria-valuemin={MIN_LIST_WIDTH}
        aria-valuemax={MAX_LIST_WIDTH}
        aria-valuenow={listWidth}
        aria-valuetext={`List panel width ${listWidth} pixels`}
        onkeydown={onSplitterKeydown}
        onpointerdown={onSplitterPointerDown}
        onpointermove={(event) => event.buttons === 1 && updateFromPointer(event)}
        onpointerup={persistWidth}
        onpointercancel={persistWidth}
      ></div>
    {/if}
    {#if detail || mountScreen}
      <section class="master-detail__detail" aria-label={detailLabel}>
        {#if list && detail}<button class="master-detail__back" type="button" onclick={onBack}>{backLabel}</button>{/if}
        {#if detail}
          {@render detail()}
        {:else if mountScreen}
          <div bind:this={screenTarget} data-py-layout-screen-target></div>
        {/if}
      </section>
    {/if}
  </div>
</div>

<style>
  .master-detail {
    min-width: 0;
    container-type: inline-size;
  }

  .master-detail__panes {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
  }

  .master-detail__list,
  .master-detail__detail {
    min-width: 0;
    min-height: 0;
  }

  .master-detail__list {
    overflow: auto;
    overscroll-behavior: contain;
  }

  .master-detail__detail {
    display: none;
    overflow: auto;
  }

  [data-detail-active='true'] .master-detail__list {
    display: none;
  }

  [data-detail-active='true'] .master-detail__detail {
    display: block;
  }

  .master-detail__splitter {
    display: none;
    border: 0;
    background: transparent;
    cursor: col-resize;
    touch-action: none;
  }

  .master-detail__splitter::after {
    display: block;
    width: 1px;
    height: 100%;
    min-height: 2rem;
    margin-inline: auto;
    background: var(--py-border, #d4d4d8);
    content: '';
  }

  .master-detail__splitter:hover::after,
  .master-detail__splitter:focus-visible::after {
    width: 3px;
    background: var(--py-ring, #7c3aed);
  }

  .master-detail__splitter:focus-visible {
    outline: 2px solid var(--py-ring, #7c3aed);
    outline-offset: 2px;
  }

  .master-detail__back {
    display: block;
    min-height: 44px;
    margin-block-end: 0.5rem;
    color: var(--py-primary, #6d28d9);
    font: inherit;
    text-align: start;
    text-decoration: underline;
  }

  @container (min-width: 56rem) {
    .master-detail__panes {
      grid-template-columns: minmax(15rem, var(--py-master-detail-list-width, 22.5rem)) 0.5rem minmax(0, 1fr);
      min-height: var(--py-app-height, 100%);
    }

    .master-detail[data-py-layout-host-mode] .master-detail__panes {
      grid-template-columns: minmax(0, 1fr);
    }

    .master-detail__list,
    .master-detail__detail,
    [data-detail-active='true'] .master-detail__list,
    [data-detail-active='true'] .master-detail__detail {
      display: block;
    }

    .master-detail__splitter {
      display: block;
    }

    .master-detail__back {
      display: none;
    }
  }
</style>
