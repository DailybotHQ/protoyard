<script lang="ts" generics="T">
/**
 * Host adapter over `@texuli/data` `Board`: liveQuery `query`, optional open
 * handler, and service-friendly `onMove`. Presentation and drag math come from
 * Texuli; this file only bridges the Protoyard host contract.
 */
import { runService } from '@protoyard/renderer-svelte';
import type { BoardColumnDef, BoardLaneDef, BoardMove, MoveRules } from '@protoyard/views/board';
import { Board } from '@texuli/data/board';
import type { Snippet } from 'svelte';
import QueryState from '../states/QueryState.svelte';

let {
  query,
  columns,
  lanes,
  getId,
  getColumn,
  getLane,
  getRank,
  getLabel,
  card,
  onMove,
  onOpen,
  canMove,
  onRetry,
  label = 'Board',
  emptyColumnText = 'No cards',
  class: className,
}: {
  query: { readonly current: T[] | undefined; readonly loading: boolean; readonly error: unknown };
  columns: readonly BoardColumnDef[];
  lanes?: readonly BoardLaneDef[];
  getId: (item: T) => string;
  getColumn: (item: T) => string;
  getLane?: (item: T) => string;
  getRank: (item: T) => string;
  getLabel: (item: T) => string;
  card: Snippet<[T, { pending: boolean }]>;
  onMove: (move: BoardMove, item: T) => unknown;
  onOpen?: (item: T) => void;
  canMove?: MoveRules<T>['canMove'];
  onRetry?: () => unknown;
  label?: string;
  emptyColumnText?: string;
  class?: string;
} = $props();

async function persist(move: BoardMove, item: T): Promise<void> {
  await runService(() => onMove(move, item));
}
</script>

<div data-board={label}>
  <QueryState
    {query}
    label={`Loading ${label.toLowerCase()}`}
    onRetry={onRetry ? () => { void onRetry(); } : undefined}
    emptyTitle={`No ${label.toLowerCase()} yet`}
    isEmpty={() => false}
  >
    {#snippet children(items)}
      <Board
        {columns}
        {lanes}
        items={items}
        {getId}
        {getColumn}
        {getLane}
        {getRank}
        {getLabel}
        onMove={persist}
        {canMove}
        class={className}
        labels={{ board: label, emptyCell: emptyColumnText }}
      >
        {#snippet card(item, state)}
          {#if onOpen}
            <button
              type="button"
              class="py-board-open"
              data-board-no-drag
              onclick={() => onOpen(item)}
            >
              {@render card(item, state)}
            </button>
          {:else}
            {@render card(item, state)}
          {/if}
        {/snippet}
      </Board>
    {/snippet}
  </QueryState>
</div>

<style>
  .py-board-open {
    display: block;
    inline-size: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
</style>
