<script lang="ts">
import {
  type Blueprint,
  type BlueprintEntity,
  type EntityInput,
  type EntityServices,
  inputProperty,
} from '@protoyard/blueprint';
import type { PrototypeRuntime, Row } from '@protoyard/core';
import EntityForm from '../../EntityForm.svelte';
import EntityList from '../../EntityList.svelte';

let {
  runtime,
  blueprint,
  services,
  parent,
  parentEntity,
  relatedEntity,
}: {
  runtime: PrototypeRuntime;
  blueprint: Blueprint;
  services: EntityServices;
  parent: Row;
  parentEntity: BlueprintEntity;
  relatedEntity: BlueprintEntity;
} = $props();

const relations = $derived(
  relatedEntity.fields.filter(
    (field) => field.kind === 'relation' && field.to === parentEntity.name
  )
);
const baseService = $derived(services[relatedEntity.name]);
const parentId = $derived(String(parent.id));
const parentValues = $derived.by(() =>
  Object.fromEntries(
    relations.flatMap((field) =>
      field.kind === 'relation'
        ? [[inputProperty(field), field.cardinality === 'many' ? [parentId] : parentId]]
        : []
    )
  )
);
const filteredServices = $derived.by(() => {
  const service = baseService;
  const backRelations = relations;
  if (!service || backRelations.length === 0) return services;
  return {
    ...services,
    [relatedEntity.name]: {
      ...service,
      list: async () => {
        const rows = await service.list();
        return rows.filter((row) =>
          backRelations.some((field) => {
            const value = row[inputProperty(field)];
            return Array.isArray(value)
              ? value.some((id) => String(id) === parentId)
              : String(value ?? '') === parentId;
          })
        );
      },
      create: (input: EntityInput) => service.create({ ...input, ...parentValues }),
    },
  };
});
const initial = $derived({ id: parentId, ...parentValues });
let createOpen = $state(false);

async function create(input: EntityInput) {
  if (!baseService || relations.length === 0) {
    throw new Error('This related entity is unavailable.');
  }
  const saved = await baseService.create({ ...input, ...parentValues });
  createOpen = false;
  return saved;
}
</script>

{#if relations.length > 0 && baseService}
  <section class="grid gap-4" aria-label={`${relatedEntity.plural} related records`}>
    <EntityList
      {blueprint}
      entityName={relatedEntity.name}
      services={filteredServices}
      onCreate={() => (createOpen = true)}
    />
    {#if createOpen}
      <div class="rounded-lg border border-border bg-surface p-4">
        <h3 class="mb-3 text-base font-semibold">New {relatedEntity.label ?? relatedEntity.name}</h3>
        <EntityForm
          entity={relatedEntity}
          {runtime}
          {blueprint}
          services={filteredServices}
          {initial}
          onSubmit={create}
          onCancel={() => (createOpen = false)}
        />
      </div>
    {/if}
  </section>
{:else}
  <p role="status" class="text-sm text-muted-foreground">Related records are unavailable.</p>
{/if}
