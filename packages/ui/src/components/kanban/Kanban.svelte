<script lang="ts" generics="T">
import { ArrowRightLeft, GripVertical } from '@lucide/svelte';
import type { Snippet } from 'svelte';
import { cn } from '../../lib/cn.ts';
import DropdownMenu from '../dropdown-menu/DropdownMenu.svelte';
import type { DropdownMenuEntry } from '../dropdown-menu/types.ts';
import type { KanbanColumn } from './types.ts';

interface Props {
  columns: KanbanColumn[];
  items: T[];
  getColumn: (item: T) => string;
  getItemId: (item: T) => string;
  /** Short human label for an item, used by the move menu and announcements. */
  getItemLabel?: (item: T) => string;
  card: Snippet<[T]>;
  /** Called when a card is dropped or moved through its menu. May be async. */
  onMove: (item: T, toColumnId: string) => void | Promise<void>;
  /** Columns the item may not enter (e.g. permission rules). */
  canMove?: (item: T, toColumnId: string) => boolean;
  emptyColumnText?: string;
  columnFooter?: Snippet<[KanbanColumn]>;
  label?: string;
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
  class: className,
}: Props = $props();

const DRAG_TYPE = 'application/x-protoyard-kanban';

// Unique per board, so two boards with the same column ids never share heading ids.
const uid = $props.id();
let draggingId = $state<string | null>(null);
let overColumn = $state<string | null>(null);
let announcement = $state('');

const grouped = $derived.by(() => {
  const map = new Map<string, T[]>();
  for (const column of columns) map.set(column.id, []);
  for (const item of items) map.get(getColumn(item))?.push(item);
  return map;
});
const dragging = $derived(
  draggingId === null ? undefined : items.find((item) => getItemId(item) === draggingId)
);

async function move(item: T, toColumnId: string): Promise<void> {
  if (getColumn(item) === toColumnId || !canMove(item, toColumnId)) return;
  const target = columns.find((column) => column.id === toColumnId);
  try {
    await onMove(item, toColumnId);
    announcement = `Moved ${getItemLabel(item)} to ${target?.title ?? toColumnId}.`;
  } catch (cause) {
    announcement = `Could not move ${getItemLabel(item)}: ${cause instanceof Error ? cause.message : 'unknown error'}.`;
  }
}

function moveMenu(item: T): DropdownMenuEntry[] {
  const current = getColumn(item);
  return [
    { type: 'label', label: 'Move to…' },
    ...columns.map((column) => ({
      label: column.title,
      disabled: column.id === current || !canMove(item, column.id),
      onSelect: () => void move(item, column.id),
    })),
  ];
}

function handleDragStart(event: DragEvent, item: T): void {
  const id = getItemId(item);
  draggingId = id;
  event.dataTransfer?.setData(DRAG_TYPE, id);
  event.dataTransfer?.setData('text/plain', getItemLabel(item));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(event: DragEvent, columnId: string): void {
  if (!dragging || !canMove(dragging, columnId)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  overColumn = columnId;
}

function handleDrop(event: DragEvent, columnId: string): void {
  event.preventDefault();
  const id = event.dataTransfer?.getData(DRAG_TYPE) || draggingId;
  const item = items.find((candidate) => getItemId(candidate) === id);
  resetDrag();
  if (item) void move(item, columnId);
}

function resetDrag(): void {
  draggingId = null;
  overColumn = null;
}
</script>

<div class={cn('relative', className)}>
  <div
    role="region"
    aria-label={label}
    class="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 sm:snap-none"
  >
    {#each columns as column (column.id)}
      {@const columnItems = grouped.get(column.id) ?? []}
      {@const headingId = `kanban-${uid}-${column.id}-heading`}
      <section
        aria-labelledby={headingId}
        class={cn(
          'flex w-[85vw] max-w-80 shrink-0 snap-start flex-col rounded-xl border border-border bg-muted/40 transition-colors sm:w-72',
          overColumn === column.id && 'border-primary bg-primary/5'
        )}
        ondragover={(event) => handleDragOver(event, column.id)}
        ondragleave={(event) => {
          if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
            if (overColumn === column.id) overColumn = null;
          }
        }}
        ondrop={(event) => handleDrop(event, column.id)}
      >
        <header class="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
          <div class="min-w-0">
            <h3 id={headingId} class="truncate text-sm font-semibold">{column.title}</h3>
            {#if column.description}
              <p class="truncate text-xs text-muted-foreground">{column.description}</p>
            {/if}
          </div>
          <span class="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
            {columnItems.length}<span class="sr-only"> items</span>
          </span>
        </header>
        <ul class="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
          {#each columnItems as item (getItemId(item))}
            {@const itemId = getItemId(item)}
            <li
              draggable="true"
              ondragstart={(event) => handleDragStart(event, item)}
              ondragend={resetDrag}
              class={cn(
                'group relative rounded-lg border border-border bg-surface p-3 text-sm shadow-soft transition-[opacity,box-shadow]',
                'hover:shadow-float',
                draggingId === itemId && 'opacity-50'
              )}
            >
              <div class="flex items-start gap-2">
                <GripVertical
                  class="mt-0.5 hidden size-4 shrink-0 cursor-grab text-muted-foreground/60 sm:block"
                  aria-hidden="true"
                />
                <div class="min-w-0 flex-1">{@render card(item)}</div>
                <DropdownMenu items={moveMenu(item)} align="end">
                  {#snippet trigger({ props })}
                    <button
                      {...props}
                      type="button"
                      class="-mt-1 -mr-1 inline-flex size-8 min-h-touch min-w-[44px] shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-h-0 sm:min-w-0"
                      aria-label={`Move ${getItemLabel(item)} to another column`}
                    >
                      <ArrowRightLeft class="size-4" aria-hidden="true" />
                    </button>
                  {/snippet}
                </DropdownMenu>
              </div>
            </li>
          {:else}
            <li
              class="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border px-3 py-6 text-xs text-muted-foreground"
            >
              {emptyColumnText}
            </li>
          {/each}
        </ul>
        {#if columnFooter}<div class="px-2 pb-2">{@render columnFooter(column)}</div>{/if}
      </section>
    {/each}
  </div>
  <p class="sr-only" aria-live="polite">{announcement}</p>
</div>
