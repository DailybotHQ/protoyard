<script lang="ts">
import { Download, Plus, Trash2, Upload } from '@lucide/svelte';
import {
  type Blueprint,
  CAPABILITIES,
  type EntityService,
  type EntityServices,
  entityTable,
  inputProperty,
  primaryAvatarField,
} from '@protoyard/blueprint';
import type { Row } from '@protoyard/core';
import { can, getRuntime, liveQuery, runService, usePrincipal } from '@protoyard/renderer-svelte';
import { AlertDialog, Button, DataTable, type DataTableSort, toast } from '@protoyard/ui';
import {
  type EntityListDisplayNames,
  entityListColumns,
  entityListHeading,
  entitySearchKeys,
  loadEntityListDisplayNames,
} from './columns.ts';
import RecordAvatar from './fields/RecordAvatar.svelte';

/**
 * Blueprint-driven list: DataTable with selection, bulk delete, optional CSV
 * import/export and trash (soft-delete). Every control is gated by `can()`.
 */
let {
  blueprint,
  entityName,
  services,
  onCreate,
  onEdit,
  onOpen,
}: {
  blueprint: Blueprint;
  entityName: string;
  services: EntityServices;
  onCreate?: () => void;
  onEdit?: (row: Row) => void;
  onOpen?: (row: Row) => void;
} = $props();

const entity = $derived(blueprint.entities.find((e) => e.name === entityName));
const service = $derived(entity ? services[entity.name] : undefined) as EntityService | undefined;
const caps = $derived(entity ? CAPABILITIES(blueprint)[entity.name] : undefined);
const runtime = getRuntime();

let displayNames = $state<EntityListDisplayNames>({});
const avatarField = $derived(entity ? primaryAvatarField(entity) : undefined);
const titleField = $derived(entity?.fields.find((f) => f.name === entity.titleField));
const columns = $derived.by(() => {
  if (!entity) return [];
  const base = entityListColumns(entity, displayNames);
  if (!avatarField || !titleField) return base;
  // People get their face next to the record title.
  const titleKey = inputProperty(titleField);
  return base.map((column) =>
    column.key === titleKey ? { ...column, cell: titleWithFace } : column
  );
});
const searchKeys = $derived(entity ? entitySearchKeys(entity) : []);

$effect(() => {
  const currentEntity = entity;
  let cancelled = false;
  if (!currentEntity) {
    displayNames = {};
    return;
  }
  void loadEntityListDisplayNames(currentEntity, blueprint, {
    canReadEntity: (name) => runtime.session.can(`${name}:read`),
    listEntity: async (name) => {
      const relatedService = services[name];
      return relatedService ? relatedService.list() : [];
    },
    listPersonas: () => runtime.members.list(),
  }).then((names) => {
    if (!cancelled) displayNames = names;
  });
  return () => {
    cancelled = true;
  };
});

let view = $state<'active' | 'trash'>('active');
let selected = $state<string[]>([]);
let sort = $state<DataTableSort | null>(null);
let search = $state('');
let page = $state(1);
let confirmOpen = $state(false);
let pendingIds = $state<string[]>([]);
let importInput = $state<HTMLInputElement | null>(null);

// list() and trash() assert the persona's read capability, so a persona
// switch must re-run the query (a refused read leaves no table to observe).
const principal = usePrincipal(runtime);
const personaId = $derived(principal.current?.persona.id ?? '');

const rowsQuery = liveQuery(
  async (): Promise<Row[]> => {
    if (!service) return [];
    return view === 'trash' ? service.trash() : service.list();
  },
  { initial: [], deps: () => [entityName, view, service, personaId] }
);

const rows = $derived(rowsQuery.current ?? []);
const loading = $derived(rowsQuery.loading);

const canRead = $derived(Boolean(caps && can(caps.read)));
const canCreate = $derived(Boolean(caps && can(caps.create)));
const deletableIds = $derived(
  new Set(
    caps
      ? rows
          .filter((row) => can(caps.delete, row) || can(caps.deleteOwn, row))
          .map((row) => String(row.id))
      : []
  )
);
function canDeleteRow(row: Row): boolean {
  return deletableIds.has(String(row.id));
}
const canDelete = $derived(rows.some(canDeleteRow));
const canExport = $derived(Boolean(caps && can(caps.export)));
const canImport = $derived(Boolean(caps && can(caps.import)));
const softDelete = $derived(Boolean(entity?.features.softDelete));
const csvEnabled = $derived(Boolean(entity?.features.csv));

function askDelete(ids: string[]) {
  const permittedIds = ids.filter((id) => {
    const row = rows.find((item) => String(item.id) === id);
    return row ? canDeleteRow(row) : false;
  });
  if (!permittedIds.length) return;
  pendingIds = permittedIds;
  confirmOpen = true;
}

async function restoreSelected(ids: string[]) {
  const svc = service;
  if (!svc) return;
  const permittedIds = ids.filter((id) => {
    const row = rows.find((item) => String(item.id) === id);
    return row ? canDeleteRow(row) : false;
  });
  if (!permittedIds.length) return;
  let restored = 0;
  for (const id of permittedIds) {
    const result = await runService(() => svc.restoreTrashed(id), {
      errorTitle: 'Could not restore',
    });
    if (!result.ok) return;
    restored += result.value;
  }
  selected = [];
  toast.success(`Restored ${restored} record${restored === 1 ? '' : 's'}`);
}

async function confirmDelete() {
  const ids = pendingIds;
  const svc = service;
  const ent = entity;
  confirmOpen = false;
  pendingIds = [];
  if (!svc || !ent || !ids.length) return;

  if (softDelete) {
    const tokens: string[] = [];
    for (const id of ids) {
      const result = await runService(() => svc.remove(id), {
        errorTitle: 'Could not delete selection',
      });
      if (!result.ok) return;
      if (typeof result.value === 'string') tokens.push(result.value);
    }
    selected = [];
    toast.success(`Moved ${ids.length} record${ids.length === 1 ? '' : 's'} to trash`, {
      action: {
        label: 'Undo',
        onClick: () => {
          for (const token of tokens) {
            void runService(() => svc.restore(token), { errorTitle: 'Could not undo' });
          }
        },
      },
    });
    return;
  }

  if (ids.length === 1) {
    const id = ids[0] as string;
    const result = await runService(() => svc.remove(id), { errorTitle: 'Could not delete' });
    if (!result.ok) return;
    selected = selected.filter((s) => s !== id);
    const token = result.value;
    if (typeof token === 'string' && softDelete) {
      toast.success('Moved to trash', {
        action: {
          label: 'Undo',
          onClick: () => {
            void runService(() => svc.restore(token), { errorTitle: 'Could not undo' });
          },
        },
      });
    } else {
      toast.success('Deleted');
    }
    return;
  }

  const result = await runService(() => svc.bulkRemove(ids), {
    errorTitle: 'Could not delete selection',
  });
  if (result.ok) {
    selected = [];
    toast.success(`Deleted ${result.value} record${result.value === 1 ? '' : 's'}`);
  }
}

async function exportCsv() {
  if (!entity || !canExport) return;
  const { serializeEntityCsv } = await import('@protoyard/blueprint/csv');
  const csv = serializeEntityCsv(entity, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${entityTable(entity)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function onImportFile(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !entity || !service || !canImport) return;
  const text = await file.text();
  const result = await runService(() => service.importCsv(text, { mode: 'commit' }), {
    errorTitle: 'Could not import CSV',
  });
  if (result.ok)
    toast.success(
      `Imported ${result.value.created.length} row${result.value.created.length === 1 ? '' : 's'}`
    );
}
</script>

{#snippet titleWithFace(row: Row)}
  {@const title = titleField ? row[inputProperty(titleField)] : row.id}
  <span class="inline-flex min-w-0 items-center gap-2">
    <RecordAvatar
      avatar={avatarField ? row[inputProperty(avatarField)] : null}
      name={String(title ?? row.id)}
    />
    <span class="truncate">{title === null || title === undefined || title === '' ? '—' : String(title)}</span>
  </span>
{/snippet}

{#if !entity || !service || !caps}
  <p class="text-sm text-destructive" role="alert">Unknown entity “{entityName}”.</p>
{:else if !canRead}
  <p class="text-sm text-muted-foreground" role="status">You do not have access to this list.</p>
{:else}
  <!-- minmax(0, 1fr) (inline, so it never depends on Tailwind scanning this package): a wide table scrolls inside its container instead of widening the page. -->
  <div class="grid min-w-0 gap-3" style="grid-template-columns: minmax(0, 1fr)" data-entity-list={entity.name} data-view={view}>
    {#if softDelete}
      <div class="flex gap-1" role="group" aria-label="List view">
        <Button
          size="sm"
          variant={view === 'active' ? 'default' : 'outline'}
          onclick={() => {
            view = 'active';
            selected = [];
            page = 1;
          }}
        >
          Active
        </Button>
        <Button
          size="sm"
          variant={view === 'trash' ? 'default' : 'outline'}
          onclick={() => {
            view = 'trash';
            selected = [];
            page = 1;
          }}
        >
          <Trash2 class="size-3.5" aria-hidden="true" /> Trash
        </Button>
      </div>
    {/if}

    <DataTable
      {columns}
      {rows}
      getRowId={(row) => String(row.id)}
      bind:sort
      bind:search
      bind:page
      bind:selected
      {searchKeys}
      selectable={canDelete}
      loading={loading}
      caption={entityListHeading(entity)}
      emptyTitle={view === 'trash' ? 'Trash is empty' : `No ${entityListHeading(entity)} yet`}
      emptyDescription={view === 'trash'
        ? 'Soft-deleted records appear here.'
        : canCreate
          ? 'Create the first record to get started.'
          : undefined}
      onRowClick={onOpen ?? onEdit}
      rowLabel={(row) => `Open ${String(row[entity.titleField] ?? row.id)}`}
    >
      {#snippet toolbar()}
        <div class="flex flex-wrap items-center gap-2">
          {#if canCreate && view === 'active' && onCreate}
            <Button size="sm" onclick={onCreate}>
              <Plus class="size-3.5" aria-hidden="true" /> New
            </Button>
          {/if}
          {#if csvEnabled && canExport}
            <Button size="sm" variant="outline" onclick={() => exportCsv()}>
              <Download class="size-3.5" aria-hidden="true" /> Export CSV
            </Button>
          {/if}
          {#if csvEnabled && canImport && view === 'active'}
            <Button size="sm" variant="outline" onclick={() => importInput?.click()}>
              <Upload class="size-3.5" aria-hidden="true" /> Import CSV
            </Button>
            <input
              bind:this={importInput}
              type="file"
              accept=".csv,text/csv"
              class="sr-only"
              onchange={(e) => void onImportFile(e)}
            />
          {/if}
        </div>
      {/snippet}
      {#snippet bulkActions({ selected: ids })}
        {#if view === 'trash'}
          <Button size="sm" onclick={() => restoreSelected(ids)}>
            Restore {ids.length}
          </Button>
        {:else}
          <Button size="sm" variant="destructive" onclick={() => askDelete(ids)}>
            <Trash2 class="size-3.5" aria-hidden="true" /> Delete {ids.length}
          </Button>
        {/if}
      {/snippet}
    </DataTable>
  </div>

  <AlertDialog
    bind:open={confirmOpen}
    title={pendingIds.length > 1 ? `Delete ${pendingIds.length} records?` : 'Delete this record?'}
    description={softDelete
      ? 'It will move to trash. You can undo for a short time.'
      : 'This cannot be undone.'}
    confirmLabel="Delete"
    destructive
    onConfirm={confirmDelete}
  />
{/if}
