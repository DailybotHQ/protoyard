<script lang="ts">
import type { FormBlock as FormBlockData } from '@protoyard/blocks';
import type { FormServices } from '@protoyard/pages';
import type { FormFieldControl } from '@protoyard/ui';
import { Button, Checkbox, FormField, Input, Select, Textarea } from '@protoyard/ui';

let {
  form,
  services,
  class: className = '',
}: {
  form: FormBlockData;
  /** The canonical @protoyard/pages response service; the UI never writes storage. */
  services: Pick<FormServices, 'submit'>;
  class?: string;
} = $props();

type FormFieldData = FormBlockData['fields'][number];

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function createInitialValues(fields: readonly FormFieldData[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    if (UNSAFE_KEYS.has(field.name)) continue;
    values[field.name] = field.type === 'boolean' ? false : '';
  }
  return values;
}

let values = $state<Record<string, unknown>>({});
let attempted = $state(false);
let pending = $state(false);
let submitted = $state(false);
let errors = $state<Record<string, string>>({});
let formError = $state('');

$effect(() => {
  values = createInitialValues(form.fields);
});

function requiredMessage(field: FormFieldData): string | undefined {
  if (!field.required || UNSAFE_KEYS.has(field.name)) return undefined;
  const value = values[field.name];
  if (field.type === 'boolean') return value === true ? undefined : `${field.label} is required`;
  if (field.type === 'tags') {
    const tags = typeof value === 'string' ? value.split(',').map((tag) => tag.trim()) : value;
    return Array.isArray(tags) && tags.some(Boolean) ? undefined : `${field.label} is required`;
  }
  return typeof value === 'string' && value.trim() ? undefined : `${field.label} is required`;
}

function fieldError(field: FormFieldData): string | undefined {
  return errors[field.name] ?? (attempted ? requiredMessage(field) : undefined);
}

function submissionValues(): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const field of form.fields) {
    const key = field.name;
    if (UNSAFE_KEYS.has(key)) continue;
    const raw = values[key];
    if (field.type === 'number') {
      if (raw === '' || raw === undefined) continue;
      clean[key] = Number(raw);
    } else if (field.type === 'tags') {
      clean[key] =
        typeof raw === 'string'
          ? raw
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean)
          : raw;
    } else if (field.type === 'enum' && raw === '') {
    } else {
      clean[key] = raw;
    }
  }
  return clean;
}

function validationIssues(error: unknown): Record<string, string> | undefined {
  if (error === null || typeof error !== 'object' || !('issues' in error)) return undefined;
  const issues = error.issues;
  if (issues === null || typeof issues !== 'object' || Array.isArray(issues)) return undefined;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(issues)) {
    if (typeof value === 'string') result[key] = value;
  }
  return result;
}

async function submit(): Promise<void> {
  attempted = true;
  submitted = false;
  formError = '';
  errors = {};

  const missing: Record<string, string> = {};
  for (const field of form.fields) {
    const message = requiredMessage(field);
    if (message) missing[field.name] = message;
  }
  if (Object.keys(missing).length > 0) {
    errors = missing;
    return;
  }

  pending = true;
  try {
    await services.submit(form.id, submissionValues());
    submitted = true;
  } catch (error) {
    const issues = validationIssues(error);
    if (issues) {
      errors = Object.fromEntries(
        Object.entries(issues).filter(([key]) => key === 'form' || !UNSAFE_KEYS.has(key))
      );
      formError = errors.form ?? '';
    } else {
      formError = error instanceof Error ? error.message : 'Your response could not be submitted.';
    }
  } finally {
    pending = false;
  }
}

function submitFromButton(event: MouseEvent): Promise<void> {
  event.preventDefault();
  return submit();
}

function submitFromForm(event: SubmitEvent): void {
  event.preventDefault();
  // Button clicks return the promise directly for its pending state. This path
  // also supports Enter-key submission from a text control.
  void submit();
}

function inputValue(field: FormFieldData): string {
  const value = values[field.name];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function onValue(field: FormFieldData, value: string): void {
  setValue(field, value);
}

function setValue(field: FormFieldData, value: unknown): void {
  values[field.name] = value;
  const nextErrors = { ...errors };
  delete nextErrors[field.name];
  errors = nextErrors;
  submitted = false;
}
</script>

<form class={`grid gap-5 ${className}`} onsubmit={submitFromForm} data-py-form={form.id}>
  {#if form.title || form.description}
    <header class="grid gap-1">
      {#if form.title}<h2 class="text-xl font-semibold text-foreground">{form.title}</h2>{/if}
      {#if form.description}<p class="text-sm text-muted-foreground">{form.description}</p>{/if}
    </header>
  {/if}

  {#each form.fields as field (field.name)}
    {#if !UNSAFE_KEYS.has(field.name)}
      <FormField
        label={field.label}
        description={field.help}
        required={field.required}
        error={fieldError(field)}
        data-py-form-field={field.name}
      >
        {#snippet children({ props }: FormFieldControl)}
          {#if field.type === 'longText'}
            <Textarea
              {...props}
              value={inputValue(field)}
              placeholder={field.placeholder}
              maxlength={field.maxLength}
              disabled={pending}
              oninput={(event) => onValue(field, event.currentTarget.value)}
            />
          {:else if field.type === 'boolean'}
            <Checkbox
              {...props}
              checked={values[field.name] === true}
              disabled={pending}
              onclick={() => setValue(field, values[field.name] !== true)}
            />
          {:else if field.type === 'enum'}
            <Select
              {...props}
              items={(field.options ?? []).map((option) => ({ value: option.value, label: option.label }))}
              value={inputValue(field)}
              placeholder={field.placeholder ?? 'Choose an option'}
              disabled={pending}
              onValueChange={(value) => onValue(field, value)}
            />
          {:else}
            <Input
              {...props}
              type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : field.type === 'phone' ? 'tel' : 'text'}
              value={inputValue(field)}
              min={field.type === 'number' ? field.min : undefined}
              max={field.type === 'number' ? field.max : undefined}
              maxlength={field.maxLength}
              placeholder={field.type === 'tags' ? (field.placeholder ?? 'Separate tags with commas') : field.placeholder}
              disabled={pending}
              oninput={(event) => onValue(field, event.currentTarget.value)}
            />
          {/if}
        {/snippet}
      </FormField>
    {/if}
  {/each}

  {#if formError}
    <p class="text-sm text-destructive" role="alert" data-py-form-error>{formError}</p>
  {/if}

  {#if submitted}
    <p class="text-sm text-primary" role="status" data-py-form-success>{form.successMessage}</p>
  {/if}

  <div>
    <Button type="submit" loading={pending} disabled={pending} onclick={submitFromButton}>
      {form.submitLabel}
    </Button>
  </div>
</form>
