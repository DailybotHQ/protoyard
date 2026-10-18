<script lang="ts">
import {
  type AuditEntry,
  type Blueprint,
  type BlueprintEntity,
  createEntityServices,
  type EntityServices,
  entityTable,
  FEATURE_TABLES,
  fieldLabel,
  inputProperty,
} from '@protoyard/blueprint';
import type { PrototypeRuntime, Row } from '@protoyard/core';
import { Button } from '@protoyard/ui';
import { formatFieldValue } from './format.ts';

interface Collection {
  toArray(): Promise<Row[]>;
}
interface Table {
  get(id: string): Promise<Row | undefined>;
  where(index: string): { equals(value: string): Collection };
}
interface Db {
  table(name: string): Table;
}

let {
  runtime,
  blueprint,
  entityName,
  recordId,
  services = createEntityServices(runtime, blueprint),
  onEdit,
  headingLevel = 2,
}: {
  runtime: PrototypeRuntime;
  blueprint: Blueprint;
  entityName: string;
  recordId: string;
  services?: EntityServices;
  onEdit?: (row: Row) => void;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
} = $props();

const entity = $derived(blueprint.entities.find((candidate) => candidate.name === entityName));
let record = $state<Row | null>(null);
let related = $state<Array<{ entity: BlueprintEntity; field: string; rows: Row[] }>>([]);
let attachments = $state<Row[]>([]);
let history = $state<AuditEntry[]>([]);
let notFound = $state(false);
let loadError = $state<string | null>(null);
let refreshKey = $state('');

$effect(() => {
  const currentEntity = entity;
  const id = recordId;
  const key = `${entityName}:${id}`;
  if (!currentEntity || key === refreshKey) return;
  refreshKey = key;
  record = null;
  notFound = false;
  loadError = null;
  void load(currentEntity, id);
});

async function load(currentEntity: BlueprintEntity, id: string) {
  try {
    const current = await services[currentEntity.name]?.get(id);
    if (!current || current.deletedAt) {
      notFound = true;
      return;
    }
    record = current;
    const db = runtime.db as Db;
    const inbound = blueprint.entities.flatMap((source) =>
      source.fields.flatMap((field) =>
        field.kind === 'relation' &&
        field.to === currentEntity.name &&
        runtime.session.can(`${source.name}:read`)
          ? [{ entity: source, field }]
          : []
      )
    );
    related = await Promise.all(
      inbound.map(async ({ entity: source, field }) => {
        runtime.session.assert(`${source.name}:read`);
        const property =
          field.kind === 'relation'
            ? `${field.name}${field.cardinality === 'many' ? 'Ids' : 'Id'}`
            : field.name;
        const rows = await db.table(entityTable(source)).where(property).equals(id).toArray();
        return { entity: source, field: field.name, rows: rows.filter((row) => !row.deletedAt) };
      })
    );
    if (currentEntity.features.files) {
      const fileIds = currentEntity.fields
        .filter((field) => field.kind === 'file')
        .flatMap((field) => {
          const linked = current[inputProperty(field)];
          return Array.isArray(linked) ? linked : typeof linked === 'string' ? [linked] : [];
        });
      const files = await Promise.all(
        fileIds.map((fileId) => db.table(FEATURE_TABLES.files).get(fileId))
      );
      attachments = files.filter((file): file is Row =>
        Boolean(file && file.entity === currentEntity.name && file.recordId === id)
      );
    } else attachments = [];
    if (currentEntity.features.audit) {
      runtime.session.assert(`${currentEntity.name}:read`);
      const entries = (await db
        .table(FEATURE_TABLES.audit)
        .where('recordId')
        .equals(id)
        .toArray()) as AuditEntry[];
      history = entries
        .filter((entry) => entry.entity === currentEntity.name)
        .sort((a, b) => {
          if (a.at !== b.at) return a.at < b.at ? 1 : -1;
          if (a.seq !== b.seq) return b.seq - a.seq;
          return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
        });
    } else history = [];
  } catch (error) {
    if (error instanceof Error && /No .* with id/.test(error.message)) {
      notFound = true;
      return;
    }
    loadError = error instanceof Error ? error.message : 'Could not load this record.';
  }
}

function valueFor(field: BlueprintEntity['fields'][number], row: Row): unknown {
  return row[inputProperty(field)];
}

function href(entity: BlueprintEntity, row: Row): string {
  return `#/${entity.plural}/${encodeURIComponent(String(row.id))}`;
}

function displayTitle(entity: BlueprintEntity, row: Row): string {
  const field = entity.fields.find((candidate) => candidate.name === entity.titleField);
  const value = field ? valueFor(field, row) : row.id;
  return value === null || value === undefined || value === '' ? String(row.id) : String(value);
}

function changedValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function changeLabel(entry: AuditEntry, name: string): string {
  const field = blueprint.entities
    .find((candidate) => candidate.name === entry.entity)
    ?.fields.find((candidate) => inputProperty(candidate) === name);
  return field ? fieldLabel(field) : name;
}
</script>

<section class="grid gap-6" data-entity-detail={entityName} data-record-id={recordId}>
  {#if notFound}
    <div role="status" class="rounded-md border p-6 text-center">
      <h2 class="font-semibold">Record not found</h2>
      <p class="mt-1 text-sm text-muted-foreground">This record may have been deleted or is no longer available.</p>
    </div>
  {:else if loadError}
    <p role="alert" class="text-sm text-destructive">{loadError}</p>
  {:else if !record || !entity}
    <p role="status" class="text-sm text-muted-foreground">Loading record…</p>
  {:else}
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-sm text-muted-foreground">{entity.label ?? entity.name}</p>
        <svelte:element this={`h${headingLevel}`} class="text-2xl font-semibold">
          {displayTitle(entity, record)}
        </svelte:element>
      </div>
      {#if onEdit && runtime.session.can(`${entity.name}:update`, record)}
        <Button type="button" variant="outline" onclick={() => onEdit?.(record!)}>Edit</Button>
      {/if}
    </header>

    <dl class="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
      {#each entity.fields as field (field.name)}
        {#if field.kind !== 'file'}
          <div class="min-w-0">
            <dt class="text-sm text-muted-foreground">{fieldLabel(field)}</dt>
            <dd class="mt-1 break-words text-sm">{formatFieldValue(field, valueFor(field, record))}</dd>
          </div>
        {/if}
      {/each}
    </dl>

    {#each related as group (`${group.entity.name}:${group.field}`)}
      <section aria-label={`${group.entity.label ?? group.entity.plural} related to ${displayTitle(entity, record)}`} class="grid gap-2">
        <h2 class="text-lg font-semibold">{group.entity.label ?? group.entity.plural}</h2>
        {#if group.rows.length === 0}
          <p class="text-sm text-muted-foreground">No related {group.entity.plural}.</p>
        {:else}
          <ul class="divide-y rounded-lg border">
            {#each group.rows as row (String(row.id))}
              <li><a class="block px-4 py-3 text-sm text-primary underline-offset-4 hover:underline" href={href(group.entity, row)}>{displayTitle(group.entity, row)}</a></li>
            {/each}
          </ul>
        {/if}
      </section>
    {/each}

    {#if entity.features.files}
      <section class="grid gap-2" aria-label="Attachments">
        <h2 class="text-lg font-semibold">Attachments</h2>
        {#if attachments.length === 0}
          <p class="text-sm text-muted-foreground">No attachments.</p>
        {:else}
          <ul class="divide-y rounded-lg border">
            {#each attachments as file (String(file.id))}
              <li class="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm"><span>{String(file.name ?? file.id)}</span><span class="text-muted-foreground">{typeof file.size === 'number' ? `${Math.ceil(file.size / 1024)} KB` : ''}</span></li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}

    {#if entity.features.audit}
      <section class="grid gap-2" aria-label="Change history">
        <h2 class="text-lg font-semibold">Change history</h2>
        {#if history.length === 0}
          <p class="text-sm text-muted-foreground">No history yet.</p>
        {:else}
          <ol class="grid gap-3">
            {#each history as entry (String(entry.id))}
              <li class="rounded-lg border p-4">
                <p class="text-sm font-medium">{entry.action} <time class="font-normal text-muted-foreground" datetime={entry.at}>{entry.at}</time></p>
                {#if Object.keys(entry.changes).length > 0}
                  <ul class="mt-2 grid gap-1 text-sm">
                    {#each Object.entries(entry.changes) as [name, change] (name)}
                      <li><span class="font-medium">{changeLabel(entry, name)}:</span> {changedValue(change.before)} → {changedValue(change.after)}</li>
                    {/each}
                  </ul>
                {/if}
              </li>
            {/each}
          </ol>
        {/if}
      </section>
    {/if}
  {/if}
</section>
