<script lang="ts">
import type { FormBlock, FormField } from '@protoyard/ai/messages';
import { Button } from 'texuli/button';
import { Checkbox } from 'texuli/choice';
import { Field } from 'texuli/field';
import { Input, Textarea } from 'texuli/input';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger, SelectValue } from 'texuli/select';
import { type MessageActionHandler, type MessageFormValue, settle } from './types.ts';

/**
 * A form in a message, drawn with Texuli's field, input, select, checkbox and
 * button. Required fields are checked before anything is sent;
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

const locked = $derived(!onAction || pending || submitted);
</script>

<form
  class="grid gap-3 rounded-lg border border-border bg-elevated p-3"
  data-py-message-block="form"
  aria-labelledby="{uid}-heading"
  novalidate
  onsubmit={submit}
>
  <p id="{uid}-heading" class="m-0 text-sm font-semibold">{block.title}</p>
  <fieldset class="m-0 grid gap-3 border-0 p-0" disabled={locked}>
    {#each block.fields as field (field.key)}
      {@const id = `${uid}-field-${field.key}`}
      {@const error = errors[field.key]}
      {#if field.kind === 'checkbox'}
        <div class="grid gap-1">
          <Checkbox
            {id}
            label={field.label}
            required={field.required}
            disabled={locked}
            checked={values[field.key] === true}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onCheckedChange={(checked) => (values[field.key] = checked)}
          />
          {#if error}<p id="{id}-error" class="m-0 text-xs text-destructive">{error}</p>{/if}
        </div>
      {:else if field.kind === 'multiselect'}
        <fieldset class="m-0 grid gap-1 border-0 p-0" aria-describedby={error ? `${id}-error` : undefined}>
          <legend class="mb-1 text-sm font-medium">
            {field.label}{#if field.required}<span aria-hidden="true"> *</span>{/if}
          </legend>
          {#each field.options ?? [] as option, index (option.value)}
            <Checkbox
              id={index === 0 ? id : undefined}
              label={option.label}
              value={option.value}
              disabled={locked}
              checked={((values[field.key] as string[] | null) ?? []).includes(option.value)}
              onCheckedChange={(checked) => setMulti(field.key, option.value, checked)}
            />
          {/each}
          {#if error}<p id="{id}-error" class="m-0 text-xs text-destructive">{error}</p>{/if}
        </fieldset>
      {:else}
        <Field {id} label={field.label} required={field.required} {error}>
          {#snippet children(control)}
            {#if field.kind === 'textarea'}
              <Textarea
                {...control.props}
                class="min-h-20"
                placeholder={field.placeholder}
                required={field.required}
                maxlength={4000}
                disabled={locked}
                value={(values[field.key] as string | null) ?? ''}
                onValueChange={(value) => (values[field.key] = value)}
              />
            {:else if field.kind === 'select'}
              <SelectRoot
                value={(values[field.key] as string | null) ?? ''}
                items={(field.options ?? []).map((option) => ({ value: option.value, label: option.label }))}
                required={field.required}
                disabled={locked}
                onValueChange={(value) => (values[field.key] = value || null)}
              >
                <SelectTrigger {...control.props} disabled={locked} class="w-full">
                  <SelectValue placeholder={field.placeholder ?? 'Choose…'} />
                </SelectTrigger>
                <SelectContent>
                  {#each field.options ?? [] as option (option.value)}
                    <SelectItem value={option.value} label={option.label}>{option.label}</SelectItem>
                  {/each}
                </SelectContent>
              </SelectRoot>
            {:else if field.kind === 'number'}
              <Input
                {...control.props}
                type="number"
                inputmode="decimal"
                placeholder={field.placeholder}
                required={field.required}
                disabled={locked}
                value={values[field.key] === null ? '' : String(values[field.key])}
                onValueChange={(raw) => {
                  const parsed = Number(raw);
                  values[field.key] = raw === '' || !Number.isFinite(parsed) ? null : parsed;
                }}
              />
            {:else}
              <Input
                {...control.props}
                type={field.kind === 'date' ? 'date' : 'text'}
                placeholder={field.placeholder}
                required={field.required}
                maxlength={field.kind === 'text' ? 4000 : undefined}
                disabled={locked}
                value={(values[field.key] as string | null) ?? ''}
                onValueChange={(value) => (values[field.key] = value)}
              />
            {/if}
          {/snippet}
        </Field>
      {/if}
    {/each}
  </fieldset>

  <div class="flex flex-wrap items-center gap-3">
    <!-- Pending follows the host's promise through `submit`, so autoLoading is off. -->
    <Button type="submit" autoLoading={false} loading={pending} disabled={locked}>
      {block.submitLabel ?? 'Submit'}
    </Button>
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
