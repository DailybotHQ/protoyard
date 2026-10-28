<script lang="ts" generics="T">
import { GripVertical, MoveRight } from '@lucide/svelte';
import { runService } from '@protoyard/renderer-svelte';
import { Button, DropdownMenu, type DropdownMenuEntry, Input, Spinner, toast } from '@protoyard/ui';
import {
  buildTree,
  type FlatNode,
  flatten,
  indent,
  moveNode,
  moveSibling,
  newSibling,
  outdent,
  type TreeMove,
  type TreeMoveResult,
  validParents,
} from '@protoyard/views/tree';
import { tick } from 'svelte';
import { cx } from 'texuli/cx';
import { LucideIcon } from 'texuli/icons/lucide';
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
 * An outline editor: one inline title per item. Enter adds a sibling,
 * Tab / Shift+Tab indent and outdent, Alt+Up / Alt+Down move among siblings,
 * and items can be dragged to a new parent or moved with "Move to…". Every
 * write goes through the prototype's services (`onCreate`, `onRename`,
 * `onMove`, `onDelete`), shows pending feedback and rolls back on failure.
 */
let {
  query,
  getId,
  getParentId,
  getRank,
  getTitle,
  onCreate,
  onRename,
  onMove,
  onDelete,
  onRetry,
  label = 'Outline',
  placeholder = 'Untitled',
  class: className,
}: {
  query: { readonly current: T[] | undefined; readonly loading: boolean; readonly error: unknown };
  getId: (item: T) => string;
  getParentId: (item: T) => string | null;
  getRank: (item: T) => string;
  getTitle: (item: T) => string;
  /** Creates an item; resolve with its id (or a row with `id`) so focus can follow it. */
  onCreate: (input: { parentId: string | null; rank: string; title: string }) => unknown;
  onRename: (item: T, title: string) => unknown;
  onMove: (move: TreeMove, item: T) => unknown;
  /** Backspace on an empty item deletes it when given. */
  onDelete?: (item: T) => unknown;
  onRetry?: () => unknown;
  label?: string;
  placeholder?: string;
  class?: string;
} = $props();

const uid = $props.id();
let overrides = $state<Record<string, TreePlacement>>({});
let pending = $state<Record<string, boolean>>({});
let drafts = $state<Record<string, string>>({});
let creating = $state(false);
let focusAfter = $state<string | null>(null);
let announcement = $state('');

const items = $derived(query.current ?? []);
const base = $derived({ id: getId, parentId: getParentId, rank: getRank });
const tree = $derived(buildTree(items, treeAccessors(base, overrides)));
const flat = $derived(flatten(tree, { expanded: 'all' }));

$effect(() => {
  const done = settledOverrides(base, items, overrides, pending);
  if (done.length === 0) return;
  const next = { ...overrides };
  for (const id of done) delete next[id];
  overrides = next;
});

// Focus a newly created item as soon as it shows up.
$effect(() => {
  const id = focusAfter;
  if (!id || !flat.some((n) => n.id === id)) return;
  focusAfter = null;
  void focusInput(id);
});

function announce(text: string) {
  announcement = text;
}

async function focusInput(id: string, caret: 'end' | 'start' = 'end') {
  await tick();
  const input = document.getElementById(`outline-${uid}-${id}`) as HTMLInputElement | null;
  if (!input) return;
  input.focus();
  const at = caret === 'end' ? input.value.length : 0;
  input.setSelectionRange(at, at);
}

function titleOf(node: FlatNode<T>): string {
  return drafts[node.id] ?? getTitle(node.item);
}

async function saveTitle(node: FlatNode<T>): Promise<void> {
  const draft = drafts[node.id];
  if (draft === undefined || draft === getTitle(node.item)) {
    if (draft !== undefined) {
      const { [node.id]: _same, ...rest } = drafts;
      drafts = rest;
    }
    return;
  }
  pending = { ...pending, [node.id]: true };
  const result = await runService(() => onRename(node.item, draft));
  const { [node.id]: _done, ...rest } = pending;
  pending = rest;
  // Success: the data now holds the title. Failure: show the saved title again.
  const { [node.id]: _draft, ...others } = drafts;
  drafts = others;
  if (!result.ok) announce('The title was not saved.');
}

async function create(after: FlatNode<T> | null) {
  if (creating) return;
  creating = true;
  const place = newSibling(tree, after?.id ?? null);
  const result = await runService(() => onCreate({ ...place, title: '' }));
  creating = false;
  if (!result.ok) return;
  const value = result.value as unknown;
  const id = typeof value === 'string' ? value : (value as { id?: unknown } | undefined)?.id;
  if (typeof id === 'string') focusAfter = id;
  announce('Item added.');
}

async function commit(move: TreeMove) {
  const item = tree.byId.get(move.id);
  if (!item) return;
  const placements = treePlacements(move);
  const previous = Object.fromEntries(Object.keys(placements).map((id) => [id, overrides[id]]));
  overrides = { ...overrides, ...placements };
  pending = { ...pending, [move.id]: true };
  void focusInput(move.id);
  const result = await runService(() => onMove(move, item));
  const { [move.id]: _done, ...rest } = pending;
  pending = rest;
  if (result.ok) return;
  const next = { ...overrides };
  for (const [id, placement] of Object.entries(previous)) {
    if (placement) next[id] = placement;
    else delete next[id];
  }
  overrides = next;
  announce(`${getTitle(item) || placeholder} was not moved; it is back where it was.`);
  void focusInput(move.id);
}

function apply(result: TreeMoveResult, quiet = false) {
  if (!result.ok) {
    announce(result.reason);
    if (!quiet) toast.error('Not moved', { description: result.reason });
    return;
  }
  if (!result.unchanged) void commit(result.move);
}

async function onKeydown(event: KeyboardEvent, node: FlatNode<T>) {
  const input = event.currentTarget as HTMLInputElement;
  const index = flat.findIndex((n) => n.id === node.id);
  if (pending[node.id] && event.key !== 'Escape') {
    if (['Enter', 'Tab'].includes(event.key) || event.altKey) event.preventDefault();
    return;
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    await saveTitle(node);
    await create(node);
  } else if (event.key === 'Tab') {
    event.preventDefault();
    await saveTitle(node);
    // Edges (first item, top level) are announced, not toasted: Tab is typed often.
    apply(event.shiftKey ? outdent(tree, node.id) : indent(tree, node.id), true);
  } else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault();
    apply(moveSibling(tree, node.id, event.key === 'ArrowUp' ? -1 : 1), true);
  } else if (event.key === 'ArrowUp' && index > 0) {
    event.preventDefault();
    void focusInput((flat[index - 1] as FlatNode<T>).id);
  } else if (event.key === 'ArrowDown' && index < flat.length - 1) {
    event.preventDefault();
    void focusInput((flat[index + 1] as FlatNode<T>).id);
  } else if (event.key === 'Escape') {
    const { [node.id]: _draft, ...rest } = drafts;
    drafts = rest;
  } else if (event.key === 'Backspace' && input.value === '' && onDelete) {
    event.preventDefault();
    const previous = flat[index - 1];
    const result = await runService(() => onDelete(node.item));
    if (result.ok && previous) void focusInput(previous.id);
  } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    event.preventDefault();
    input.closest('li')?.querySelector<HTMLButtonElement>('[data-tree-menu] button')?.click();
  }
}

function menuFor(node: FlatNode<T>): DropdownMenuEntry[] {
  const entries: DropdownMenuEntry[] = [
    { type: 'label', label: `Move ${titleOf(node) || placeholder} under` },
  ];
  for (const parent of validParents(tree, node.id)) {
    const title =
      parent.id === null ? 'Top level' : getTitle(tree.byId.get(parent.id) as T) || placeholder;
    entries.push({
      label: `${'  '.repeat(Math.max(0, parent.level - 1))}${title}`,
      disabled: parent.id === node.parentId,
      onSelect: () =>
        apply(moveNode(tree, node.id, { parentId: parent.id, index: Number.MAX_SAFE_INTEGER })),
    });
  }
  return entries;
}

// ── pointer drag (from the grip) ─────────────────────────────────────────
interface Drag {
  id: string;
  pointerId: number;
  x0: number;
  y0: number;
  active: boolean;
  over: { id: string; zone: DropZone } | null;
}
let drag = $state<Drag | null>(null);

function onGripDown(event: PointerEvent, node: FlatNode<T>) {
  if (event.button !== 0 || pending[node.id]) return;
  event.preventDefault();
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
    ?.closest<HTMLElement>(`[data-outline="${uid}"] [data-tree-row]`);
  const rect = row?.getBoundingClientRect();
  const over =
    row && rect
      ? {
          id: row.dataset.treeRow as string,
          zone: dropZone(rect.top, rect.height || 32, event.clientY),
        }
      : drag.over;
  drag = { ...drag, active: true, over };
}

function onPointerUp(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const finished = drag;
  drag = null;
  if (finished.active && finished.over && finished.over.id !== finished.id) {
    apply(dropMove(tree, finished.id, finished.over.id, finished.over.zone));
  }
}
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} onpointercancel={() => (drag = null)} />

<div class={cx('relative', className)} data-outline={uid}>
  <QueryState {query} label={`Loading ${label.toLowerCase()}`} isEmpty={() => false} onRetry={onRetry ? () => { void onRetry(); } : undefined}>
    {#snippet children()}
      <ul aria-label={label} aria-describedby={`outline-${uid}-keys`} class="space-y-0.5">
        {#each flat as node (node.id)}
          {@const over = drag?.active && drag.over?.id === node.id ? drag.over.zone : null}
          <li
            data-tree-row={node.id}
            class={cx(
              'group flex items-center gap-1 rounded-md pr-1',
              drag?.active && drag.id === node.id && 'opacity-40',
              over === 'inside' && 'bg-primary/10 ring-1 ring-primary',
              over === 'before' && 'shadow-[inset_0_2px_0_0_var(--tx-primary)]',
              over === 'after' && 'shadow-[inset_0_-2px_0_0_var(--tx-primary)]'
            )}
            style:padding-left={`${(node.level - 1) * 1.5}rem`}
          >
            <span
              data-drag-handle
              role="presentation"
              class="inline-flex cursor-grab touch-none text-muted-foreground/60 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100"
              onpointerdown={(event) => onGripDown(event, node)}
            >
              <LucideIcon icon={GripVertical} class="size-4"  />
            </span>
            <span class="text-muted-foreground">•</span>
            <Input
              id={`outline-${uid}-${node.id}`}
              value={titleOf(node)}
              {placeholder}
              aria-label={`${titleOf(node) || placeholder}, level ${node.level}`}
              aria-busy={pending[node.id] || undefined}
              class="min-w-0 flex-1 rounded bg-transparent px-1 py-1 text-sm outline-none focus-visible:bg-muted/60"
              oninput={(event) => (drafts = { ...drafts, [node.id]: (event.currentTarget as HTMLInputElement).value })}
              onblur={() => saveTitle(node)}
              onkeydown={(event) => onKeydown(event, node)}
            />
            {#if pending[node.id]}<Spinner class="size-3.5 shrink-0" /><span class="sr-only">Saving</span>{/if}
            <span data-tree-menu class="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">
              <DropdownMenu items={menuFor(node)} align="end">
                {#snippet trigger({ props })}
                  <Button
                    {...props}
                    type="button"
                    tabindex={-1}
                    disabled={pending[node.id]}
                    aria-label={`Move ${titleOf(node) || placeholder} to…`}
                    class="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <LucideIcon icon={MoveRight} class="size-3.5"  />
                  </Button>
                {/snippet}
              </DropdownMenu>
            </span>
          </li>
        {/each}
      </ul>
      {#if flat.length === 0}
        <Button
          type="button"
          class="mt-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          disabled={creating}
          aria-busy={creating || undefined}
          onclick={() => create(null)}
        >
          + Add the first item
        </Button>
      {/if}
    {/snippet}
  </QueryState>
  <p id={`outline-${uid}-keys`} class="sr-only">
    Enter adds an item, Tab and Shift+Tab indent and outdent, Alt with Up or Down moves an item, Shift+F10 opens Move to{onDelete ? ', Backspace on an empty item deletes it' : ''}.
  </p>
  <p class="sr-only" aria-live="polite">{announcement}</p>
</div>
