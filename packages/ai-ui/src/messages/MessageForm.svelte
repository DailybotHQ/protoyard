<script lang="ts">
import { LoaderCircle } from '@lucide/svelte';
import type { FormBlock, FormField } from '@protoyard/ai/messages';
import { type MessageActionHandler, type MessageFormValue, settle } from './types.ts';

/**
 * A form in a message. Required fields are checked before anything is sent;
 * a submission reports `{ kind: 'form', values }` with typed values (strings,
 * numbers, booleans, string lists or null), stays busy while the host works,
 * shows the host's error and keeps the input on failure, and locks with
 * "Submitted" once it succeeds.
 */
let {
  block,
  blockIndex,
  messageId,
  onAction,
}: {
  block: FormBlock;
  blockIndex: number;
  messageId: string | null;
  onAction?: MessageActionHandler;
} = $props();

const uid = $props.id();

function initialValue(field: FormField): MessageFormValue {
  const initial = field.initial;
  switch (field.kind) {
    case 'checkbox':
      return typeof initial === 'boolean' ? initial : false;
    case 'number':
      return typeof initial === 'number' ? initial : null;
    case 'multiselect':
      return Array.isArray(initial) ? [...initial] : [];
    case 'select':
      return typeof initial === 'string' ? initial : null;
    default:
      return typeof initial === 'string' ? initial : '';
  }
}

// The block is fixed for this component's life; initial values only seed the inputs.
// svelte-ignore state_referenced_locally
let values = $state<Record<string, MessageFormValue>>(
  Object.fromEntries(block.fields.map((field) => [field.key, initialValue(field)]))
);
let errors = $state<Record<string, string>>({});
let pending = $state(false);
let failure = $state('');
let submitted = $state(false);

function isEmpty(value: MessageFormValue): boolean {
  return value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

function validate(): boolean {
  const next: Record<string, string> = {};
  for (const field of block.fields) {
    const value = values[field.key] ?? null;
    if (field.kind === 'checkbox') {
      if (field.required && value !== true) next[field.key] = `${field.label} must be checked.`;
    } else if (field.required && isEmpty(value)) {
      next[field.key] = `${field.label} is required.`;
    }
  }
  errors = next;
  return Object.keys(next).length === 0;
}

async function submit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (!onAction || pending || submitted) return;
  if (!validate()) {
    const first = block.fields.find((field) => errors[field.key]);
    if (first) document.getElementById(`${uid}-field-${first.key}`)?.focus();
    return;
  }
  pending = true;
  failure = '';
  const payload = $state.snapshot(values) as Record<string, MessageFormValue>;
  const problem = await settle(() =>
    onAction({ kind: 'form', messageId, blockIndex, action: block.action, values: payload })
  );
  pending = false;
  if (problem) failure = problem;
  else submitted = true;
}

function setMulti(key: string, value: string, checked: boolean): void {
  const current = (values[key] as string[] | null) ?? [];
  values[key] = checked ? [...current, value] : current.filter((v) => v !== value);
}

const control =
  'min-h-touch w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 aria-[invalid=true]:border-destructive sm:min-h-9';
</script>

<form
  class="grid gap-3 rounded-lg border border-border bg-elevated p-3"
  data-py-message-block="form"
  aria-labelledby="{uid}-heading"
  novalidate
  onsubmit={submit}
>
  <p id="{uid}-heading" class="m-0 text-sm font-semibold">{block.title}</p>
  <fieldset class="m-0 grid gap-3 border-0 p-0" disabled={!onAction || pending || submitted}>
    {#each block.fields as field (field.key)}
      {@const id = `${uid}-field-${field.key}`}
      {@const error = errors[field.key]}
      {#if field.kind === 'checkbox'}
        <div class="grid gap-1">
          <label class="flex items-center gap-2 text-sm">
            <input
              {id}
              type="checkbox"
              class="size-4 accent-primary"
              checked={values[field.key] === true}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              onchange={(event) => (values[field.key] = event.currentTarget.checked)}
            />
            {field.label}{#if field.required}<span aria-hidden="true"> *</span>{/if}
          </label>
          {#if error}<p id="{id}-error" class="m-0 text-xs text-destructive">{error}</p>{/if}
        </div>
      {:else if field.kind === 'multiselect'}
        <fieldset class="m-0 grid gap-1 border-0 p-0" aria-describedby={error ? `${id}-error` : undefined}>
          <legend class="mb-1 text-sm font-medium">
            {field.label}{#if field.required}<span aria-hidden="true"> *</span>{/if}
          </legend>
          {#each field.options ?? [] as option, index (option.value)}
            <label class="flex items-center gap-2 text-sm">
              <input
                id={index === 0 ? id : undefined}
                type="checkbox"
                class="size-4 accent-primary"
                checked={((values[field.key] as string[] | null) ?? []).includes(option.value)}
                onchange={(event) => setMulti(field.key, option.value, event.currentTarget.checked)}
              />
              {option.label}
            </label>
          {/each}
          {#if error}<p id="{id}-error" class="m-0 text-xs text-destructive">{error}</p>{/if}
        </fieldset>
      {:else}
        <div class="grid gap-1">
          <label class="text-sm font-medium" for={id}>
            {field.label}{#if field.required}<span aria-hidden="true"> *</span>{/if}
          </label>
          {#if field.kind === 'textarea'}
            <textarea
              {id}
              class="{control} min-h-20 py-2"
              placeholder={field.placeholder}
              required={field.required}
              maxlength={4000}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              value={(values[field.key] as string | null) ?? ''}
              oninput={(event) => (values[field.key] = event.currentTarget.value)}
            ></textarea>
          {:else if field.kind === 'select'}
            <select
              {id}
              class={control}
              required={field.required}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              value={(values[field.key] as string | null) ?? ''}
              onchange={(event) => (values[field.key] = event.currentTarget.value || null)}
            >
              <option value="">{field.placeholder ?? 'Choose…'}</option>
              {#each field.options ?? [] as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          {:else if field.kind === 'number'}
            <input
              {id}
              type="number"
              inputmode="decimal"
              class={control}
              placeholder={field.placeholder}
              required={field.required}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              value={(values[field.key] as number | null) ?? ''}
              oninput={(event) => {
                const raw = event.currentTarget.value;
                const parsed = Number(raw);
                values[field.key] = raw === '' || !Number.isFinite(parsed) ? null : parsed;
              }}
            />
          {:else}
            <input
              {id}
              type={field.kind === 'date' ? 'date' : 'text'}
              class={control}
              placeholder={field.placeholder}
              required={field.required}
              maxlength={field.kind === 'text' ? 4000 : undefined}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              value={(values[field.key] as string | null) ?? ''}
              oninput={(event) => (values[field.key] = event.currentTarget.value)}
            />
          {/if}
          {#if error}<p id="{id}-error" class="m-0 text-xs text-destructive">{error}</p>{/if}
        </div>
      {/if}
    {/each}
  </fieldset>

  <div class="flex flex-wrap items-center gap-3">
    <button
      type="submit"
      class="inline-flex min-h-touch items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9"
      disabled={!onAction || pending || submitted}
      aria-busy={pending ? 'true' : undefined}
    >
      {#if pending}<LoaderCircle class="size-3.5 motion-safe:animate-spin" aria-hidden="true" />{/if}
      {block.submitLabel ?? 'Submit'}
    </button>
    <p class="m-0 text-xs text-muted-foreground" role="status" aria-live="polite">
      {#if pending}Sending…{:else if submitted}Submitted.{/if}
    </p>
  </div>
  {#if !onAction}
    <p class="m-0 text-xs text-muted-foreground">This form cannot be sent from this view.</p>
  {/if}
  {#if failure}
    <p class="m-0 text-xs text-destructive" role="alert">{failure}</p>
  {/if}
</form>
