<script lang="ts">
import type { Row } from '@protoyard/core';
import { EntityForm, EntityList, formatEntityHeading } from '@protoyard/crud';
import { navigate, type RouteProps } from '@protoyard/renderer-svelte';
import { Button } from '@protoyard/ui';
import { useCrudApp } from '../lib/context.ts';

let {
  entityName,
  params = {},
}: RouteProps & {
  entityName: string;
} = $props();

const { blueprint, services } = useCrudApp();
const entity = $derived(blueprint.entities.find((e) => e.name === entityName));
const listPath = $derived(entity ? `/${entity.plural}` : '/');

let mode = $state<'list' | 'create' | 'edit'>('list');
let editing = $state<Row | null>(null);

$effect(() => {
  void entityName;
  const id = params.id;
  if (!id || !entity) {
    mode = 'list';
    editing = null;
    return;
  }
  void services[entity.name]!.get(id).then((row) => {
    if (row) {
      editing = row;
      mode = 'edit';
    } else {
      mode = 'list';
      editing = null;
    }
  });
});

async function submitCreate(input: Record<string, unknown>) {
  const row = await services[entityName]!.create(input);
  mode = 'list';
  navigate(listPath);
  return row;
}

async function submitEdit(input: Record<string, unknown>) {
  if (!editing?.id) throw new Error('Nothing to edit');
  const row = await services[entityName]!.update(String(editing.id), input);
  mode = 'list';
  editing = null;
  navigate(listPath);
  return row;
}
</script>

{#if !entity}
  <p class="text-sm text-muted-foreground">Unknown entity.</p>
{:else}
  <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
    <div>
      <h1 class="text-xl font-semibold">{formatEntityHeading(entity)}</h1>
      <p class="text-sm text-muted-foreground">
        Blueprint-driven list and forms. Mutations go through entity services.
      </p>
    </div>
    {#if mode !== 'list'}
      <Button
        variant="outline"
        size="sm"
        onclick={() => {
          mode = 'list';
          editing = null;
          navigate(listPath);
        }}
      >
        Back to list
      </Button>
    {/if}
  </div>

  {#if mode === 'list'}
    <EntityList
      {blueprint}
      {entityName}
      {services}
      onCreate={() => {
        mode = 'create';
        editing = null;
      }}
      onOpen={entityName === 'ticket'
        ? (row) => navigate(`/tickets/${encodeURIComponent(String(row.id))}/workspace`)
        : undefined}
      onEdit={(row) => {
        editing = row;
        mode = 'edit';
        navigate(`${listPath}/${row.id}`);
      }}
    />
  {:else if mode === 'create'}
    <EntityForm {entity} mode="create" onSubmit={submitCreate} />
  {:else if editing}
    <EntityForm {entity} mode="edit" initial={editing} {services} onSubmit={submitEdit} />
  {/if}
{/if}
