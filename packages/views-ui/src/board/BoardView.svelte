<script lang="ts" generics="T">
/**
 * Host adapter over `@texuli/data` `Board`: liveQuery `query`, optional open
 * handler, and service-friendly `onMove`. The per-card “Move <title>” menu
 * (lazy BoardMoveMenu) ships inside Texuli Board whenever `onMove` is set.
 * `columnHeader` / `columnFooter` pass straight through; `onCreate` adds an
 * “Add card” button to each column footer; `collapsibleLanes` adds a lane
 * toolbar whose collapsed lanes (and their cards) are left out of the board.
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
  columnHeader,
  columnFooter,
  onCreate,
  canCreate,
  createLabel = 'Add card',
  collapsibleLanes = false,
  collapsedLanes = $bindable<string[]>([]),
  onCollapsedLanesChange,
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
  /** Rendered in each column header after the title and count (Texuli `columnHeader`). */
  columnHeader?: Snippet<[BoardColumnDef, { count: number }]>;
  /** Rendered at the end of each column (Texuli `columnFooter`), before the create button. */
  columnFooter?: Snippet<[BoardColumnDef, { count: number }]>;
  /** In-column create: adds an “Add card” button to each column; runs through `runService`. */
  onCreate?: (column: BoardColumnDef) => unknown;
  /** Columns that offer the create button (default: every column). */
  canCreate?: (column: BoardColumnDef) => boolean;
  /** Visible text of the create button; its name adds “to <column>”. */
  createLabel?: string;
  /** Shows a lane toolbar that collapses and expands swimlanes (needs two or more lanes). */
  collapsibleLanes?: boolean;
  /** Ids of collapsed lanes (bindable). Their cards are not shown or counted. */
  collapsedLanes?: string[];
  onCollapsedLanesChange?: (collapsed: string[]) => void;
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

const laneToggles = $derived(collapsibleLanes && (lanes?.length ?? 0) > 1);
const collapsedSet = $derived(new Set(laneToggles ? collapsedLanes : []));
const shownLanes = $derived(lanes?.filter((lane) => !collapsedSet.has(lane.id)));

function laneOf(item: T): string {
  return getLane?.(item) ?? '';
}

function visibleItems(items: readonly T[]): T[] {
  if (collapsedSet.size === 0) return [...items];
  return items.filter((item) => !collapsedSet.has(laneOf(item)));
}

function laneCount(items: readonly T[], laneId: string): number {
  return items.filter((item) => laneOf(item) === laneId).length;
}

function toggleLane(laneId: string): void {
  const next = collapsedSet.has(laneId)
    ? collapsedLanes.filter((id) => id !== laneId)
    : [...collapsedLanes, laneId];
  collapsedLanes = next;
  onCollapsedLanesChange?.(next);
}

async function create(column: BoardColumnDef): Promise<void> {
  if (!onCreate) return;
  await runService(() => onCreate(column));
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
      {#if laneToggles && lanes}
        <div class="py-board-lanes" role="group" aria-label={`${label} lanes`} data-board-lanes>
          {#each lanes as lane (lane.id)}
            {@const expanded = !collapsedSet.has(lane.id)}
            <Button
              type="button"
              variant={expanded ? 'outline' : 'ghost'}
              size="sm"
              aria-expanded={expanded}
              data-board-lane-toggle={lane.id}
              onclick={() => toggleLane(lane.id)}
            >
              <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
              {lane.title}
              <span class="py-board-lane-count">({laneCount(items, lane.id)})</span>
            </Button>
          {/each}
        </div>
      {/if}
      <Board
        {columns}
        lanes={laneToggles ? shownLanes : lanes}
        items={visibleItems(items)}
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
        {columnHeader}
        columnFooter={onCreate || columnFooter ? boardFooter : undefined}
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

{#snippet boardFooter(column: BoardColumnDef, state: { count: number })}
  {#if columnFooter}{@render columnFooter(column, state)}{/if}
  {#if onCreate && (canCreate?.(column) ?? true)}
    <Button
      type="button"
      variant="ghost"
      size="sm"
      class="py-board-create"
      aria-label={`${createLabel} to ${column.title}`}
      data-board-create={column.id}
      onclick={() => create(column)}
    >
      <span aria-hidden="true">+</span>
      {createLabel}
    </Button>
  {/if}
{/snippet}

<style>
  .py-board-lanes {
    display: flex;
    flex-wrap: wrap;
    gap: var(--tx-space-2, 0.5rem);
    margin-block-end: var(--tx-space-2, 0.5rem);
  }
  .py-board-lane-count {
    color: var(--tx-muted-foreground, GrayText);
  }
  [data-board] :global(.py-board-create) {
    inline-size: 100%;
    justify-content: flex-start;
  }

  /* The card body is a Texuli Button rendered inside Texuli's Board, so the reset has to be
     global to reach it; scoping it under this view's own root keeps it from leaking. Unlayered
     rules win over `.tx-button` (in `@layer tx.components`): a card wraps, reads left to right
     and stays selectable instead of a centered, nowrap button label. */
  [data-board] :global(.py-board-open) {
    display: block;
    inline-size: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: start;
    white-space: normal;
    overflow-wrap: anywhere;
    user-select: text;
    align-items: stretch;
    justify-content: flex-start;
    cursor: pointer;
    font: inherit;
  }
</style>
