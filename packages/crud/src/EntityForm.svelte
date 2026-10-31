<script lang="ts">
import type {
  Blueprint,
  BlueprintEntity,
  BlueprintField,
  EntityInput,
  EntityServices,
} from '@protoyard/blueprint';
import { entityFormModel, fieldLabel, inputProperty } from '@protoyard/blueprint';
import type { PrototypeRuntime, Row } from '@protoyard/core';
import { isValidationError, runService } from '@protoyard/renderer-svelte';
import { Button, FormField } from '@protoyard/ui';
import {
  type FormSubmitResult,
  SchemaForm,
  type SchemaFormSubmission,
  validateFormSchema,
} from '@texuli/forms';
import FieldControl from './fields/FieldControl.svelte';
import RelationPicker from './RelationPicker.svelte';

/**
 * Blueprint-driven create/edit form. The fields `@texuli/forms` has a control
 * for are painted by its `SchemaForm` from `entityFormModel` (blueprint →
 * Texuli schema); the rest (relation pickers, date and time, map points,
 * faces, uploads) are painted here, after them. One submit button drives
 * both: Texuli checks its fields, then the merged input goes through
 * `onSubmit` (usually an entity service create/update: session.assert → zod
 * → environment.run → db.transaction) via `runService`, and the service's
 * zod issues land inline on whichever side owns the field.
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
  title,
  showTitle = true,
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
  /** The form's name (default `New <entity>` / `Edit <entity>`). */
  title?: string;
  /**
   * Show the title as the form's heading. Turn it off where a dialog or a
   * panel heading already names the form; the title then stays its accessible name.
   */
  showTitle?: boolean;
  onSubmit: (input: EntityInput) => Promise<unknown>;
  onCancel?: () => void;
} = $props();

const uid = $props.id();
const formId = `py-entity-form-${uid}`;

const buttonLabel = $derived(
  submitLabel ?? (mode === 'create' ? `Create ${entity.label ?? entity.name}` : 'Save')
);
const personaOptions = $derived(
  runtime
    ? runtime.members.list().map(({ persona }) => ({ value: persona.id, label: persona.name }))
    : undefined
);
const model = $derived(
  entityFormModel(entity, {
    mode,
    readOnly: disabled,
    ...(title ? { title } : {}),
    ...(personaOptions ? { personaOptions } : {}),
  })
);
/** The compiled Texuli form, or null when no field maps (everything is then hosted). */
const compiled = $derived.by(() => {
  if (model.schema.fields.length === 0) return null;
  const result = validateFormSchema(model.schema, { tier: 'developer' });
  return result.ok ? result.form : null;
});
const hostedFields = $derived(compiled ? model.hosted : entity.fields);
const paintedKeys = $derived(
  new Set(compiled ? model.painted.map((field) => inputProperty(field)) : [])
);

function buildHosted(
  fields: readonly BlueprintField[],
  row: Row | null | undefined,
  formMode: 'create' | 'edit'
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const field of fields) {
    const key = inputProperty(field);
    if (row && key in row) next[key] = row[key] ?? null;
    else if (formMode === 'create' && 'default' in field && field.default !== undefined)
      next[key] = field.default;
    else next[key] = field.kind === 'boolean' ? false : field.kind === 'tags' ? [] : null;
  }
  return next;
}

const seedKey = $derived(`${entity.name}:${mode}:${String(initial?.id ?? '')}`);
// svelte-ignore state_referenced_locally
let hosted = $state<Record<string, unknown>>(buildHosted(hostedFields, initial, mode));
let errors = $state<Record<string, string>>({});
let formError = $state<string | null>(null);
let busy = $state(false);
// svelte-ignore state_referenced_locally
let seededFor = $state(seedKey);
// svelte-ignore state_referenced_locally
let startValues = $state(model.toFormValues(initial));

$effect(() => {
  const key = seedKey;
  if (key === seededFor) return;
  hosted = buildHosted(hostedFields, initial, mode);
  startValues = model.toFormValues(initial);
  errors = {};
  formError = null;
  seededFor = key;
});

/**
 * Saved records shuffle their face through the entity service (session.assert →
 * zod → environment.run → db.transaction); new records shuffle the draft.
 */
function shuffleFor(field: BlueprintField): (() => Promise<string | null | undefined>) | undefined {
  const service = services?.[entity.name];
  const recordId = initial?.id;
  if (mode !== 'edit' || !service || typeof recordId !== 'string') return undefined;
  return async () => {
    const result = await runService(() => service.shuffleAvatar(recordId, field.name), {
      errorTitle: 'Could not shuffle face',
      silentValidation: false,
      success: 'New face saved',
    });
    if (!result.ok) return undefined;
    const saved = result.value[inputProperty(field)];
    return typeof saved === 'string' ? saved : null;
  };
}

/** Run the service; split its zod issues between Texuli's fields and the hosted ones. */
async function send(input: EntityInput): Promise<FormSubmitResult> {
  busy = true;
  formError = null;
  errors = {};
  const result = await runService(() => onSubmit(input), {
    errorTitle: mode === 'create' ? 'Could not create' : 'Could not save',
  });
  busy = false;
  if (result.ok) return { ok: true };
  const err = result.error;
  if (isValidationError(err)) {
    const painted: Record<string, string> = {};
    const own: Record<string, string> = {};
    for (const [path, message] of Object.entries(err.issues)) {
      const key = path.split('.')[0] ?? path;
      const target = paintedKeys.has(key) ? painted : own;
      target[key] ??= message;
    }
    errors = own;
    return Object.keys(painted).length > 0
      ? { ok: false, errors: painted }
      : { ok: false, message: 'Check the highlighted fields.' };
  }
  const message = err instanceof Error ? err.message : 'Something went wrong.';
  formError = compiled ? null : message;
  return { ok: false, message };
}

function submitSchema({ values }: SchemaFormSubmission): Promise<FormSubmitResult> {
  return send({ ...model.fromFormValues(values), ...hosted });
}

async function submitHosted(event: SubmitEvent) {
  event.preventDefault();
  if (busy || disabled) return;
  await send({ ...hosted });
}
</script>

{#snippet hostedControls()}
  {#each hostedFields as field (field.name)}
    {@const key = inputProperty(field)}
    <FormField
      label={fieldLabel(field)}
      description={field.description}
      error={errors[key]}
      required={field.required}
    >
      {#snippet children({ props })}
        {#if (field.kind === 'relation' || field.kind === 'persona') && runtime && blueprint && services}
          <RelationPicker
            {runtime}
            {blueprint}
            {services}
            {field}
            bind:value={hosted[key]}
            disabled={disabled || busy}
            id={props.id}
          />
        {:else}
          <FieldControl
            {field}
            bind:value={hosted[key]}
            error={errors[key]}
            disabled={disabled || busy}
            id={props.id}
            shuffleKey={`${entity.name}:${String(initial?.id ?? 'new')}:${field.name}`}
            onShuffle={field.kind === 'avatar' ? shuffleFor(field) : undefined}
          />
        {/if}
      {/snippet}
    </FormField>
  {/each}
{/snippet}

<div
  class="py-entity-form grid gap-4"
  data-entity-form={entity.name}
  data-mode={mode}
  data-hide-title={showTitle ? undefined : ''}
>
  {#if compiled}
    {#key seededFor}
      <SchemaForm
        id={formId}
        form={compiled}
        values={startValues}
        onSubmit={submitSchema}
        labels={{
          submitted: mode === 'create' ? 'Created.' : 'Changes saved.',
        }}
        headingLevel={2}
        aria-label={showTitle ? undefined : model.schema.title}
        data-py-schema-form
      />
    {/key}
    {#if hostedFields.length > 0}
      <div class="grid gap-4" data-entity-form-hosted>
        {@render hostedControls()}
      </div>
    {/if}
  {:else}
    <form
      id={formId}
      class="grid gap-4"
      aria-label={model.schema.title}
      onsubmit={submitHosted}
      novalidate
    >
      {@render hostedControls()}
    </form>
  {/if}

  {#if formError}
    <p class="text-sm text-destructive" role="alert">{formError}</p>
  {/if}

  <div class="flex flex-wrap gap-2">
    <Button type="submit" form={formId} loading={busy} {disabled}>
      {buttonLabel}
    </Button>
    {#if onCancel}
      <Button type="button" variant="outline" disabled={busy} onclick={onCancel}>Cancel</Button>
    {/if}
  </div>
</div>

<style>
  /*
   * One submit button serves the Texuli fields and the hosted ones below
   * them, so SchemaForm's own action row (a documented styling hook) is not
   * shown; its submit still runs on Enter inside a Texuli field.
   */
  .py-entity-form :global(.tx-forms__actions) {
    display: none;
  }
  .py-entity-form {
    --tx-forms-max-inline-size: none;
  }
  /* SchemaForm always paints its title; the form keeps it as its aria-label. */
  .py-entity-form[data-hide-title] :global(.tx-forms__title) {
    display: none;
  }
</style>
