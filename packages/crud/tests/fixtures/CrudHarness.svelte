<script lang="ts">
import type { Blueprint, EntityServices } from '@protoyard/blueprint';
import type { PrototypeRuntime, Row } from '@protoyard/core';
import { provideRuntime } from '@protoyard/renderer-svelte';
import { Toaster } from '@protoyard/ui';
import EntityDetail from '../../src/EntityDetail.svelte';
import EntityForm from '../../src/EntityForm.svelte';
import EntityList from '../../src/EntityList.svelte';
import RelationPicker from '../../src/RelationPicker.svelte';

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
  mode?: 'list' | 'form-create' | 'form-edit' | 'detail' | 'relation-picker';
  entityName?: string;
  initial?: Row | null;
} = $props();

// svelte-ignore state_referenced_locally
provideRuntime(runtime);

const entity = $derived(blueprint.entities.find((e) => e.name === entityName)!);
const relationField = $derived(entity.fields.find((field) => field.kind === 'relation'));
let relationValue = $state<unknown>(null);
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
  {:else if mode === 'detail'}
    <EntityDetail {runtime} {blueprint} {entityName} recordId={String(initial?.id ?? '')} {services} />
  {:else if mode === 'relation-picker'}
    {#if relationField?.kind === 'relation'}
      <RelationPicker {runtime} {blueprint} field={relationField} {services} bind:value={relationValue} />
      <button
        type="button"
        data-testid="save-relation"
        onclick={async () => {
          if (!initial?.id) return;
          const row = await services[entityName]!.update(String(initial.id), {
            [`${relationField.name}Id`]: relationValue,
          });
          lastEdited = row;
        }}
      >Save relation</button>
    {/if}
  {:else}
    <EntityForm {entity} mode="edit" {initial} onSubmit={submitEdit} />
  {/if}
  {#if lastCreated}<p data-testid="created-id">{String(lastCreated.id)}</p>{/if}
  {#if lastEdited}<p data-testid="edited-id">{String(lastEdited.id)}</p>{/if}
</div>
<Toaster />
