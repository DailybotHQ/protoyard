<script lang="ts">
import { Download, Plus, Trash2, Upload } from '@lucide/svelte';
import {
  type Blueprint,
  CAPABILITIES,
  type EntityService,
  type EntityServices,
  entityTable,
} from '@protoyard/blueprint';
import type { Row } from '@protoyard/core';
import { can, getRuntime, liveQuery, runService } from '@protoyard/renderer-svelte';
import { AlertDialog, Button, DataTable, type DataTableSort, toast } from '@protoyard/ui';
import {
  type EntityListDisplayNames,
  entityListColumns,
  entityListHeading,
  entitySearchKeys,
  loadEntityListDisplayNames,
} from './columns.ts';

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
const columns = $derived(entity ? entityListColumns(entity, displayNames) : []);
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

const rowsQuery = liveQuery(
  async (): Promise<Row[]> => {
    if (!service) return [];
    return view === 'trash' ? service.trash() : service.list();
  },
  { initial: [], deps: () => [entityName, view, service] }
);

const rows = $derived(rowsQuery.current ?? []);
const loading = $derived(rowsQuery.loading);

const canRead = $derived(Boolean(caps && can(caps.read)));
const canCreate = $derived(Boolean(caps && can(caps.create)));
const canDelete = $derived(Boolean(caps && (can(caps.delete) || can(caps.deleteOwn))));
const canExport = $derived(Boolean(caps && can(caps.export)));
const canImport = $derived(Boolean(caps && can(caps.import)));
const softDelete = $derived(Boolean(entity?.features.softDelete));
const csvEnabled = $derived(Boolean(entity?.features.csv));

function askDelete(ids: string[]) {
  if (!ids.length || !canDelete) return;
  pendingIds = ids;
  confirmOpen = true;
}

async function confirmDelete() {
  const ids = pendingIds;
  const svc = service;
  const ent = entity;
  confirmOpen = false;
  pendingIds = [];
  if (!svc || !ent || !ids.length) return;

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
  const { validateCsv } = await import('@protoyard/blueprint/csv');
  const result = validateCsv(entity, text);
  if (result.errors.length) {
    toast.error(`CSV has ${result.errors.length} error(s)`, {
      description: result.errors[0]?.message,
    });
    return;
  }
  let created = 0;
  for (const row of result.valid) {
    const r = await runService(() => service.create(row), { errorTitle: 'Import row failed' });
    if (r.ok) created += 1;
  }
  toast.success(`Imported ${created} row${created === 1 ? '' : 's'}`);
}
</script>

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
      selectable={canDelete && view === 'active'}
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
            <Button size="sm" variant="outline" onclick={() => void exportCsv()}>
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
        <Button size="sm" variant="destructive" onclick={() => askDelete(ids)}>
          <Trash2 class="size-3.5" aria-hidden="true" /> Delete {ids.length}
        </Button>
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
