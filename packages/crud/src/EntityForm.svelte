<script lang="ts">
import type { Blueprint, BlueprintEntity, EntityInput, EntityServices } from '@protoyard/blueprint';
import { fieldLabel, inputProperty } from '@protoyard/blueprint';
import type { PrototypeRuntime, Row } from '@protoyard/core';
import { isValidationError, runService } from '@protoyard/renderer-svelte';
import { Button, FormField, Select } from '@protoyard/ui';
import FieldControl from './fields/FieldControl.svelte';
import RelationPicker from './RelationPicker.svelte';

/**
 * Blueprint-driven create/edit form. Submits through `onSubmit` (usually an
 * entity service create/update) via `runService` so zod issues land inline.
 */
let {
  entity,
  mode = 'create',
  initial = null,
  runtime,
  blueprint,
  services,
  disabled = false,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  entity: BlueprintEntity;
  mode?: 'create' | 'edit';
  initial?: Row | null;
  runtime?: PrototypeRuntime;
  blueprint?: Blueprint;
  services?: EntityServices;
  disabled?: boolean;
  submitLabel?: string;
  onSubmit: (input: EntityInput) => Promise<unknown>;
  onCancel?: () => void;
} = $props();

function buildValues(
  ent: BlueprintEntity,
  row: Row | null | undefined,
  formMode: 'create' | 'edit'
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const field of ent.fields) {
    const key = inputProperty(field);
    if (row && key in row) next[key] = row[key] ?? null;
    else if (formMode === 'create' && 'default' in field && field.default !== undefined)
      next[key] = field.default;
    else next[key] = field.kind === 'boolean' ? false : field.kind === 'tags' ? [] : null;
  }
  return next;
}

// svelte-ignore state_referenced_locally
let values = $state<Record<string, unknown>>(buildValues(entity, initial, mode));
let errors = $state<Record<string, string>>({});
let formError = $state<string | null>(null);
let busy = $state(false);
const personaItems = $derived(
  runtime
    ? [
        { value: '', label: 'Unassigned' },
        ...runtime.members
          .list()
          .map(({ persona }) => ({ value: persona.id, label: persona.name })),
      ]
    : []
);
// svelte-ignore state_referenced_locally
let seededFor = $state(`${entity.name}:${mode}:${String(initial?.id ?? '')}`);

$effect(() => {
  const key = `${entity.name}:${mode}:${String(initial?.id ?? '')}`;
  if (key === seededFor) return;
  values = buildValues(entity, initial, mode);
  errors = {};
  formError = null;
  seededFor = key;
});

async function submit(event: SubmitEvent) {
  event.preventDefault();
  if (busy || disabled) return;
  busy = true;
  formError = null;
  errors = {};
  const input: EntityInput = { ...values };
  const result = await runService(() => onSubmit(input), {
    errorTitle: mode === 'create' ? 'Could not create' : 'Could not save',
  });
  busy = false;
  if (result.ok) return;
  const err = result.error;
  if (isValidationError(err)) {
    errors = { ...err.issues };
    return;
  }
  formError = err instanceof Error ? err.message : 'Something went wrong.';
}
</script>

<form class="grid gap-4" onsubmit={submit} data-entity-form={entity.name} data-mode={mode}>
  {#each entity.fields as field (field.name)}
    {@const key = inputProperty(field)}
    <FormField
      label={fieldLabel(field)}
      description={field.description}
      error={errors[key]}
      required={field.required}
    >
      {#snippet children({ props })}
        {#if field.kind === 'relation' && runtime && blueprint && services}
          <RelationPicker
            {runtime}
            {blueprint}
            {services}
            {field}
            bind:value={values[key]}
            disabled={disabled || busy}
            id={props.id}
          />
        {:else if field.kind === 'persona' && runtime}
          <Select
            id={props.id}
            items={personaItems}
            value={typeof values[key] === 'string' ? values[key] : ''}
            placeholder={`Select ${fieldLabel(field).toLowerCase()}`}
            disabled={disabled || busy}
            aria-invalid={errors[key] ? 'true' : undefined}
            onValueChange={(next) => (values[key] = next || null)}
          />
        {:else}
          <FieldControl
            {field}
            bind:value={values[key]}
            error={errors[key]}
            disabled={disabled || busy}
            id={props.id}
          />
        {/if}
      {/snippet}
    </FormField>
  {/each}

  {#if formError}
    <p class="text-sm text-destructive" role="alert">{formError}</p>
  {/if}

  <div class="flex flex-wrap gap-2">
    <Button type="submit" loading={busy} disabled={disabled}>
      {submitLabel ?? (mode === 'create' ? `Create ${entity.label ?? entity.name}` : 'Save')}
    </Button>
    {#if onCancel}
      <Button type="button" variant="outline" disabled={busy} onclick={onCancel}>Cancel</Button>
    {/if}
  </div>
</form>
