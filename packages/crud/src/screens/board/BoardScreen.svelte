<script lang="ts">
import {
  type Blueprint,
  type BlueprintField,
  type EntityInput,
  type EntityServices,
  fieldLabel,
  inputProperty,
} from '@protoyard/blueprint';
import type { PrototypeRuntime, Row } from '@protoyard/core';
import { can, liveQuery, navigate, runService, usePrincipal } from '@protoyard/renderer-svelte';
import { applyFilters, FilterBar, type FilterField, type FilterValues, toast } from '@protoyard/ui';
import { type BoardColumnDef, type BoardMove, rankSequence } from '@protoyard/views/board';
import { BoardView } from '@protoyard/views-ui/board';
import { QueryState } from '@protoyard/views-ui/states';
import { formatEntityHeading, formatFieldValue, formatMoney } from '../../format.ts';
import type { BoardScreenSpec } from './model.ts';

function requireEntity(blueprint: Blueprint, name: string) {
  const entity = blueprint.entities.find((candidate) => candidate.name === name);
  if (!entity) throw new RangeError(`board screen: unknown entity "${name}"`);
  return entity;
}

function requireService(services: EntityServices, name: string) {
  const service = services[name];
  if (!service) throw new RangeError(`board screen: no service for "${name}"`);
  return service;
}

/** Blueprint `board` route: records grouped by an enum field. */
let {
  runtime,
  blueprint,
  services,
  screen,
  title,
  onOpenRecord,
}: {
  runtime: PrototypeRuntime;
  blueprint: Blueprint;
  services: EntityServices;
  screen: BoardScreenSpec;
  title?: string;
  /** Default: the record detail route, `#/<plural>/<id>`. */
  onOpenRecord?: (row: Row) => void;
} = $props();

// svelte-ignore state_referenced_locally
const entity = requireEntity(blueprint, screen.entity);
// svelte-ignore state_referenced_locally
const service = requireService(services, screen.entity);
// svelte-ignore state_referenced_locally
const groupField = entity.fields.find((field) => field.name === screen.groupBy);
// svelte-ignore state_referenced_locally
if (groupField?.kind !== 'enum') {
  throw new RangeError(`board screen: groupBy "${screen.groupBy}" must be an enum field`);
}

// svelte-ignore state_referenced_locally
const principal = usePrincipal(runtime);
const locale = $derived(principal.current?.persona.locale ?? 'en-US');
const label = $derived(title ?? `${formatEntityHeading(entity)} board`);
const sumField = $derived(
  screen.sumField ? entity.fields.find((field) => field.name === screen.sumField) : undefined
);
const cardFields = $derived(
  (screen.cardFields ?? [entity.titleField])
    .map((name) => entity.fields.find((field) => field.name === name))
    .filter((field): field is BlueprintField => field !== undefined)
);

let attempt = $state(0);
const rows = liveQuery(() => service.list(), {
  initial: undefined,
  deps: () => [attempt, principal.current?.persona.id],
});
let filters = $state<FilterValues>({});

const filterFields: FilterField<Row>[] = $derived.by(() =>
  entity.fields.flatMap((field): FilterField<Row>[] => {
    const id = field.name;
    const base = { id, label: fieldLabel(field), key: inputProperty(field) };
    if (field.kind === 'enum') {
      return [
        {
          ...base,
          kind: 'enum',
          options: field.values.map((value) => ({
            value,
            label: field.labels?.[value] ?? value,
          })),
        },
      ];
    }
    if (field.kind === 'boolean') return [{ ...base, kind: 'boolean' }];
    if (field.kind === 'date' || field.kind === 'datetime') {
      return [{ ...base, kind: 'date-range' }];
    }
    return [];
  })
);

const visibleRows = $derived(applyFilters(rows.current ?? [], filterFields, filters));
const query = {
  get current(): Row[] | undefined {
    return rows.current === undefined ? undefined : visibleRows;
  },
  get loading() {
    return rows.loading;
  },
  get error() {
    return rows.error;
  },
};

const columns: BoardColumnDef[] = $derived.by(() =>
  groupField.values.map((value) => {
    const columnTitle = groupField.labels?.[value] ?? value;
    if (!sumField) return { id: value, title: columnTitle };
    const amount = visibleRows
      .filter((row) => String(row[screen.groupBy] ?? '') === value)
      .reduce((sum, row) => {
        const raw = row[inputProperty(sumField)];
        return typeof raw === 'number' && Number.isFinite(raw) ? sum + raw : sum;
      }, 0);
    const formatted =
      sumField.kind === 'money'
        ? formatMoney(amount, sumField.currency, locale)
        : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount);
    return { id: value, title: `${columnTitle} · ${formatted}` };
  })
);

const baseRanks = $derived.by(() => {
  const ordered = [...(rows.current ?? [])].sort((a, b) => {
    const left = String(a.createdAt ?? '');
    const right = String(b.createdAt ?? '');
    if (left !== right) return left < right ? -1 : 1;
    const leftId = String(a.id);
    const rightId = String(b.id);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });
  const ranks = rankSequence(ordered.length);
  return new Map(ordered.map((row, index) => [String(row.id), ranks[index] ?? 'a0']));
});
let rankOverrides = $state<Record<string, string>>({});
let undoPending = $state<Record<string, boolean>>({});

function idOf(row: Row): string {
  return String(row.id);
}

function columnOf(row: Row): string {
  return String(row[screen.groupBy] ?? '');
}

function rankOf(row: Row): string {
  return rankOverrides[idOf(row)] ?? baseRanks.get(idOf(row)) ?? 'a0';
}

function rowLabel(row: Row): string {
  return String(row[entity.titleField] ?? '').trim() || 'Untitled';
}

function open(row: Row) {
  if (onOpenRecord) onOpenRecord(row);
  else navigate(`/${entity.plural}/${encodeURIComponent(idOf(row))}`);
}

function updateRankOverrides(next: Record<string, string | undefined>) {
  const updated = { ...rankOverrides };
  for (const [id, rank] of Object.entries(next)) {
    if (rank === undefined) delete updated[id];
    else updated[id] = rank;
  }
  rankOverrides = updated;
}

async function undoMove(
  itemId: string,
  previousColumn: string,
  previousRanks: Record<string, string | undefined>
) {
  if (undoPending[itemId]) return;
  undoPending = { ...undoPending, [itemId]: true };
  const result = await runService(
    () => service.update(itemId, { [screen.groupBy]: previousColumn } as EntityInput),
    { errorTitle: 'Could not undo move' }
  );
  const { [itemId]: _pending, ...rest } = undoPending;
  undoPending = rest;
  if (result.ok) {
    updateRankOverrides(previousRanks);
    toast.success('Move undone');
  }
}

async function persistMove(move: BoardMove, item: Row) {
  const previousColumn = String(item[screen.groupBy] ?? '');
  const changedIds = [move.itemId, ...(move.rerank ?? []).map((entry) => entry.itemId)];
  const previousRanks: Record<string, string | undefined> = {};
  for (const id of changedIds) previousRanks[id] = rankOverrides[id];

  const updated = await service.update(move.itemId, {
    [screen.groupBy]: move.columnId,
  } as EntityInput);
  const nextRanks: Record<string, string> = { [move.itemId]: move.rank };
  for (const itemRank of move.rerank ?? []) nextRanks[itemRank.itemId] = itemRank.rank;
  rankOverrides = { ...rankOverrides, ...nextRanks };
  const nextColumn = columns.find((column) => column.id === move.columnId)?.title ?? move.columnId;
  toast.success(`Moved ${rowLabel(updated)} to ${nextColumn}`, {
    action: {
      label: 'Undo',
      onClick: () => void undoMove(move.itemId, previousColumn, previousRanks),
    },
  });
}

const canEditBoard = $derived(
  can(`${entity.name}:update`, undefined, runtime) ||
    can(`${entity.name}:update:own`, undefined, runtime)
);

function canMove(item: Row): boolean | string {
  if (undoPending[idOf(item)]) return `${rowLabel(item)} is being restored.`;
  return (
    can(`${entity.name}:update`, item, runtime) || can(`${entity.name}:update:own`, item, runtime)
  );
}

function rowsInColumn(value: string): Row[] {
  return visibleRows.filter((row) => columnOf(row) === value);
}

const unplaced = $derived(
  visibleRows.filter((row) => !groupField.values.includes(columnOf(row))).length
);
</script>

{#snippet cardBody(row: Row, pending: boolean)}
  <div class="grid min-w-0 gap-1" data-board-card={idOf(row)}>
    {#each cardFields as field (field.name)}
      {@const value = row[inputProperty(field)]}
      {#if field.name === entity.titleField}
        <p class="truncate font-medium">{formatFieldValue(field, value)}</p>
      {:else}
        <p class="truncate text-xs text-muted-foreground">
          <span>{fieldLabel(field)}:</span> {formatFieldValue(field, value)}
        </p>
      {/if}
    {/each}
    {#if pending || undoPending[idOf(row)]}
      <span class="text-xs text-muted-foreground" aria-live="polite">
        {undoPending[idOf(row)] ? 'Undoing move…' : 'Saving move…'}
      </span>
    {/if}
  </div>
{/snippet}

<div class="grid gap-3" data-board-screen={entity.name}>
  {#if filterFields.length > 0}
    <FilterBar fields={filterFields} bind:values={filters} label={`${formatEntityHeading(entity)} filters`} />
  {/if}
  <QueryState
    query={rows}
    label={`Loading ${label.toLowerCase()}`}
    isEmpty={() => false}
    onRetry={() => {
      attempt += 1;
    }}
  >
    {#snippet children()}
      {#if canEditBoard}
        <BoardView
          {query}
          {columns}
          {label}
          getId={idOf}
          getColumn={columnOf}
          getRank={rankOf}
          getLabel={rowLabel}
          {canMove}
          onMove={persistMove}
          onOpen={open}
        >
          {#snippet card(row: Row, state: { pending: boolean })}
            {@render cardBody(row, state.pending)}
          {/snippet}
        </BoardView>
      {:else}
        <div class="grid min-w-0 gap-3 overflow-x-auto" role="region" aria-label={label}>
          <div class="grid min-w-[max-content] gap-3" style={`grid-template-columns: repeat(${columns.length}, minmax(15rem, 1fr))`}>
            {#each columns as column (column.id)}
              {@const columnRows = rowsInColumn(column.id)}
              <section class="flex min-w-0 flex-col rounded-xl border border-border bg-muted/40" aria-label={column.title}>
                <header class="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
                  <h3 class="truncate text-sm font-semibold">{column.title}</h3>
                  <span class="rounded-full bg-background px-2 py-0.5 text-xs font-medium tabular-nums">
                    {columnRows.length}<span class="sr-only"> cards</span>
                  </span>
                </header>
                <ul class="grid min-h-24 gap-2 px-2 pb-2">
                  {#each columnRows as row (idOf(row))}
                    <li>
                      <article class="rounded-lg border border-border bg-surface p-3 text-sm shadow-soft">
                        {@render cardBody(row, false)}
                      </article>
                    </li>
                  {:else}
                    <li class="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-border px-3 py-6 text-xs text-muted-foreground">No cards</li>
                  {/each}
                </ul>
              </section>
            {/each}
          </div>
        </div>
      {/if}
    {/snippet}
  </QueryState>
  {#if sumField}
    <p class="sr-only">Column totals use {fieldLabel(sumField)}; money values are integer cents.</p>
  {/if}
  {#if unplaced > 0}
    <p class="text-sm text-muted-foreground" data-unplaced>
      {unplaced} {unplaced === 1 ? 'record has' : 'records have'} no valid {fieldLabel(groupField)} value and {unplaced === 1 ? 'is' : 'are'} not on the board.
    </p>
  {/if}
</div>
