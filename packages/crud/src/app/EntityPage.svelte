<script lang="ts">
import type { Row } from '@protoyard/core';
import { navigate, type RouteProps } from '@protoyard/renderer-svelte';
import { Button } from '@protoyard/ui';
import EntityForm from '../EntityForm.svelte';
import EntityList from '../EntityList.svelte';
import { formatEntityHeading } from '../format.ts';
import { useBlueprintApp } from './context.ts';

/**
 * An entity's list, create and edit flow. Every write goes through the entity
 * service (session.assert → zod → environment.run → db.transaction), and the
 * form's submit button shows pending feedback while it runs.
 */
let {
  entityName,
  params = {},
}: Partial<RouteProps> & {
  entityName: string;
} = $props();

const { blueprint, services, runtime, recordPath } = useBlueprintApp();
const entity = $derived(blueprint.entities.find((e) => e.name === entityName));
const listPath = $derived(entity ? `/${entity.plural}` : '/');

let mode = $state<'list' | 'create' | 'edit'>('list');
let editing = $state<Row | null>(null);
let missing = $state(false);

$effect(() => {
  const id = params.id;
  const service = entity ? services[entity.name] : undefined;
  missing = false;
  if (!id || !service || id === 'new') {
    mode = id === 'new' && service ? 'create' : 'list';
    editing = null;
    return;
  }
  let cancelled = false;
  void service.get(id).then(
    (row) => {
      if (cancelled) return;
      editing = row ?? null;
      mode = row ? 'edit' : 'list';
      missing = !row;
    },
    () => {
      if (cancelled) return;
      editing = null;
      mode = 'list';
      missing = true;
    }
  );
  return () => {
    cancelled = true;
  };
});

function serviceFor(name: string) {
  const service = services[name];
  if (!service) throw new Error(`No service for "${name}"`);
  return service;
}

async function submitCreate(input: Record<string, unknown>) {
  const row = await serviceFor(entityName).create(input);
  mode = 'list';
  navigate(listPath);
  return row;
}

async function submitEdit(input: Record<string, unknown>) {
  if (!editing?.id) throw new Error('Nothing to edit');
  const row = await serviceFor(entityName).update(String(editing.id), input);
  mode = 'list';
  editing = null;
  navigate(listPath);
  return row;
}

function backToList() {
  mode = 'list';
  editing = null;
  navigate(listPath);
}
</script>

{#if !entity}
  <p class="text-sm text-muted-foreground">This blueprint has no "{entityName}" entity.</p>
{:else}
  <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
    <h1 class="text-xl font-semibold">{formatEntityHeading(entity)}</h1>
    {#if mode !== 'list'}
      <Button variant="outline" size="sm" onclick={backToList}>Back to list</Button>
    {/if}
  </div>
  {#if missing}
    <p class="mb-4 text-sm text-muted-foreground" role="status">
      That record no longer exists or your role cannot see it.
    </p>
  {/if}

  {#if mode === 'list'}
    <EntityList
      {blueprint}
      {entityName}
      {services}
      onCreate={() => {
        mode = 'create';
        editing = null;
      }}
      onEdit={(row) => {
        editing = row;
        mode = 'edit';
        navigate(`${listPath}/${row.id}`);
      }}
      onOpen={(row) => navigate(recordPath(entityName, String(row.id)))}
    />
  {:else if mode === 'create'}
    <EntityForm {entity} mode="create" {runtime} {blueprint} {services} onSubmit={submitCreate} />
  {:else if editing}
    {#key editing.id}
      <EntityForm {entity} mode="edit" initial={editing} {runtime} {blueprint} {services} onSubmit={submitEdit} />
    {/key}
  {/if}
{/if}
