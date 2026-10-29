<script lang="ts" generics="T">
/**
 * Host adapter over `@texuli/data` `Board`: liveQuery `query`, optional open
 * handler, and service-friendly `onMove`. The per-card “Move <title>” menu
 * (lazy BoardMoveMenu) ships inside Texuli Board whenever `onMove` is set.
 */
import { runService } from '@protoyard/renderer-svelte';
import { Button } from '@protoyard/ui';
import type { BoardColumnDef, BoardLaneDef, BoardMove, MoveRules } from '@protoyard/views/board';
import { Board, type BoardLabels } from '@texuli/data/board';
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
  isLocked,
  onRetry,
  label = 'Board',
  emptyColumnText = 'No cards',
  density,
  dir,
  labels: labelOverrides,
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
  isLocked?: (item: T) => boolean;
  onRetry?: () => unknown;
  label?: string;
  emptyColumnText?: string;
  density?: 'comfortable' | 'compact';
  dir?: 'ltr' | 'rtl' | 'auto';
  /** Override Texuli Board labels (including moveMenu / moveMenuLabel). */
  labels?: Partial<BoardLabels>;
  class?: string;
} = $props();

async function persist(move: BoardMove, item: T): Promise<void> {
  await runService(() => onMove(move, item));
}

const boardLabels = $derived<Partial<BoardLabels>>({
  board: label,
  emptyCell: emptyColumnText,
  ...labelOverrides,
});
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
        {isLocked}
        onMove={persist}
        {canMove}
        {density}
        {dir}
        class={className}
        labels={boardLabels}
      >
        {#snippet card(item, state)}
          {#if onOpen}
            <Button
              type="button"
              variant="ghost"
              class="py-board-open"
              data-board-no-drag
              onclick={() => onOpen(item)}
            >
              {@render card(item, state)}
            </Button>
          {:else}
            {@render card(item, state)}
          {/if}
        {/snippet}
      </Board>
    {/snippet}
  </QueryState>
</div>

<style>
  :global(.py-board-open) {
    display: block;
    inline-size: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: start;
    cursor: pointer;
    font: inherit;
  }
</style>
