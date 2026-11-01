<script lang="ts">
import type {
  Blueprint,
  BlueprintEntity,
  BlueprintField,
  EntityInput,
  EntityServices,
} from '@protoyard/blueprint';
import { ENTITY_FORM_CUSTOM_KINDS, entityFormModel, inputProperty } from '@protoyard/blueprint';
import type { PrototypeRuntime, Row } from '@protoyard/core';
import { isValidationError, runService } from '@protoyard/renderer-svelte';
import { Button } from '@protoyard/ui';
import {
  type FormSubmitResult,
  SchemaForm,
  type SchemaFormActions,
  type SchemaFormCustomField,
  type SchemaFormSubmission,
  validateFormSchema,
} from '@texuli/forms';
import FieldControl from './fields/FieldControl.svelte';
import RelationPicker from './RelationPicker.svelte';

/**
 * Blueprint-driven create/edit form, one Texuli `SchemaForm` painted from
 * `entityFormModel` (blueprint → Texuli schema). Kinds Texuli has a control
 * for are Texuli's; the rest (relation pickers, map points, faces, uploads)
 * are Texuli `custom` fields painted here with Protoyard's controls (G113),
 * so Texuli labels, validates, summarizes and submits every field. The
 * action row is Protoyard's `Button`s (G115), the title can be hidden while
 * it keeps naming the form (G114), and `disabled` disables the whole form
 * (G116). The input goes through `onSubmit` (usually an entity service
 * create/update: session.assert → zod → environment.run → db.transaction)
 * via `runService`, and the service's zod issues land inline on their fields.
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
    submitLabel: buttonLabel,
    ...(title ? { title } : {}),
    ...(personaOptions ? { personaOptions } : {}),
  })
);
/** The compiled Texuli form; a schema Texuli refuses is reported, never painted half. */
const compiled = $derived(
  validateFormSchema(model.schema, { tier: 'developer', kinds: [...ENTITY_FORM_CUSTOM_KINDS] })
);

const seedKey = $derived(`${entity.name}:${mode}:${String(initial?.id ?? '')}`);
let busy = $state(false);
// svelte-ignore state_referenced_locally
let seededFor = $state(seedKey);
// svelte-ignore state_referenced_locally
let startValues = $state(model.toFormValues(initial));

$effect(() => {
  const key = seedKey;
  if (key === seededFor) return;
  startValues = model.toFormValues(initial);
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

/** Run the service; its zod issues go back to Texuli by schema field name. */
async function submit({ values }: SchemaFormSubmission): Promise<FormSubmitResult> {
  if (disabled) return { ok: false, message: 'This form is read-only.' };
  busy = true;
  const result = await runService(() => onSubmit(model.fromFormValues(values)), {
    errorTitle: mode === 'create' ? 'Could not create' : 'Could not save',
  });
  busy = false;
  if (result.ok) return { ok: true };
  const err = result.error;
  if (isValidationError(err)) {
    const errors: Record<string, string> = {};
    // An issue on no form field (a record-level rule, a field the form leaves
    // out) has nowhere to show inline, so it becomes the form's message.
    const unplaced: string[] = [];
    for (const [path, message] of Object.entries(err.issues)) {
      const name = model.names.get(path.split('.')[0] ?? path);
      if (name) errors[name] ??= message;
      else unplaced.push(message);
    }
    const message = unplaced.length > 0 ? unplaced.join(' ') : undefined;
    if (Object.keys(errors).length > 0)
      return { ok: false, errors, ...(message ? { message } : {}) };
    return { ok: false, message: message ?? 'Check the highlighted fields.' };
  }
  return { ok: false, message: err instanceof Error ? err.message : 'Something went wrong.' };
}
</script>

<!-- A hosted (custom) field: Texuli paints its label, description and error around it. -->
{#snippet hostedField(custom: SchemaFormCustomField)}
  {@const field = model.fieldFor(custom.name)}
  {@const locked = custom.disabled || custom.readOnly || busy}
  {#if field}
    <div
      class="grid"
      data-entity-form-hosted={field.name}
      onfocusout={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) custom.blur();
      }}
    >
      {#if (field.kind === 'relation' || field.kind === 'persona') && runtime && blueprint && services}
        <RelationPicker
          {runtime}
          {blueprint}
          {services}
          {field}
          bind:value={() => custom.value, (next) => custom.setValue(next ?? null)}
          disabled={locked}
          id={custom.id}
        />
      {:else}
        <FieldControl
          {field}
          bind:value={() => custom.value, (next) => custom.setValue(next ?? null)}
          error={custom.error}
          disabled={locked}
          id={custom.id}
          shuffleKey={`${entity.name}:${String(initial?.id ?? 'new')}:${field.name}`}
          onShuffle={field.kind === 'avatar' ? shuffleFor(field) : undefined}
        />
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet actionRow(state: SchemaFormActions)}
  <div class="flex flex-wrap gap-2">
    <Button
      type="submit"
      loading={state.submitting}
      disabled={state.disabled || state.readOnly}
    >
      {state.submitLabel}
    </Button>
    {#if onCancel}
      <Button type="button" variant="outline" disabled={state.submitting} onclick={onCancel}>Cancel</Button>
    {/if}
  </div>
{/snippet}

<div class="py-entity-form grid gap-4" data-entity-form={entity.name} data-mode={mode}>
  {#if compiled.ok}
    {#key seededFor}
      <SchemaForm
        id={formId}
        form={compiled.form}
        values={startValues}
        onSubmit={submit}
        field={hostedField}
        actions={actionRow}
        {disabled}
        hideTitle={!showTitle}
        labels={{
          submitted: mode === 'create' ? 'Created.' : 'Changes saved.',
        }}
        headingLevel={2}
        data-py-schema-form
      />
    {/key}
  {:else}
    <p class="text-sm text-destructive" role="alert" data-entity-form-invalid>
      This form cannot be shown: {compiled.issues[0]?.message ?? 'its schema is invalid'}.
    </p>
  {/if}
</div>

<style>
  .py-entity-form {
    --tx-forms-max-inline-size: none;
  }
</style>
