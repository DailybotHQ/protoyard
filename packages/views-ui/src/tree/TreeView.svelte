<script lang="ts" generics="T">
import { ChevronRight, GripVertical, MoveRight } from '@lucide/svelte';
import { runService } from '@protoyard/renderer-svelte';
import { cn, DropdownMenu, type DropdownMenuEntry, Spinner, toast } from '@protoyard/ui';
import { createAxis, windowAxis } from '@protoyard/views/grid';
import {
  buildTree,
  type FlatNode,
  flatten,
  moveNode,
  type TreeMove,
  validParents,
} from '@protoyard/views/tree';
import { type Snippet, tick } from 'svelte';
import QueryState from '../states/QueryState.svelte';
import {
  type DropZone,
  dropMove,
  dropZone,
  settledOverrides,
  TREE_DRAG_THRESHOLD_PX,
  type TreePlacement,
  treeAccessors,
  treePlacements,
} from './model.ts';

/**
 * An ARIA tree over `{ id, parentId, rank }` rows: arrows, Home/End, `*`,
 * typeahead, lazy children, virtualization for big trees, drag-to-reparent
 * and a "Move to…" menu. Moves go through `onMove` (the prototype's service),
 * show at once, and roll back when they fail.
 */
let {
  query,
  getId,
  getParentId,
  getRank,
  getLabel,
  item: itemSnippet,
  hasChildren,
  loadChildren,
  expanded = $bindable([]),
  selected = $bindable(null),
  onSelect,
  onMove,
  onRetry,
  label = 'Tree',
  emptyTitle = 'Nothing here yet',
  virtualizeAbove = 500,
  rowHeight = 32,
  height = '24rem',
  class: className,
}: {
  query: { readonly current: T[] | undefined; readonly loading: boolean; readonly error: unknown };
  getId: (item: T) => string;
  getParentId: (item: T) => string | null;
  getRank: (item: T) => string;
  getLabel: (item: T) => string;
  /** Row content (default: the label). */
  item?: Snippet<[T, { pending: boolean }]>;
  /** For lazy trees: whether a node has children that may not be loaded yet. */
  hasChildren?: (item: T) => boolean;
  /** Loads a node's children (they arrive through `query`); runs on first expand. */
  loadChildren?: (item: T) => unknown;
  /** Open node ids (bindable). */
  expanded?: string[];
  selected?: string | null;
  onSelect?: (item: T) => void;
  /** Persists a move; omit for a read-only tree (no drag, no menu). */
  onMove?: (move: TreeMove, item: T) => unknown;
  onRetry?: () => void | Promise<void>;
  label?: string;
  emptyTitle?: string;
  /** Rows above this count are virtualized (default 500). */
  virtualizeAbove?: number;
  rowHeight?: number;
  /** Height of the scroll area when virtualized. */
  height?: string;
  class?: string;
} = $props();

const uid = $props.id();
let overrides = $state<Record<string, TreePlacement>>({});
let pending = $state<Record<string, boolean>>({});
let loading = $state<Record<string, boolean>>({});
let loaded = $state<Record<string, boolean>>({});
let focusId = $state<string | null>(null);
let announcement = $state('');
let scroller = $state<HTMLDivElement>();
let scrollTop = $state(0);
let viewport = $state(0);

const items = $derived(query.current ?? []);
const base = $derived({ id: getId, parentId: getParentId, rank: getRank });
const tree = $derived(buildTree(items, treeAccessors(base, overrides)));
const open = $derived(new Set(expanded));
const flat = $derived(flatten(tree, { expanded: open, ...(hasChildren ? { hasChildren } : {}) }));
const virtual = $derived(flat.length > virtualizeAbove);
const axis = $derived(createAxis({ count: flat.length, size: rowHeight }));
const windowed = $derived(virtual ? windowAxis(axis, scrollTop, viewport || 400, 8) : null);
const rows = $derived(windowed ? flat.slice(windowed.start, windowed.end) : flat);
const activeId = $derived(
  focusId && flat.some((n) => n.id === focusId) ? focusId : (flat[0]?.id ?? null)
);

$effect(() => {
  const done = settledOverrides(base, items, overrides, pending);
  if (done.length === 0) return;
  const next = { ...overrides };
  for (const id of done) delete next[id];
  overrides = next;
});

function announce(text: string) {
  announcement = text;
}

async function focusNode(id: string) {
  focusId = id;
  const index = flat.findIndex((n) => n.id === id);
  if (virtual && scroller && index >= 0) {
    const top = index * rowHeight;
    if (top < scroller.scrollTop) scroller.scrollTop = top;
    else if (top + rowHeight > scroller.scrollTop + scroller.clientHeight)
      scroller.scrollTop = top + rowHeight - scroller.clientHeight;
    scrollTop = scroller.scrollTop;
  }
  await tick();
  document.getElementById(`tree-${uid}-${id}`)?.focus();
}

async function setOpen(node: FlatNode<T>, next: boolean) {
  if (!node.hasChildren || node.expanded === next) return;
  expanded = next ? [...expanded, node.id] : expanded.filter((id) => id !== node.id);
  const known = (tree.children.get(node.id)?.length ?? 0) > 0;
  if (next && loadChildren && !known && !loaded[node.id]) {
    loading = { ...loading, [node.id]: true };
    const result = await runService(() => loadChildren(node.item));
    const { [node.id]: _done, ...rest } = loading;
    loading = rest;
    if (result.ok) loaded = { ...loaded, [node.id]: true };
  }
}

function select(node: FlatNode<T>) {
  selected = node.id;
  onSelect?.(node.item);
}

// ── keyboard (roving focus) ──────────────────────────────────────────────
let typed = '';
let typedAt = 0;
async function onKeydown(event: KeyboardEvent, node: FlatNode<T>) {
  const index = flat.findIndex((n) => n.id === node.id);
  const go = (to: FlatNode<T> | undefined) => {
    if (!to) return;
    event.preventDefault();
    void focusNode(to.id);
  };
  // The context-menu keys open "Move to…" (the keyboard alternative to dragging).
  if (onMove && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
    event.preventDefault();
    (event.currentTarget as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-tree-menu] button')
      ?.click();
    return;
  }
  switch (event.key) {
    case 'ArrowDown':
      return go(flat[index + 1]);
    case 'ArrowUp':
      return go(flat[index - 1]);
    case 'Home':
      return go(flat[0]);
    case 'End':
      return go(flat[flat.length - 1]);
    case 'ArrowRight':
      event.preventDefault();
      if (node.hasChildren && !node.expanded) return void setOpen(node, true);
      if (node.expanded) return go(flat[index + 1]);
      return;
    case 'ArrowLeft':
      event.preventDefault();
      if (node.expanded) return void setOpen(node, false);
      return go(flat.find((n) => n.id === node.parentId));
    case 'Enter':
    case ' ':
      event.preventDefault();
      return select(node);
    case '*': {
      event.preventDefault();
      const siblings = flat.filter(
        (n) => n.parentId === node.parentId && n.hasChildren && !n.expanded
      );
      for (const sibling of siblings) await setOpen(sibling, true);
      return;
    }
  }
  // Typeahead: printable keys jump to the next row whose label starts with what was typed.
  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const now = event.timeStamp;
    typed = now - typedAt > 500 ? event.key.toLowerCase() : typed + event.key.toLowerCase();
    typedAt = now;
    const order = [
      ...flat.slice(index + (typed.length === 1 ? 1 : 0)),
      ...flat.slice(0, index + 1),
    ];
    const match = order.find((n) => getLabel(n.item).toLowerCase().startsWith(typed));
    if (match) go(match);
  }
}

// ── moves ────────────────────────────────────────────────────────────────
async function commit(move: TreeMove) {
  const item = tree.byId.get(move.id);
  if (!item || !onMove) return;
  const placements = treePlacements(move);
  const previous = Object.fromEntries(Object.keys(placements).map((id) => [id, overrides[id]]));
  overrides = { ...overrides, ...placements };
  pending = { ...pending, [move.id]: true };
  // Keep the moved node in view: open its new parent.
  if (move.parentId && !open.has(move.parentId)) expanded = [...expanded, move.parentId];
  const parentLabel = move.parentId ? getLabel(tree.byId.get(move.parentId) as T) : 'the top level';
  announce(`Moving ${getLabel(item)} to ${parentLabel}…`);
  const result = await runService(() => onMove(move, item));
  const { [move.id]: _done, ...rest } = pending;
  pending = rest;
  if (result.ok) {
    announce(`Moved ${getLabel(item)} to ${parentLabel}.`);
    return;
  }
  const next = { ...overrides };
  for (const [id, placement] of Object.entries(previous)) {
    if (placement) next[id] = placement;
    else delete next[id];
  }
  overrides = next;
  announce(`${getLabel(item)} was not moved; it is back where it was.`);
}

function apply(result: ReturnType<typeof moveNode>) {
  if (!result.ok) {
    announce(result.reason);
    toast.error('Not moved', { description: result.reason });
    return;
  }
  if (!result.unchanged) void commit(result.move);
}

function menuFor(node: FlatNode<T>): DropdownMenuEntry[] {
  const entries: DropdownMenuEntry[] = [{ type: 'label', label: `Move ${getLabel(node.item)} to` }];
  for (const parent of validParents(tree, node.id)) {
    const title = parent.id === null ? 'Top level' : getLabel(tree.byId.get(parent.id) as T);
    entries.push({
      label: `${'  '.repeat(Math.max(0, parent.level - 1))}${title}`,
      disabled: parent.id === node.parentId,
      onSelect: () =>
        apply(moveNode(tree, node.id, { parentId: parent.id, index: Number.MAX_SAFE_INTEGER })),
    });
  }
  return entries;
}

// ── pointer drag ─────────────────────────────────────────────────────────
interface Drag {
  id: string;
  pointerId: number;
  x0: number;
  y0: number;
  active: boolean;
  over: { id: string; zone: DropZone } | null;
}
let drag = $state<Drag | null>(null);
let suppressClick = false;

function onPointerDown(event: PointerEvent, node: FlatNode<T>) {
  if (!onMove || event.button !== 0 || pending[node.id]) return;
  const target = event.target as Element;
  if (target.closest('[data-tree-menu],[data-tree-toggle]')) return;
  if (event.pointerType === 'touch' && !target.closest('[data-drag-handle]')) return;
  drag = {
    id: node.id,
    pointerId: event.pointerId,
    x0: event.clientX,
    y0: event.clientY,
    active: false,
    over: null,
  };
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (
    !drag.active &&
    Math.hypot(event.clientX - drag.x0, event.clientY - drag.y0) < TREE_DRAG_THRESHOLD_PX
  )
    return;
  const row = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest<HTMLElement>(`[data-tree="${uid}"] [data-tree-row]`);
  const rect = row?.getBoundingClientRect();
  const over =
    row && rect
      ? {
          id: row.dataset.treeRow as string,
          zone: dropZone(rect.top, rect.height || rowHeight, event.clientY),
        }
      : drag.over;
  drag = { ...drag, active: true, over };
}

function onPointerUp(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const finished = drag;
  drag = null;
  if (!finished.active) return;
  suppressClick = true;
  setTimeout(() => {
    suppressClick = false;
  }, 0);
  if (finished.over && finished.over.id !== finished.id)
    apply(dropMove(tree, finished.id, finished.over.id, finished.over.zone));
}

function onRowClick(node: FlatNode<T>) {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  focusId = node.id;
  select(node);
}
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} onpointercancel={() => (drag = null)} />

<div class={cn('relative', className)} data-tree={uid}>
  <QueryState {query} label={`Loading ${label.toLowerCase()}`} {emptyTitle} {onRetry}>
    {#snippet children()}
      <div
        bind:this={scroller}
        bind:clientHeight={viewport}
        class={cn(virtual && 'overflow-y-auto')}
        style:height={virtual ? height : undefined}
        onscroll={() => (scrollTop = scroller?.scrollTop ?? 0)}
      >
        <ul role="tree" aria-label={label} aria-describedby={`tree-${uid}-keys`} class="py-1" style:padding-top={windowed ? `${windowed.start * rowHeight}px` : undefined} style:padding-bottom={windowed ? `${(flat.length - windowed.end) * rowHeight}px` : undefined}>
          {#each rows as node (node.id)}
            {@const over = drag?.active && drag.over?.id === node.id ? drag.over.zone : null}
            {@const busy = pending[node.id] || loading[node.id]}
            <li
              id={`tree-${uid}-${node.id}`}
              role="treeitem"
              data-tree-row={node.id}
              aria-level={node.level}
              aria-posinset={node.position}
              aria-setsize={node.siblings}
              aria-expanded={node.hasChildren ? node.expanded : undefined}
              aria-selected={selected === node.id}
              aria-busy={busy || undefined}
              tabindex={activeId === node.id ? 0 : -1}
              class={cn(
                'group relative flex cursor-pointer items-center gap-1 rounded-md pr-1 text-sm outline-none select-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                selected === node.id && 'bg-muted font-medium',
                drag?.active && drag.id === node.id && 'opacity-40',
                over === 'inside' && 'bg-primary/10 ring-1 ring-primary',
                over === 'before' && 'shadow-[inset_0_2px_0_0_var(--py-primary)]',
                over === 'after' && 'shadow-[inset_0_-2px_0_0_var(--py-primary)]'
              )}
              style:height={`${rowHeight}px`}
              style:padding-left={`${(node.level - 1) * 1.25 + 0.25}rem`}
              onclick={() => onRowClick(node)}
              onkeydown={(event) => onKeydown(event, node)}
              onpointerdown={(event) => onPointerDown(event, node)}
            >
              <span
                data-tree-toggle
                aria-hidden="true"
                class={cn('inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground', !node.hasChildren && 'invisible')}
                onclick={(event) => {
                  event.stopPropagation();
                  void setOpen(node, !node.expanded);
                }}
                role="presentation"
              >
                <ChevronRight class={cn('size-4 motion-safe:transition-transform', node.expanded && 'rotate-90')} />
              </span>
              {#if onMove}
                <span data-drag-handle class="hidden cursor-grab touch-none text-muted-foreground/60 group-hover:inline-flex group-focus-visible:inline-flex pointer-coarse:inline-flex" aria-hidden="true">
                  <GripVertical class="size-3.5" />
                </span>
              {/if}
              <span class="min-w-0 flex-1 truncate">
                {#if itemSnippet}{@render itemSnippet(node.item, { pending: !!pending[node.id] })}{:else}{getLabel(node.item)}{/if}
              </span>
              {#if busy}<Spinner class="size-3.5 shrink-0" /><span class="sr-only">{loading[node.id] ? 'Loading' : 'Saving'}</span>{/if}
              {#if onMove}
                <span data-tree-menu class="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
                  <DropdownMenu items={menuFor(node)} align="end">
                    {#snippet trigger({ props })}
                      <button
                        {...props}
                        type="button"
                        tabindex="-1"
                        disabled={pending[node.id]}
                        aria-label={`Move ${getLabel(node.item)} to…`}
                        class="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <MoveRight class="size-3.5" aria-hidden="true" />
                      </button>
                    {/snippet}
                  </DropdownMenu>
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/snippet}
  </QueryState>
  <p id={`tree-${uid}-keys`} class="sr-only">
    Arrow keys move and open or close items, Home and End jump, star opens all siblings, typing jumps to a name{onMove ? ', and Shift+F10 opens Move to' : ''}.
  </p>
  <p class="sr-only" aria-live="polite">{announcement}</p>
</div>
