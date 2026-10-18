<script lang="ts">
import type { Blueprint, EntityServices } from '@protoyard/blueprint';
import type { PrototypeRuntime, Row } from '@protoyard/core';
import { provideRuntime } from '@protoyard/renderer-svelte';
import { Toaster } from '@protoyard/ui';
import EntityForm from '../../src/EntityForm.svelte';
import EntityList from '../../src/EntityList.svelte';

let {
  runtime,
  blueprint,
  services,
  mode = 'list',
  entityName = 'customer',
  initial = null,
}: {
  runtime: PrototypeRuntime;
  blueprint: Blueprint;
  services: EntityServices;
  mode?: 'list' | 'form-create' | 'form-edit';
  entityName?: string;
  initial?: Row | null;
} = $props();

// svelte-ignore state_referenced_locally
provideRuntime(runtime);

const entity = $derived(blueprint.entities.find((e) => e.name === entityName)!);
let lastCreated = $state<Row | null>(null);
let lastEdited = $state<Row | null>(null);

async function submitCreate(input: Record<string, unknown>) {
  const row = await services[entityName]!.create(input);
  lastCreated = row;
  return row;
}

async function submitEdit(input: Record<string, unknown>) {
  if (!initial?.id) throw new Error('no initial');
  const row = await services[entityName]!.update(String(initial.id), input);
  lastEdited = row;
  return row;
}
</script>

<div data-testid="crud-harness">
  {#if mode === 'list'}
    <EntityList
      {blueprint}
      {entityName}
      {services}
      onCreate={() => {
        lastCreated = { id: 'intent-create' } as Row;
      }}
      onEdit={(row) => {
        lastEdited = row;
      }}
    />
  {:else if mode === 'form-create'}
    <EntityForm {entity} mode="create" onSubmit={submitCreate} />
  {:else}
    <EntityForm {entity} mode="edit" {initial} onSubmit={submitEdit} />
  {/if}
  {#if lastCreated}<p data-testid="created-id">{String(lastCreated.id)}</p>{/if}
  {#if lastEdited}<p data-testid="edited-id">{String(lastEdited.id)}</p>{/if}
</div>
<Toaster />
