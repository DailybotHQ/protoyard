<script lang="ts">
import { isValidationError } from '@protoyard/renderer-svelte';
import { AlertDialog, Button } from '@protoyard/ui';
import { cx } from 'texuli/cx';
import { guardHashNavigation } from './guard.ts';
import type { FieldErrors } from './types.ts';

interface Props {
  /** True while the form differs from what is saved. */
  dirty: boolean;
  /**
   * Saves the form, usually `() => runService(() => services.updateSettings(draft))`.
   * A failed `runService` result with validation issues fills `errors`; the
   * returned promise drives the Save button's spinner.
   */
  onSave: () => unknown;
  /** Puts the form back to the saved values. */
  onDiscard: () => void;
  /** Field errors from the last save, by field name (bind it to show them next to fields). */
  errors?: FieldErrors;
  /** Human names for error keys in the summary (default: the key). */
  fieldLabels?: Record<string, string>;
  /** Ask before leaving the screen while dirty (default true). */
  guard?: boolean;
  message?: string;
  saveLabel?: string;
  discardLabel?: string;
  class?: string;
}

let {
  dirty,
  onSave,
  onDiscard,
  errors = $bindable({}),
  fieldLabels = {},
  guard = true,
  message = 'You have unsaved changes.',
  saveLabel = 'Save changes',
  discardLabel = 'Discard',
  class: className,
}: Props = $props();

let saving = $state(false);
let leaveOpen = $state(false);
let blocked: { proceed: () => void } | null = null;
const errorList = $derived(Object.entries(errors));

function isFailure(value: unknown): value is { ok: false; error: unknown } {
  return typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === false;
}

async function save() {
  saving = true;
  errors = {};
  try {
    const result = await onSave();
    if (isFailure(result) && isValidationError(result.error)) errors = { ...result.error.issues };
  } finally {
    saving = false;
  }
}

function discard() {
  errors = {};
  onDiscard();
}

$effect(() => {
  if (!guard) return;
  return guardHashNavigation({
    isDirty: () => dirty,
    onBlocked: (attempt) => {
      blocked = attempt;
      leaveOpen = true;
    },
  });
});
</script>

{#if dirty || errorList.length > 0}
  <div
    role="region"
    aria-label="Unsaved changes"
    class={cx(
      'sticky bottom-0 z-10 mt-6 flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-float sm:flex-row sm:items-center sm:justify-between',
      className
    )}
  >
    <div class="min-w-0 text-sm">
      <p aria-live="polite">{dirty ? message : 'Some fields need attention.'}</p>
      {#if errorList.length > 0}
        <ul role="alert" class="mt-1 list-disc pl-5 text-destructive">
          {#each errorList as [field, text] (field)}
            <li>{fieldLabels[field] ?? field}: {text}</li>
          {/each}
        </ul>
      {/if}
    </div>
    <div class="flex shrink-0 gap-2">
      <Button variant="ghost" disabled={saving || !dirty} onclick={discard}>{discardLabel}</Button>
      <Button disabled={!dirty} onclick={() => save()}>{saveLabel}</Button>
    </div>
  </div>
{/if}

<AlertDialog
  bind:open={leaveOpen}
  title="Leave without saving?"
  description="Your changes on this page will be lost."
  confirmLabel="Discard and leave"
  cancelLabel="Keep editing"
  destructive
  onConfirm={() => {
    discard();
    const attempt = blocked;
    blocked = null;
    attempt?.proceed();
  }}
  onCancel={() => {
    blocked = null;
  }}
/>
