<script lang="ts" generics="T">
import {
  Board,
  type BoardColumnDef,
  type BoardLabelOverrides,
  type BoardMove,
} from '@texuli/data/board';
import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
import { useMessages } from 'texuli/i18n';
import type { KanbanColumn } from './types.ts';

interface OwnProps {
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
  /** The board's root element (bindable). */
  ref?: HTMLElement | null;
}

/** Extra attributes (`data-*`, `id`, handlers) land on the board's root (Texuli's contract). */
type Props = OwnProps & Omit<HTMLAttributes<HTMLElement>, keyof OwnProps | 'children'>;

let {
  columns,
  items,
  getColumn,
  getItemId,
  getItemLabel = (item: T) => getItemId(item),
  card,
  onMove,
  canMove = () => true,
  emptyColumnText: emptyColumnTextProp,
  columnFooter,
  label: labelProp,
  headingLevel = 3,
  class: className,
  ref = $bindable(null),
  ...rest
}: Props = $props();

// Labels resolve through Texuli's dictionary (mountPrototype({ i18n })); props still win.
const messages = useMessages();
const emptyColumnText = $derived(
  emptyColumnTextProp ?? messages('protoyard.ui.kanban.empty-column-text', 'No items')
);
const label = $derived(labelProp ?? messages('protoyard.ui.kanban.label', 'Board'));

function titleOf(columnId: string): string {
  return columns.find((column) => column.id === columnId)?.title ?? columnId;
}

/** Kanban moves between columns; the order inside a column is not the host's to save. */
function allowMove(item: T, target: { columnId: string }): boolean | string {
  if (target.columnId === getColumn(item)) {
    return messages('protoyard.ui.kanban.already-in', '{item} is already in {column}.', {
      item: getItemLabel(item),
      column: titleOf(target.columnId),
    });
  }
  return canMove(item, target.columnId);
}

/*
 * No `getRank`: Texuli's Board runs column-only, so cards keep the order of
 * `items` and only move between columns. A throw from `onMove` reaches Board,
 * which puts the card back and announces it.
 */
async function move(boardMove: BoardMove, item: T): Promise<void> {
  await onMove(item, boardMove.columnId);
}

const boardColumns = $derived<BoardColumnDef[]>(
  columns.map((column) => ({
    id: column.id,
    title: column.title,
    ...(column.description ? { description: column.description } : {}),
  }))
);
const labels = $derived<BoardLabelOverrides>({
  board: label,
  emptyCell: emptyColumnText,
  moveMenu: (itemLabel) =>
    messages('protoyard.ui.kanban.move-menu', 'Move {item} to another column', { item: itemLabel }),
  moveMenuLabel: (itemLabel) =>
    messages('protoyard.ui.kanban.move-menu-label', 'Move {item} to…', { item: itemLabel }),
});
</script>

{#snippet boardCard(item: T)}
  {@render card(item)}
{/snippet}

<!-- columnFooter receives the caller's column (Board's description sits in its column header). -->
{#snippet footer(column: BoardColumnDef)}
  {@const source = columns.find((candidate) => candidate.id === column.id)}
  {#if source && columnFooter}{@render columnFooter(source)}{/if}
{/snippet}

<Board
  columns={boardColumns}
  {items}
  getId={getItemId}
  {getColumn}
  getLabel={getItemLabel}
  card={boardCard}
  columnFooter={columnFooter ? footer : undefined}
  {headingLevel}
  onMove={move}
  canMove={allowMove}
  {labels}
  class={className}
  {...rest as Record<string, unknown>}
  bind:ref
/>
