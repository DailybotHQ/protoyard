<script lang="ts" generics="T">
import { ArrowRightLeft, ChevronDown, GripVertical } from '@lucide/svelte';
import { runService } from '@protoyard/renderer-svelte';
import { cn, DropdownMenu, type DropdownMenuEntry, Spinner, toast } from '@protoyard/ui';
import {
  type BoardColumnDef,
  type BoardLaneDef,
  type BoardMove,
  type BoardOptions,
  evaluateWip,
  groupBoard,
  IDLE,
  type KeyboardMoveState,
  type MoveRules,
  type MoveTarget,
  moveIntent,
  pickUp,
  validateMove,
} from '@protoyard/views/board';
import { type Snippet, tick } from 'svelte';
import QueryState from '../states/QueryState.svelte';
import {
  autoScrollDelta,
  DRAG_THRESHOLD_PX,
  indexFromPointer,
  type Placement,
  placementsOf,
  settled,
  withOverrides,
} from './model.ts';

/**
 * A kanban board over the `@protoyard/views/board` engine: columns × optional
 * swimlanes, ranks, WIP limits, pointer drag (mouse, pen, and touch from the
 * grip), keyboard drag, and a "Move to…" menu. Moves show at once, wait for
 * `onMove` (the prototype's service call) with a spinner on the card, and roll
 * back when it fails. Nothing here writes data.
 */
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
  /** A `liveQuery` of the items on the board. */
  query: { readonly current: T[] | undefined; readonly loading: boolean; readonly error: unknown };
  columns: readonly BoardColumnDef[];
  /** Swimlanes (rows); omit for a board without lanes. */
  lanes?: readonly BoardLaneDef[];
  getId: (item: T) => string;
  getColumn: (item: T) => string;
  getLane?: (item: T) => string;
  getRank: (item: T) => string;
  /** Short name for menus and announcements. */
  getLabel: (item: T) => string;
  /** The card's content (use inline content: it renders inside the card control). */
  card: Snippet<[T, { pending: boolean }]>;
  /**
   * Persists a move (column, lane, rank and any `rerank` rows) through the
   * prototype's service. Return its promise: it drives the spinner and the
   * rollback. Hard WIP limits must be enforced there too.
   */
  onMove: (move: BoardMove, item: T) => unknown;
  /** Opens a card (click, or Enter while it has focus). */
  onOpen?: (item: T) => void;
  /** Extra rule: `false` or a reason string rejects a target (permissions…). */
  canMove?: MoveRules<T>['canMove'];
  onRetry?: () => void | Promise<void>;
  label?: string;
  emptyColumnText?: string;
  class?: string;
} = $props();

const uid = $props.id();
const instructionsId = `board-${uid}-instructions`;
let overrides = $state<Record<string, Placement>>({});
let pending = $state<Record<string, boolean>>({});
let held = $state<KeyboardMoveState>(IDLE);
let announcement = $state('');
let collapsed = $state<Record<string, boolean>>({});
let scroller = $state<HTMLDivElement>();

interface Drag {
  id: string;
  pointerId: number;
  x0: number;
  y0: number;
  active: boolean;
  target: MoveTarget | null;
  scroll: number;
}
let drag = $state<Drag | null>(null);
let suppressClick = false;

const items = $derived(query.current ?? []);
const options = $derived<BoardOptions<T>>({
  columns,
  ...(lanes?.length ? { lanes, lane: (item: T) => getLane?.(item) ?? '' } : {}),
  id: getId,
  column: getColumn,
  rank: getRank,
  label: getLabel,
});
const rules = $derived<MoveRules<T>>(canMove ? { canMove } : {});
const grid = $derived(groupBoard(items, withOverrides(options, overrides)));

// While a card is held with the keyboard, show it where it would land.
const shown = $derived.by(() => {
  if (held.mode !== 'held') return grid;
  const column = grid.columns[held.target.columnIndex];
  const lane = grid.lanes[held.target.laneIndex];
  if (!column || !lane) return grid;
  const preview = validateMove(
    grid,
    held.itemId,
    { columnId: column.id, laneId: lane.id, index: held.target.index },
    rules
  );
  if (!preview.ok || preview.unchanged) return grid;
  return groupBoard(items, withOverrides(options, { ...overrides, ...placementsOf(preview.move) }));
});

const dropCheck = $derived(
  drag?.active && drag.target ? validateMove(grid, drag.id, drag.target, rules) : null
);

// Once the data shows an item where its override put it, the override can go.
$effect(() => {
  const ids = Object.keys(overrides).filter((id) => !pending[id]);
  if (ids.length === 0) return;
  const byId = new Map(items.map((item) => [getId(item), item]));
  const done = ids.filter((id) => {
    const item = byId.get(id);
    return !item || settled(options, item, overrides[id] as Placement);
  });
  if (done.length === 0) return;
  const next = { ...overrides };
  for (const id of done) delete next[id];
  overrides = next;
});

function announce(text: string | undefined) {
  if (text) announcement = text;
}

function itemById(id: string): T | undefined {
  return items.find((item) => getId(item) === id);
}

async function focusCard(id: string) {
  await tick();
  document
    .querySelector<HTMLElement>(
      `[data-board="${uid}"] [data-card-id="${CSS.escape(id)}"] [data-card-control]`
    )
    ?.focus();
}

async function commit(move: BoardMove) {
  const item = itemById(move.itemId);
  if (!item) return;
  const placements = placementsOf(move);
  const previous = Object.fromEntries(Object.keys(placements).map((id) => [id, overrides[id]]));
  overrides = { ...overrides, ...placements };
  pending = { ...pending, [move.itemId]: true };
  const result = await runService(() => onMove(move, item));
  const { [move.itemId]: _done, ...rest } = pending;
  pending = rest;
  if (!result.ok) {
    const next = { ...overrides };
    for (const [id, placement] of Object.entries(previous)) {
      if (placement) next[id] = placement;
      else delete next[id];
    }
    overrides = next;
    announce(`${getLabel(item)} was not moved; it is back where it was.`);
  }
}

function moveTo(item: T, target: MoveTarget) {
  const result = validateMove(grid, getId(item), target, rules);
  if (!result.ok) {
    announce(result.reason);
    toast.error('Card not moved', { description: result.reason });
    return;
  }
  if (result.unchanged) return;
  const column = columns.find((c) => c.id === result.move.columnId);
  announce(
    `Moved ${getLabel(item)} to ${column?.title ?? result.move.columnId}.${result.wip.status !== 'ok' ? ` ${result.wip.reason}` : ''}`
  );
  void commit(result.move);
}

// ── keyboard ────────────────────────────────────────────────────────────
async function onCardKey(event: KeyboardEvent, item: T) {
  const id = getId(item);
  if (pending[id]) return;
  if (held.mode !== 'held') {
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      const result = pickUp(grid, id);
      held = result.state;
      announce(result.announcement);
    } else if (event.key === 'Enter' && onOpen) {
      event.preventDefault();
      onOpen(item);
    }
    return;
  }
  if (held.itemId !== id) return;
  const result = moveIntent(grid, held, { key: event.key, shiftKey: event.shiftKey }, rules);
  if (!result.handled) return;
  event.preventDefault();
  held = result.state;
  announce(result.announcement);
  if (result.commit) void commit(result.commit);
  await focusCard(id);
}

// ── pointer ─────────────────────────────────────────────────────────────
function onPointerDown(event: PointerEvent, item: T) {
  const id = getId(item);
  if (event.button !== 0 || pending[id] || held.mode === 'held') return;
  const target = event.target as Element;
  if (target.closest('[data-card-menu]')) return;
  // Touch drags start from the grip only, so swiping the board still scrolls it.
  if (event.pointerType === 'touch' && !target.closest('[data-drag-handle]')) return;
  drag = {
    id,
    pointerId: event.pointerId,
    x0: event.clientX,
    y0: event.clientY,
    active: false,
    target: null,
    scroll: 0,
  };
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}

function targetAt(x: number, y: number, id: string): MoveTarget | null {
  const cell = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>(`[data-board="${uid}"] [data-board-cell]`);
  if (!cell) return drag?.target ?? null;
  const middles = [...cell.querySelectorAll<HTMLElement>('[data-card-id]')]
    .filter((el) => el.dataset.cardId !== id)
    .map((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });
  return {
    columnId: cell.dataset.column as string,
    laneId: cell.dataset.lane as string,
    index: indexFromPointer(middles, y),
  };
}

function onPointerMove(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (
    !drag.active &&
    Math.hypot(event.clientX - drag.x0, event.clientY - drag.y0) < DRAG_THRESHOLD_PX
  )
    return;
  if (!drag.active) {
    const item = itemById(drag.id);
    if (item) announce(`Dragging ${getLabel(item)}.`);
  }
  const rect = scroller?.getBoundingClientRect();
  drag = {
    ...drag,
    active: true,
    target: targetAt(event.clientX, event.clientY, drag.id),
    scroll: rect ? autoScrollDelta(event.clientX, rect.left, rect.right) : 0,
  };
  if (drag.scroll !== 0) autoScroll();
}

let scrolling = false;
function autoScroll() {
  if (scrolling) return;
  scrolling = true;
  const step = () => {
    if (!drag?.active || drag.scroll === 0 || !scroller) {
      scrolling = false;
      return;
    }
    scroller.scrollLeft += drag.scroll;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function onPointerUp(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const finished = drag;
  drag = null;
  if (!finished.active) return;
  // The click that ends this gesture is not an "open". It arrives in the same
  // task as pointerup (if at all: the card may have moved), so clear the flag
  // right after, or it would swallow the next real click.
  suppressClick = true;
  setTimeout(() => {
    suppressClick = false;
  }, 0);
  const item = itemById(finished.id);
  if (item && finished.target) moveTo(item, finished.target);
}

function onClick(item: T) {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  onOpen?.(item);
}

// ── menu ────────────────────────────────────────────────────────────────
function menuFor(item: T): DropdownMenuEntry[] {
  const id = getId(item);
  const at = grid.positions.get(id);
  const laneId = at ? (grid.lanes[at.laneIndex]?.id ?? '') : '';
  const entries: DropdownMenuEntry[] = [{ type: 'label', label: 'Move to column' }];
  for (const column of columns) {
    const check = validateMove(
      grid,
      id,
      { columnId: column.id, laneId, index: Number.MAX_SAFE_INTEGER },
      rules
    );
    entries.push({
      label: column.title,
      disabled: !check.ok || (at !== undefined && grid.columns[at.columnIndex]?.id === column.id),
      onSelect: () => moveTo(item, { columnId: column.id, laneId, index: Number.MAX_SAFE_INTEGER }),
    });
  }
  if ((lanes?.length ?? 0) > 1 && at) {
    const columnId = grid.columns[at.columnIndex]?.id ?? '';
    entries.push({ type: 'separator' }, { type: 'label', label: 'Move to lane' });
    for (const lane of lanes ?? []) {
      entries.push({
        label: lane.title,
        disabled: lane.id === laneId,
        onSelect: () => moveTo(item, { columnId, laneId: lane.id, index: Number.MAX_SAFE_INTEGER }),
      });
    }
  }
  return entries;
}

const template = $derived(`repeat(${columns.length}, minmax(var(--board-column), 1fr))`);
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} onpointercancel={() => (drag = null)} />

<div class={cn('relative', className)} data-board={uid}>
  <QueryState {query} label={`Loading ${label.toLowerCase()}`} isEmpty={() => false} {onRetry}>
    {#snippet children()}
      <div
        bind:this={scroller}
        role="region"
        aria-label={label}
        class="snap-x snap-mandatory overflow-x-auto pb-3 [--board-column:85vw] sm:snap-none sm:[--board-column:15rem]"
      >
        <div class="grid min-w-full gap-3" style:grid-template-columns={template}>
          {#each grid.columns as column (column.id)}
            {@const count = grid.columnCounts.get(column.id) ?? 0}
            {@const wip = evaluateWip(column, count)}
            <div class="flex snap-start items-center justify-between gap-2 px-1" data-column-header={column.id}>
              <h3 class="truncate text-sm font-semibold">{column.title}</h3>
              <span
                class={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
                  wip.status === 'blocked' ? 'bg-destructive/15 text-destructive' : wip.status === 'warn' ? 'bg-warning/20 text-foreground' : 'bg-muted text-muted-foreground'
                )}
                title={wip.reason}
              >
                {column.wip?.hard !== undefined ? `${count} / ${column.wip.hard}` : count}
                <span class="sr-only">cards{wip.reason ? `. ${wip.reason}` : ''}</span>
              </span>
            </div>
          {/each}
        </div>

        {#each shown.lanes as lane, laneIndex (lane.id)}
          {@const laneCards = shown.cells[laneIndex]?.reduce((sum, cell) => sum + cell.items.length, 0) ?? 0}
          {#if shown.lanes.length > 1}
            <button
              type="button"
              class="mt-4 mb-2 flex items-center gap-2 rounded-md px-1 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-expanded={!collapsed[lane.id]}
              aria-controls={`board-${uid}-lane-${laneIndex}`}
              onclick={() => (collapsed = { ...collapsed, [lane.id]: !collapsed[lane.id] })}
            >
              <ChevronDown class={cn('size-4 motion-safe:transition-transform', collapsed[lane.id] && '-rotate-90')} aria-hidden="true" />
              {lane.title}
              <span class="text-xs text-muted-foreground tabular-nums">{laneCards}</span>
            </button>
          {/if}
          {#if !collapsed[lane.id]}
            <div id={`board-${uid}-lane-${laneIndex}`} class="mt-2 grid min-w-full gap-3" style:grid-template-columns={template}>
              {#each shown.cells[laneIndex] ?? [] as cell, columnIndex (cell.columnId)}
                {@const column = shown.columns[columnIndex] as BoardColumnDef}
                {@const isTarget = drag?.active && drag.target?.columnId === cell.columnId && drag.target?.laneId === cell.laneId}
                {@const visible = cell.items.filter((item) => !(drag?.active && isTarget && getId(item) === drag.id))}
                <ul
                  data-board-cell
                  data-column={cell.columnId}
                  data-lane={cell.laneId}
                  aria-label={shown.lanes.length > 1 ? `${column.title}, ${lane.title}` : column.title}
                  class={cn(
                    'flex min-h-24 snap-start flex-col gap-2 rounded-xl border border-border bg-muted/40 p-2 motion-safe:transition-colors',
                    isTarget && (dropCheck?.ok === false ? 'border-destructive bg-destructive/5' : 'border-primary bg-primary/5')
                  )}
                >
                  {#each visible as item, index (getId(item))}
                    {@const id = getId(item)}
                    {#if isTarget && drag?.target?.index === index}
                      <li class="h-12 rounded-lg border-2 border-dashed border-primary/60" aria-hidden="true" data-board-placeholder></li>
                    {/if}
                    <li data-card-id={id} class={cn('relative', drag?.active && drag.id === id && 'opacity-40')}>
                      <div
                        role="button"
                        tabindex="0"
                        data-card-control
                        aria-describedby={instructionsId}
                        aria-busy={pending[id] || undefined}
                        aria-pressed={held.mode === 'held' && held.itemId === id ? true : undefined}
                        class={cn(
                          'flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-surface p-3 text-sm shadow-soft outline-none select-none hover:shadow-float focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-shadow',
                          held.mode === 'held' && held.itemId === id && 'ring-2 ring-primary',
                          pending[id] && 'opacity-70'
                        )}
                        onpointerdown={(event) => onPointerDown(event, item)}
                        onclick={() => onClick(item)}
                        onkeydown={(event) => onCardKey(event, item)}
                      >
                        <span data-drag-handle class="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground/70" aria-hidden="true">
                          <GripVertical class="size-4" />
                        </span>
                        <span class="min-w-0 flex-1">{@render card(item, { pending: pending[id] ?? false })}</span>
                        {#if pending[id]}<Spinner class="size-4 shrink-0" /><span class="sr-only">Saving</span>{/if}
                      </div>
                      <div class="absolute top-1.5 right-1.5" data-card-menu>
                        <DropdownMenu items={menuFor(item)} align="end">
                          {#snippet trigger({ props })}
                            <button
                              {...props}
                              type="button"
                              disabled={pending[id]}
                              aria-label={`Move ${getLabel(item)} to…`}
                              class="inline-flex size-7 min-h-touch min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-h-0 sm:min-w-0"
                            >
                              <ArrowRightLeft class="size-3.5" aria-hidden="true" />
                            </button>
                          {/snippet}
                        </DropdownMenu>
                      </div>
                    </li>
                  {:else}
                    {#if !isTarget}
                      <li class="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border px-3 py-6 text-xs text-muted-foreground">
                        {emptyColumnText}
                      </li>
                    {/if}
                  {/each}
                  {#if isTarget && (drag?.target?.index ?? 0) >= visible.length}
                    <li class="h-12 rounded-lg border-2 border-dashed border-primary/60" aria-hidden="true" data-board-placeholder></li>
                  {/if}
                </ul>
              {/each}
            </div>
          {/if}
        {/each}
      </div>
    {/snippet}
  </QueryState>
  <p id={instructionsId} class="sr-only">
    Press Space to pick up the card, the arrow keys to move it (Shift with Up or Down changes lane), Space again to drop, Escape to cancel{onOpen ? ', Enter to open' : ''}.
  </p>
  <p class="sr-only" aria-live="polite">{announcement}</p>
</div>
