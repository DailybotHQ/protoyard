<script lang="ts">
import {
  type Blueprint,
  type BlueprintEntity,
  type BlueprintField,
  type EntityServices,
  entityTable,
  inputProperty,
} from '@protoyard/blueprint';
import type { PrototypeRuntime, Row } from '@protoyard/core';
import { Button, Combobox } from '@protoyard/ui';
import EntityForm from './EntityForm.svelte';

const PAGE_SIZE = 200;
type Option = { value: string; label: string };
interface Collection {
  offset(count: number): Collection;
  limit(count: number): Collection;
  toArray(): Promise<Row[]>;
}
interface IndexCollection extends Collection {
  startsWithIgnoreCase(value: string): Collection;
}
interface Table {
  orderBy(index: string): Collection;
  where(index: string): IndexCollection;
  get(id: string): Promise<Row | undefined>;
}
interface Db {
  table(name: string): Table;
}

let {
  runtime,
  blueprint,
  field,
  services,
  value = $bindable<unknown>(),
  disabled = false,
  id,
}: {
  runtime: PrototypeRuntime;
  blueprint: Blueprint;
  field: Extract<BlueprintField, { kind: 'relation' | 'persona' }>;
  services: EntityServices;
  value?: unknown;
  disabled?: boolean;
  id?: string;
} = $props();

const target = $derived(
  field.kind === 'relation' ? blueprint.entities.find((entity) => entity.name === field.to) : null
);
const targetName = $derived(field.kind === 'relation' ? field.to : 'persona');
const titleField = $derived(
  target?.fields.find((candidate) => candidate.name === target.titleField)
);
const titleIndex = $derived(
  field.kind === 'persona' ? 'id' : titleField ? inputProperty(titleField) : 'id'
);
const multi = $derived(field.kind === 'relation' && field.cardinality === 'many');
const selectedIds = $derived(
  multi
    ? Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : []
    : typeof value === 'string'
      ? [value]
      : []
);
const canCreate = $derived(
  field.kind === 'relation' && Boolean(target && runtime.session.can(`${target.name}:create`))
);

let options = $state<Option[]>([]);
let query = $state('');
let offset = $state(0);
let hasMore = $state(false);
let loading = $state(false);
let createOpen = $state(false);
let loadKey = $state('');
let requestSequence = 0;

function displayLabel(row: Row): string {
  const title =
    field.kind === 'persona' ? row.name : titleField ? row[inputProperty(titleField)] : row.id;
  const label = title === null || title === undefined || title === '' ? row.id : String(title);
  return label === row.id ? label : `${label} · ${String(row.id)}`;
}

async function load(reset = false) {
  const sequence = ++requestSequence;
  loading = true;
  if (reset) {
    offset = 0;
    options = [];
  }
  const start = offset;
  const db = runtime.db as Db;
  const tableName = field.kind === 'persona' ? 'py_personas' : target ? entityTable(target) : '';
  if (!tableName) {
    if (sequence === requestSequence) loading = false;
    return;
  }
  const index = field.kind === 'persona' ? 'id' : titleIndex;
  const needle = query.trim();
  if (field.kind === 'relation' && target && !runtime.session.can(`${target.name}:read`)) {
    options = [];
    hasMore = false;
    loading = false;
    return;
  }
  let page: Row[];
  try {
    page = needle
      ? await db
          .table(tableName)
          .where(index)
          .startsWithIgnoreCase(needle)
          .offset(start)
          .limit(PAGE_SIZE)
          .toArray()
      : await db.table(tableName).orderBy(index).offset(start).limit(PAGE_SIZE).toArray();
  } catch {
    page = [];
  }
  if (sequence !== requestSequence) return;
  const visible = page.filter((row) => !row.deletedAt);
  const byId = new Map(options.map((option) => [option.value, option]));
  for (const row of visible) {
    if (typeof row.id === 'string') byId.set(row.id, { value: row.id, label: displayLabel(row) });
  }
  for (const selected of selectedIds) {
    if (byId.has(selected)) continue;
    const row = await db.table(tableName).get(selected);
    if (row && !row.deletedAt) byId.set(selected, { value: selected, label: displayLabel(row) });
  }
  options = [...byId.values()];
  offset = start + page.length;
  hasMore = page.length === PAGE_SIZE;
  loading = false;
}

$effect(() => {
  const key = `${field.kind}:${targetName}:${query.trim()}`;
  if (key === loadKey) return;
  loadKey = key;
  void load(true);
});

function choose(next: string) {
  if (multi) {
    const current = selectedIds;
    value = current.includes(next) ? current.filter((item) => item !== next) : [...current, next];
  } else value = next || null;
}

async function created(row: unknown) {
  if (typeof row !== 'object' || row === null || typeof (row as Row).id !== 'string') return;
  const createdRow = row as Row;
  options = [...options, { value: String(createdRow.id), label: displayLabel(createdRow) }];
  if (multi) value = [...selectedIds, String(createdRow.id)];
  else value = String(createdRow.id);
  createOpen = false;
}
</script>

<div class="grid gap-2" data-relation-picker={field.name} data-option-count={options.length}>
  <!-- Inside a form, the visible label names the input through `id`. -->
  <Combobox
    {id}
    items={options.map((option) => ({ ...option, selected: selectedIds.includes(option.value) }))}
    value={multi ? '' : selectedIds[0] ?? ''}
    disabled={disabled}
    placeholder={multi ? 'Search and add…' : `Search ${targetName}…`}
    emptyText={loading ? 'Loading…' : `No ${targetName} found`}
    oninput={(event) => {
      query = event.currentTarget.value;
      loadKey = '';
    }}
    onValueChange={choose}
    aria-label={id ? undefined : (field.label ?? field.name)}
  />
  {#if multi && selectedIds.length > 0}
    <ul class="flex flex-wrap gap-2" aria-label={`Selected ${field.label ?? field.name}`}>
      {#each selectedIds as selected (selected)}
        <li>
          <button type="button" class="rounded border px-2 py-1 text-sm" disabled={disabled} onclick={() => choose(selected)}>
            {options.find((option) => option.value === selected)?.label ?? selected} <span aria-hidden="true">×</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  {#if hasMore}
    <Button type="button" variant="outline" size="sm" disabled={loading} onclick={() => load()}>
      {loading ? 'Loading…' : 'Load more'}
    </Button>
  {/if}
  {#if canCreate && target && services[target.name]}
    {#if createOpen}
      <div class="rounded-md border p-3" aria-label={`Create ${target.label ?? target.name}`}>
        <p class="mb-3 text-sm font-medium">Create {target.label ?? target.name}</p>
        <EntityForm
          entity={target}
          mode="create"
          {runtime}
          {blueprint}
          {services}
          onSubmit={async (input) => {
            const row = await services[target.name]!.create(input);
            await created(row);
            return row;
          }}
          onCancel={() => (createOpen = false)}
        />
      </div>
    {:else}
      <Button type="button" variant="outline" size="sm" onclick={() => (createOpen = true)}>
        Create {target.label ?? target.name}
      </Button>
    {/if}
  {/if}
</div>
