<script lang="ts" generics="T">
import { ArrowDown, ArrowUp, ChevronRight, Columns3, Filter } from '@lucide/svelte';
import { isValidationError, runService } from '@protoyard/renderer-svelte';
import { Button, buttonVariants, cn, type DropdownMenuEntry, Spinner } from '@protoyard/ui';
import {
  applyView,
  compileFilter,
  createAxis,
  flattenGroups,
  type GridAggregate,
  type GridDisplayRow,
  type GridValue,
  moveColumn,
  pinColumn,
  type ResolvedColumn,
  readValue,
  resizeColumn,
  resolveColumns,
  type SavedView,
  sanitizeView,
  setColumnHidden,
  windowGrid,
} from '@protoyard/views/grid';
import { tick } from 'svelte';
import LazyDropdownMenu from '../lib/LazyDropdownMenu.svelte';
import QueryState from '../states/QueryState.svelte';
import {
  completeFilter,
  type DataGridColumn,
  emptyView,
  formatValue,
  type GridViewState,
  nextSort,
  parseEditorValue,
  ROW_HEIGHT,
} from './model.ts';
import SavedViews from './SavedViews.svelte';

/**
 * A data grid on the `@protoyard/views/grid` engine: the ARIA grid pattern
 * with roving focus, virtualized rows and columns, sticky header and pinned
 * columns, sort, resize, reorder, pin and hide, grouping with aggregates,
 * inline editing through `onCommit`, a filter builder and saved views. Below
 * `md` it shows the same rows as cards.
 */
let {
  query,
  columns,
  getRowId,
  view = $bindable(emptyView()),
  savedViews = [],
  activeViewId = $bindable(null),
  onCreateView,
  onRenameView,
  onDeleteView,
  onViewChange,
  onCommit,
  onRowOpen,
  aggregates = [],
  onRetry,
  label = 'Data',
  height = '28rem',
  class: className,
}: {
  query: { readonly current: T[] | undefined; readonly loading: boolean; readonly error: unknown };
  columns: readonly DataGridColumn<T>[];
  getRowId: (row: T) => string;
  /** Column state, sort, grouping, filter and density (bindable, plain data). */
  view?: GridViewState;
  savedViews?: readonly SavedView[];
  activeViewId?: string | null;
  /** Saves the current view under a name (through a service). */
  onCreateView?: (name: string, view: GridViewState) => unknown;
  onRenameView?: (view: SavedView, name: string) => unknown;
  onDeleteView?: (view: SavedView) => unknown;
  /** Called with every view change (to persist it, for example). */
  onViewChange?: (view: GridViewState) => void;
  /** Persists an inline edit; reject (or fail in runService) to roll the cell back. */
  onCommit?: (row: T, key: string, value: GridValue) => unknown;
  onRowOpen?: (row: T) => void;
  aggregates?: readonly GridAggregate[];
  onRetry?: () => void | Promise<void>;
  label?: string;
  height?: string;
  class?: string;
} = $props();

const uid = $props.id();
const HEADER = 40;
let scroller = $state<HTMLDivElement>();
let scrollTop = $state(0);
let scrollLeft = $state(0);
let viewportWidth = $state(0);
let viewportHeight = $state(0);
let collapsed = $state<Set<string>>(new Set());
let showFilters = $state(false);
let active = $state({ row: 0, col: 0 });
let editing = $state<{ rowId: string; key: string; draft: string | boolean } | null>(null);
let optimistic = $state<Record<string, GridValue>>({});
let pending = $state<Record<string, boolean>>({});
let errors = $state<Record<string, string>>({});
let announcement = $state('');
let cardLimit = $state(50);

function setView(next: GridViewState) {
  view = next;
  onViewChange?.(next);
}

const cellKey = (rowId: string, key: string) => `${rowId}:${key}`;

// ── data ────────────────────────────────────────────────────────────────
const prepared = $derived(completeFilter(view.filter));
const filterError = $derived.by(() => {
  if (!prepared.node) return null;
  try {
    compileFilter(prepared.node, columns);
    return null;
  } catch (error) {
    const issue = (error as { issues?: { message?: string }[] }).issues?.[0]?.message;
    return issue ?? 'This filter is incomplete.';
  }
});
const result = $derived(
  applyView(
    query.current ?? [],
    { sort: view.sort, groupBy: view.groupBy, filter: filterError ? null : prepared.node },
    columns,
    { aggregates }
  )
);
const display = $derived<GridDisplayRow<T>[]>(
  result.groups
    ? flattenGroups(result.groups, collapsed)
    : result.rows.map((row) => ({ kind: 'row', row, groupId: '' }))
);

// ── columns ─────────────────────────────────────────────────────────────
const resolved = $derived(
  resolveColumns(columns, view.columns.length ? view.columns : columns.map((c) => ({ key: c.key })))
);
const visible = $derived([...resolved.left, ...resolved.center, ...resolved.right]);
const leftWidth = $derived(resolved.left.reduce((sum, c) => sum + c.width, 0));
const rightWidth = $derived(resolved.right.reduce((sum, c) => sum + c.width, 0));
const rowHeight = $derived(ROW_HEIGHT[view.density]);
const win = $derived(
  windowGrid({
    rows: createAxis({ count: display.length, size: rowHeight }),
    columns: createAxis({
      count: resolved.center.length,
      size: 1,
      sizes: new Map(resolved.center.map((c, i) => [i, c.width])),
    }),
    scrollTop,
    scrollLeft,
    viewportHeight: Math.max(0, (viewportHeight || 600) - HEADER),
    viewportWidth: viewportWidth || 1200,
    pinnedLeftWidth: leftWidth,
    pinnedRightWidth: rightWidth,
  })
);
const centerStart = $derived(win.columns.items[0]?.start ?? 0);
const centerTotal = $derived(resolved.center.reduce((sum, c) => sum + c.width, 0));
const renderedCenter = $derived(
  win.columns.items.map((item) => resolved.center[item.index] as ResolvedColumn<T>)
);
/** Columns drawn in a row, with their position among all visible columns (for aria-colindex). */
const drawn = $derived([
  ...resolved.left.map((c, i) => ({ c, index: i, pin: 'left' as const })),
  ...renderedCenter.map((c, i) => ({
    c,
    index: resolved.left.length + (win.columns.items[i]?.index ?? 0),
    pin: null,
  })),
  ...resolved.right.map((c, i) => ({
    c,
    index: resolved.left.length + resolved.center.length + i,
    pin: 'right' as const,
  })),
]);

function stateFor(): GridViewState['columns'] {
  return view.columns.length ? view.columns : columns.map((c) => ({ key: c.key }));
}
function stickyLeft(index: number) {
  return resolved.left.slice(0, index).reduce((sum, c) => sum + c.width, 0);
}
function stickyRight(index: number) {
  return resolved.right
    .slice(index - resolved.left.length - resolved.center.length + 1)
    .reduce((sum, c) => sum + c.width, 0);
}

function moveBy(key: string, step: -1 | 1) {
  const order = visible.map((c) => c.def.key);
  const at = order.indexOf(key);
  const neighbor = order[at + step];
  if (!neighbor) return;
  const state = stateFor();
  setView({
    ...view,
    columns: moveColumn(
      state,
      key,
      state.findIndex((e) => e.key === neighbor)
    ),
  });
  announce(`Moved ${columns.find((c) => c.key === key)?.header} ${step < 0 ? 'left' : 'right'}.`);
}

function columnMenu(column: ResolvedColumn<T>): DropdownMenuEntry[] {
  const key = column.def.key;
  return [
    {
      label: 'Sort ascending',
      onSelect: () => setView({ ...view, sort: [{ key, direction: 'asc' }] }),
    },
    {
      label: 'Sort descending',
      onSelect: () => setView({ ...view, sort: [{ key, direction: 'desc' }] }),
    },
    { type: 'separator' },
    {
      label: column.pinned === 'left' ? 'Unpin' : 'Pin left',
      onSelect: () =>
        setView({
          ...view,
          columns: pinColumn(stateFor(), key, column.pinned === 'left' ? null : 'left'),
        }),
    },
    {
      label: column.pinned === 'right' ? 'Unpin' : 'Pin right',
      onSelect: () =>
        setView({
          ...view,
          columns: pinColumn(stateFor(), key, column.pinned === 'right' ? null : 'right'),
        }),
    },
    { label: 'Move left', onSelect: () => moveBy(key, -1) },
    { label: 'Move right', onSelect: () => moveBy(key, 1) },
    {
      label: view.groupBy === key ? 'Stop grouping' : 'Group by this column',
      onSelect: () => setView({ ...view, groupBy: view.groupBy === key ? null : key }),
    },
    { type: 'separator' },
    {
      label: 'Hide column',
      disabled: visible.length <= 1,
      onSelect: () => setView({ ...view, columns: setColumnHidden(stateFor(), key, true) }),
    },
  ];
}

function columnsMenu(): DropdownMenuEntry[] {
  return [
    { type: 'label', label: 'Show columns' },
    ...columns.map((c) => {
      const hidden = resolved.hidden.some((h) => h.key === c.key);
      return {
        label: `${hidden ? '○' : '●'} ${c.header}`,
        disabled: !hidden && visible.length <= 1,
        onSelect: () => setView({ ...view, columns: setColumnHidden(stateFor(), c.key, !hidden) }),
      };
    }),
  ];
}

// Resize with the pointer (drag the handle) or the keyboard (←/→ on the focused handle).
let resizing: { key: string; x0: number; width: number } | null = null;
function onResizeKey(event: KeyboardEvent, column: ResolvedColumn<T>) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  event.stopPropagation();
  const width = column.width + (event.key === 'ArrowRight' ? 16 : -16);
  setView({ ...view, columns: resizeColumn(stateFor(), columns, column.def.key, width) });
  announce(`${column.def.header} width ${Math.round(width)} pixels.`);
}

// Reorder by dragging a header horizontally.
let reordering: { key: string; x0: number; moved: boolean } | null = null;
function onWindowPointerMove(event: PointerEvent) {
  if (resizing) {
    setView({
      ...view,
      columns: resizeColumn(
        stateFor(),
        columns,
        resizing.key,
        resizing.width + event.clientX - resizing.x0
      ),
    });
  } else if (reordering && Math.abs(event.clientX - reordering.x0) > 24) {
    const step = event.clientX > reordering.x0 ? 1 : -1;
    moveBy(reordering.key, step);
    reordering = { ...reordering, x0: event.clientX, moved: true };
  }
}
function onWindowPointerUp() {
  resizing = null;
  reordering = null;
}

// ── keyboard (roving focus over cells) ──────────────────────────────────
function announce(text: string) {
  announcement = text;
}

async function focusCell(row: number, col: number) {
  const rows = display.length;
  const r = Math.max(-1, Math.min(row, rows - 1));
  const c = Math.max(0, Math.min(col, visible.length - 1));
  active = { row: r, col: c };
  // Bring the cell into view. Sizes fall back like the window does (no layout while hidden).
  if (scroller && r >= 0) {
    const body = (scroller.clientHeight || viewportHeight || 600) - HEADER;
    const top = r * rowHeight;
    let nextTop = scrollTop;
    if (top < nextTop) nextTop = top;
    else if (top + rowHeight > nextTop + body) nextTop = top + rowHeight - body;
    let nextLeft = scrollLeft;
    const centerIndex = c - resolved.left.length;
    if (centerIndex >= 0 && centerIndex < resolved.center.length) {
      const left = resolved.center.slice(0, centerIndex).reduce((sum, x) => sum + x.width, 0);
      const width = resolved.center[centerIndex]?.width ?? 0;
      const viewportCenter =
        (scroller.clientWidth || viewportWidth || 1200) - leftWidth - rightWidth;
      if (left < nextLeft) nextLeft = left;
      else if (left + width > nextLeft + viewportCenter) nextLeft = left + width - viewportCenter;
    }
    scroller.scrollTop = scrollTop = nextTop;
    scroller.scrollLeft = scrollLeft = nextLeft;
  }
  await tick();
  document
    .querySelector<HTMLElement>(
      `[data-grid="${uid}"] [data-cell="${r}:${display[r]?.kind === 'group' ? 0 : c}"]`
    )
    ?.focus();
}

function onGridKey(event: KeyboardEvent) {
  if (editing) return;
  const { row, col } = active;
  const page = Math.max(
    1,
    Math.floor(((scroller?.clientHeight || viewportHeight || 600) - HEADER) / rowHeight) - 1
  );
  const keys: Record<string, () => void> = {
    ArrowDown: () => focusCell(row + 1, col),
    ArrowUp: () => focusCell(row - 1, col),
    ArrowRight: () => focusCell(row, col + 1),
    ArrowLeft: () => focusCell(row, col - 1),
    Home: () => (event.ctrlKey || event.metaKey ? focusCell(0, 0) : focusCell(row, 0)),
    End: () =>
      event.ctrlKey || event.metaKey
        ? focusCell(display.length - 1, visible.length - 1)
        : focusCell(row, visible.length - 1),
    PageDown: () => focusCell(row + page, col),
    PageUp: () => focusCell(row - page, col),
  };
  const move = keys[event.key];
  if (move) {
    event.preventDefault();
    void move();
    return;
  }
  const item = display[row];
  if (!item) return;
  if (item.kind === 'group' && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    toggleGroup(item.group.id);
    return;
  }
  if (item.kind !== 'row') return;
  const column = visible[col]?.def as DataGridColumn<T> | undefined;
  if ((event.key === 'Enter' || event.key === 'F2') && column?.editable && onCommit) {
    event.preventDefault();
    startEdit(item.row, column);
  } else if (event.key === 'Enter' && onRowOpen) {
    event.preventDefault();
    onRowOpen(item.row);
  }
}

function toggleGroup(id: string) {
  const next = new Set(collapsed);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsed = next;
}

// ── inline edit ─────────────────────────────────────────────────────────
function cellValue(row: T, column: DataGridColumn<T>): GridValue {
  const key = cellKey(getRowId(row), column.key);
  return key in optimistic ? (optimistic[key] as GridValue) : readValue(row, column);
}

function startEdit(row: T, column: DataGridColumn<T>) {
  const value = cellValue(row, column);
  const draft =
    column.type === 'boolean'
      ? value === true
      : column.type === 'date'
        ? formatValue({ ...column, format: undefined }, value, row)
        : value === null || value === undefined
          ? ''
          : String(value);
  editing = { rowId: getRowId(row), key: column.key, draft };
  void tick().then(() =>
    document.querySelector<HTMLElement>(`[data-grid="${uid}"] [data-editor]`)?.focus()
  );
}

async function commitEdit(row: T, column: DataGridColumn<T>) {
  const current = editing;
  if (!current || !onCommit) return;
  editing = null;
  const id = getRowId(row);
  const key = cellKey(id, column.key);
  const value = parseEditorValue(column, current.draft);
  void focusCell(active.row, active.col);
  if (value === readValue(row, column)) return;
  optimistic = { ...optimistic, [key]: value };
  pending = { ...pending, [key]: true };
  const { [key]: _old, ...rest } = errors;
  errors = rest;
  const outcome = await runService(() => onCommit(row, column.key, value));
  const { [key]: _done, ...stillPending } = pending;
  pending = stillPending;
  const { [key]: _value, ...others } = optimistic;
  // Success: the data now holds the value. Failure: show the saved value and why.
  optimistic = others;
  if (!outcome.ok) {
    const message = isValidationError(outcome.error)
      ? (outcome.error.issues[column.key] ??
        Object.values(outcome.error.issues)[0] ??
        outcome.error.message)
      : outcome.error instanceof Error
        ? outcome.error.message
        : 'Not saved.';
    errors = { ...errors, [key]: message };
    announce(`${column.header} was not saved: ${message}`);
  }
}

function onEditorKey(event: KeyboardEvent, row: T, column: DataGridColumn<T>) {
  event.stopPropagation();
  if (event.key === 'Escape') {
    event.preventDefault();
    editing = null;
    void focusCell(active.row, active.col);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    void commitEdit(row, column);
  }
}

function applySaved(saved: SavedView | null) {
  if (!saved) {
    setView(emptyView());
    return;
  }
  const { view: clean, dropped } = sanitizeView(saved, columns);
  setView({
    columns: clean.columns,
    sort: clean.sort,
    groupBy: clean.groupBy,
    filter: clean.filter,
    density: clean.density,
  });
  if (dropped.length) announce(`Some settings no longer apply: ${dropped.join(', ')}.`);
}

const colTemplate = (c: ResolvedColumn<T>) => `${c.width}px`;
const sortOf = (key: string) => view.sort.find((s) => s.key === key)?.direction;
</script>

<svelte:window onpointermove={onWindowPointerMove} onpointerup={onWindowPointerUp} />

<div class={cn('grid gap-3', className)} data-grid={uid}>
  <!-- Toolbar: the same on phones and desktops. -->
  <div class="flex flex-wrap items-center gap-2">
    <SavedViews
      views={savedViews}
      bind:activeId={activeViewId}
      onApply={applySaved}
      onCreate={onCreateView ? (name) => onCreateView(name, view) : undefined}
      onRename={onRenameView}
      onDelete={onDeleteView}
    />
    <Button variant={view.filter ? 'secondary' : 'outline'} size="sm" aria-expanded={showFilters} onclick={() => (showFilters = !showFilters)}>
      <Filter class="size-4" aria-hidden="true" />Filters{view.filter ? ' (on)' : ''}
    </Button>
    <span class="hidden md:inline-flex">
      <LazyDropdownMenu items={columnsMenu()} align="start" button={{ class: buttonVariants({ variant: 'outline', size: 'sm' }) }}>
        <Columns3 class="size-4" aria-hidden="true" />Columns
      </LazyDropdownMenu>
    </span>
    <label class="flex items-center gap-2 text-sm text-muted-foreground">
      Density
      <select class="h-9 rounded-md border border-input bg-surface px-2 text-sm" value={view.density}
        onchange={(event) => setView({ ...view, density: (event.currentTarget as HTMLSelectElement).value as GridViewState['density'] })}>
        <option value="compact">Compact</option>
        <option value="comfortable">Comfortable</option>
        <option value="spacious">Spacious</option>
      </select>
    </label>
    <span class="ml-auto text-sm text-muted-foreground" aria-live="polite">{result.rows.length.toLocaleString('en')} rows</span>
  </div>
  {#if showFilters}
    <!-- The filter builder loads when Filters is first opened. -->
    {#await import('./FilterBuilder.svelte')}
      <p class="text-sm text-muted-foreground" role="status">Loading filters…</p>
    {:then { default: FilterBuilder }}
      <FilterBuilder {columns} value={view.filter} onchange={(filter) => setView({ ...view, filter })} label={`${label} filters`} />
    {:catch}
      <p class="text-sm text-destructive" role="alert">The filter builder could not load. Check the connection and try again.</p>
    {/await}
  {/if}
  <p class="text-sm text-muted-foreground empty:hidden" role="status">
    {#if filterError}Filter not applied: {filterError}{:else if prepared.incomplete}{prepared.incomplete === 1 ? 'One condition needs a value before it applies.' : `${prepared.incomplete} conditions need a value before they apply.`}{/if}
  </p>

  <QueryState {query} label={`Loading ${label.toLowerCase()}`} emptyTitle="No rows yet" {onRetry}>
    {#snippet children()}
      <!-- Desktop: the ARIA grid. -->
      <div
        bind:this={scroller}
        bind:clientWidth={viewportWidth}
        bind:clientHeight={viewportHeight}
        class="relative hidden overflow-auto rounded-lg border border-border md:block"
        style:height
        onscroll={() => {
          scrollTop = scroller?.scrollTop ?? 0;
          scrollLeft = scroller?.scrollLeft ?? 0;
        }}
      >
        <div
          role="grid"
          aria-label={label}
          aria-rowcount={display.length + 1}
          aria-colcount={visible.length}
          tabindex="-1"
          class="relative text-sm"
          style:width={`${leftWidth + centerTotal + rightWidth}px`}
          onkeydown={onGridKey}
        >
          <div role="row" aria-rowindex={1} class="sticky top-0 z-20 flex border-b border-border bg-muted" style:height={`${HEADER}px`}>
            {#each drawn as { c, index, pin } (c.def.key)}
              {#if pin === null && index === resolved.left.length + (win.columns.items[0]?.index ?? 0)}
                <div aria-hidden="true" style:width={`${centerStart}px`} class="shrink-0"></div>
              {/if}
              {@const direction = sortOf(c.def.key)}
              <div
                role="columnheader"
                tabindex="-1"
                aria-colindex={index + 1}
                aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : undefined}
                class={cn('group relative flex shrink-0 items-center gap-1 bg-muted px-2 font-medium', pin && 'sticky z-10')}
                style:width={colTemplate(c)}
                style:left={pin === 'left' ? `${stickyLeft(index)}px` : undefined}
                style:right={pin === 'right' ? `${stickyRight(index)}px` : undefined}
                onpointerdown={(event) => {
                  if ((event.target as Element).closest('button,[data-resize]')) return;
                  reordering = { key: c.def.key, x0: event.clientX, moved: false };
                }}
              >
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-1 truncate text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onclick={(event) => setView({ ...view, sort: nextSort(view.sort, c.def.key, event.shiftKey) })}
                  onkeydown={(event) => {
                    if (event.altKey && event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
                      event.preventDefault();
                      event.stopPropagation();
                      moveBy(c.def.key, event.key === 'ArrowLeft' ? -1 : 1);
                    }
                  }}
                >
                  <span class="truncate">{c.def.header}</span>
                  {#if direction === 'asc'}<ArrowUp class="size-3.5 shrink-0" aria-hidden="true" />{:else if direction === 'desc'}<ArrowDown class="size-3.5 shrink-0" aria-hidden="true" />{/if}
                </button>
                <LazyDropdownMenu
                  items={columnMenu(c)}
                  align="end"
                  button={{
                    'aria-label': `${c.def.header} column options`,
                    class:
                      'inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  }}
                >⋯</LazyDropdownMenu>
                <!-- A focusable separator is the ARIA window-splitter widget. -->
                <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
                <div
                  data-resize
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Resize ${c.def.header}`}
                  aria-valuenow={Math.round(c.width)}
                  tabindex="0"
                  class="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40 focus-visible:bg-primary focus-visible:outline-none"
                  onpointerdown={(event) => {
                    event.preventDefault();
                    resizing = { key: c.def.key, x0: event.clientX, width: c.width };
                  }}
                  onkeydown={(event) => onResizeKey(event, c)}
                ></div>
              </div>
            {/each}
          </div>

          <div style:height={`${win.rows.start * rowHeight}px`} aria-hidden="true"></div>
          {#each win.rows.items as { index: r } (display[r]?.kind === 'group' ? `g:${(display[r] as { group: { id: string } }).group.id}` : `r:${getRowId((display[r] as { row: T }).row)}`)}
            {@const item = display[r] as GridDisplayRow<T>}
            {#if item.kind === 'group'}
              <div role="row" aria-rowindex={r + 2} aria-expanded={!item.collapsed} class="flex border-b border-border bg-muted/50 font-medium" style:height={`${rowHeight}px`}>
                <div
                  role="gridcell"
                  aria-colspan={visible.length}
                  data-cell={`${r}:0`}
                  tabindex={active.row === r ? 0 : -1}
                  class="sticky left-0 flex items-center gap-2 px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  onfocus={() => (active = { row: r, col: 0 })}
                  onclick={() => {
                    active = { row: r, col: 0 };
                    toggleGroup(item.group.id);
                  }}
                  onkeydown={() => {}}
                >
                  <ChevronRight class={cn('size-4 motion-safe:transition-transform', !item.collapsed && 'rotate-90')} aria-hidden="true" />
                  <span>{item.group.value === null ? '(empty)' : formatValue(columns.find((c) => c.key === view.groupBy) as DataGridColumn<T>, item.group.value as GridValue, item.group.rows[0] as T)}</span>
                  <span class="text-xs text-muted-foreground">
                    {item.group.rows.length} rows{#each Object.entries(item.group.aggregates) as [name, total] (name)}{` · ${name.replace(':', ' ')} ${total === null ? '—' : total.toLocaleString('en')}`}{/each}
                  </span>
                </div>
              </div>
            {:else}
              {@const rowId = getRowId(item.row)}
              <div
                role="row"
                aria-rowindex={r + 2}
                class="flex border-b border-border bg-surface hover:bg-muted/30"
                style:height={`${rowHeight}px`}
              >
                {#each drawn as { c, index, pin } (c.def.key)}
                  {#if pin === null && index === resolved.left.length + (win.columns.items[0]?.index ?? 0)}
                    <div aria-hidden="true" style:width={`${centerStart}px`} class="shrink-0"></div>
                  {/if}
                  {@const column = c.def as DataGridColumn<T>}
                  {@const key = cellKey(rowId, column.key)}
                  {@const isEditing = editing?.rowId === rowId && editing.key === column.key}
                  <div
                    role="gridcell"
                    aria-colindex={index + 1}
                    aria-busy={pending[key] || undefined}
                    aria-invalid={errors[key] ? true : undefined}
                    aria-describedby={errors[key] ? `grid-${uid}-err-${rowId}-${column.key}` : undefined}
                    aria-readonly={!(column.editable && onCommit) || undefined}
                    data-cell={`${r}:${index}`}
                    tabindex={active.row === r && active.col === index ? 0 : -1}
                    class={cn(
                      'relative flex shrink-0 items-center gap-1 truncate bg-inherit px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                      column.type === 'number' && 'justify-end tabular-nums',
                      pin && 'sticky z-10 bg-surface',
                      errors[key] && 'ring-1 ring-destructive ring-inset'
                    )}
                    style:width={colTemplate(c)}
                    style:left={pin === 'left' ? `${stickyLeft(index)}px` : undefined}
                    style:right={pin === 'right' ? `${stickyRight(index)}px` : undefined}
                    onclick={() => (active = { row: r, col: index })}
                    onfocus={() => (active = { row: r, col: index })}
                    ondblclick={() => onRowOpen?.(item.row)}
                    onkeydown={() => {}}
                  >
                    {#if isEditing && editing}
                      {#if column.type === 'boolean'}
                        <!-- Native controls edit in place: no Bits UI layers inside a cell. -->
                        <input
                          data-editor
                          type="checkbox"
                          role="switch"
                          aria-label={column.header}
                          class="size-4 accent-primary"
                          checked={editing.draft === true}
                          onchange={(event) => editing && (editing = { ...editing, draft: (event.currentTarget as HTMLInputElement).checked })}
                          onkeydown={(event) => onEditorKey(event, item.row, column)}
                        />
                        <Button size="sm" variant="ghost" onclick={() => commitEdit(item.row, column)}>Save</Button>
                      {:else if column.type === 'enum' && column.options}
                        <select
                          data-editor
                          aria-label={column.header}
                          class="h-7 rounded border border-input bg-background px-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={String(editing.draft)}
                          onchange={(event) => editing && (editing = { ...editing, draft: (event.currentTarget as HTMLSelectElement).value })}
                          onkeydown={(event) => onEditorKey(event, item.row, column)}
                        >
                          {#each column.options as option (option)}<option value={option}>{column.format ? column.format(option, item.row) : option}</option>{/each}
                        </select>
                        <Button size="sm" variant="ghost" onclick={() => commitEdit(item.row, column)}>Save</Button>
                      {:else}
                        <input
                          data-editor
                          aria-label={column.header}
                          type={column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : 'text'}
                          class="h-7 w-full rounded border border-input bg-background px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={String(editing.draft)}
                          oninput={(event) => editing && (editing = { ...editing, draft: (event.currentTarget as HTMLInputElement).value })}
                          onkeydown={(event) => onEditorKey(event, item.row, column)}
                          onblur={() => commitEdit(item.row, column)}
                        />
                      {/if}
                    {:else}
                      <span class="truncate">{formatValue(column, cellValue(item.row, column), item.row)}</span>
                      {#if pending[key]}<Spinner class="size-3.5 shrink-0" /><span class="sr-only">Saving</span>{/if}
                      {#if errors[key]}<span id={`grid-${uid}-err-${rowId}-${column.key}`} class="sr-only">{errors[key]}</span>{/if}
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          {/each}
          <div style:height={`${Math.max(0, display.length - win.rows.end) * rowHeight}px`} aria-hidden="true"></div>
        </div>
      </div>

      <!-- Phones: the same rows as cards. -->
      <ul class="grid gap-2 md:hidden" aria-label={label}>
        {#each display.slice(0, cardLimit) as item (item.kind === 'group' ? `g:${item.group.id}` : `r:${getRowId(item.row)}`)}
          {#if item.kind === 'group'}
            <li><h3 class="pt-2 text-sm font-semibold">{item.group.value ?? '(empty)'} · {item.group.rows.length}</h3></li>
          {:else}
            <li class="rounded-lg border border-border bg-surface p-3 text-sm">
              <button type="button" class="w-full text-left" onclick={() => onRowOpen?.(item.row)} disabled={!onRowOpen}>
                <span class="block font-medium">{formatValue(visible[0]?.def as DataGridColumn<T>, cellValue(item.row, visible[0]?.def as DataGridColumn<T>), item.row)}</span>
                <dl class="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  {#each visible.slice(1, 5) as c (c.def.key)}
                    <dt class="text-muted-foreground">{c.def.header}</dt>
                    <dd class="truncate">{formatValue(c.def as DataGridColumn<T>, cellValue(item.row, c.def as DataGridColumn<T>), item.row)}</dd>
                  {/each}
                </dl>
              </button>
            </li>
          {/if}
        {/each}
        {#if display.length > cardLimit}
          <li><Button variant="outline" size="sm" class="w-full" onclick={() => (cardLimit += 50)}>Show more ({display.length - cardLimit} left)</Button></li>
        {/if}
      </ul>
    {/snippet}
  </QueryState>
  {#each Object.entries(errors) as [key, message] (key)}
    <p class="sr-only" role="alert">{message}</p>
  {/each}
  <p class="sr-only" aria-live="polite">{announcement}</p>
</div>
