<script lang="ts" generics="T">
import {
  Board,
  type BoardColumnDef,
  type BoardLabelOverrides,
  type BoardMove,
  placementsOf,
  rankSequence,
} from '@texuli/data/board';
import type { Snippet } from 'svelte';
import type { KanbanColumn } from './types.ts';

interface Props {
  columns: KanbanColumn[];
  items: T[];
  getColumn: (item: T) => string;
  getItemId: (item: T) => string;
  /** Short human label for an item, used by the move menu and announcements. */
  getItemLabel?: (item: T) => string;
  card: Snippet<[T]>;
  /** Called when a card is dropped or moved through its menu. May be async; a throw puts the card back. */
  onMove: (item: T, toColumnId: string) => void | Promise<void>;
  /** Columns the item may not enter (e.g. permission rules). */
  canMove?: (item: T, toColumnId: string) => boolean;
  emptyColumnText?: string;
  columnFooter?: Snippet<[KanbanColumn]>;
  label?: string;
  /** Column heading level; pick the one that follows your page outline (default 3). */
  headingLevel?: 2 | 3 | 4;
  class?: string;
}

let {
  columns,
  items,
  getColumn,
  getItemId,
  getItemLabel = (item: T) => getItemId(item),
  card,
  onMove,
  canMove = () => true,
  emptyColumnText = 'No items',
  columnFooter,
  label = 'Board',
  headingLevel = 3,
  class: className,
}: Props = $props();

/*
 * Texuli's Board orders each column by a rank. Kanban items carry none, so the
 * rank follows the order of `items`. A moved card keeps the rank Board gave it
 * while it stays in the column it was moved to, so it does not jump after the
 * host saves the new column.
 */
const baseRanks = $derived.by(() => {
  const ranks = rankSequence(items.length);
  return new Map(items.map((item, index) => [getItemId(item), ranks[index] ?? '']));
});
let movedRanks = $state<Record<string, { columnId: string; rank: string }>>({});

function getRank(item: T): string {
  const id = getItemId(item);
  const moved = movedRanks[id];
  if (moved && moved.columnId === getColumn(item)) return moved.rank;
  return baseRanks.get(id) ?? '';
}

function titleOf(columnId: string): string {
  return columns.find((column) => column.id === columnId)?.title ?? columnId;
}

/** Kanban moves between columns; the order inside a column is not the host's to save. */
function allowMove(item: T, target: { columnId: string }): boolean | string {
  if (target.columnId === getColumn(item)) {
    return `${getItemLabel(item)} is already in ${titleOf(target.columnId)}.`;
  }
  return canMove(item, target.columnId);
}

async function move(boardMove: BoardMove, item: T): Promise<void> {
  // A throw reaches Board, which puts the card back and announces it.
  await onMove(item, boardMove.columnId);
  const next = { ...movedRanks };
  for (const [id, placement] of Object.entries(placementsOf(boardMove))) {
    next[id] = { columnId: placement.columnId, rank: placement.rank };
  }
  movedRanks = next;
}

const boardColumns = $derived<BoardColumnDef[]>(
  columns.map((column) => ({ id: column.id, title: column.title }))
);
const hasDescriptions = $derived(columns.some((column) => column.description));
const labels = $derived<BoardLabelOverrides>({
  board: label,
  emptyCell: emptyColumnText,
  moveMenu: (itemLabel) => `Move ${itemLabel} to another column`,
  moveMenuLabel: (itemLabel) => `Move ${itemLabel} to…`,
});
</script>

{#snippet boardCard(item: T)}
  {@render card(item)}
{/snippet}

<!-- Board's column header has no description slot, so a column description leads the column footer. -->
{#snippet footer(column: BoardColumnDef)}
  {@const source = columns.find((candidate) => candidate.id === column.id)}
  {#if source?.description}<p class="text-xs text-muted-foreground">{source.description}</p>{/if}
  {#if source && columnFooter}{@render columnFooter(source)}{/if}
{/snippet}

<Board
  columns={boardColumns}
  {items}
  getId={getItemId}
  {getColumn}
  {getRank}
  getLabel={getItemLabel}
  card={boardCard}
  columnFooter={columnFooter || hasDescriptions ? footer : undefined}
  {headingLevel}
  onMove={move}
  canMove={allowMove}
  {labels}
  class={className}
/>
