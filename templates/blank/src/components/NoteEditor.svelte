<script lang="ts">
import { isValidationError, runService } from '@protoyard/renderer-svelte';
import { Button, Checkbox, Dialog, FormField, Input, Textarea } from '@protoyard/ui';
import type { Note } from '../database/schema.ts';
import { notesService } from '../lib/services.ts';

/** Create (no `note`) or edit dialog. Validation errors render inline; others toast. */
let {
  open = $bindable(false),
  note = null,
  onsaved,
}: { open?: boolean; note?: Note | null; onsaved?: (note: Note | null) => void } = $props();

let title = $state('');
let body = $state('');
let pinned = $state(false);
let errors = $state<Record<string, string>>({});
let saving = $state(false);

// Reset the form each time the dialog opens.
$effect(() => {
  if (open) {
    title = note?.title ?? '';
    body = note?.body ?? '';
    pinned = note?.pinned ?? false;
    errors = {};
  }
});

async function submit(event: SubmitEvent) {
  event.preventDefault();
  saving = true;
  const input = { title, body, pinned };
  const result = await runService(
    () =>
      note
        ? notesService()
            .update(note.id, input)
            .then(() => null)
        : notesService().create(input),
    { success: note ? 'Note saved' : 'Note created' }
  );
  saving = false;
  if (result.ok) {
    open = false;
    onsaved?.(result.value);
  } else if (isValidationError(result.error)) {
    errors = result.error.issues;
  }
}
</script>

<Dialog bind:open title={note ? 'Edit note' : 'New note'} description="Notes are stored in this browser only.">
  <form id="note-form" class="space-y-4" onsubmit={submit} novalidate>
    <FormField label="Title" required error={errors.title}>
      {#snippet children(control)}
        <Input
          id={control.id}
          aria-describedby={control.describedBy}
          aria-invalid={control.invalid}
          maxlength={120}
          autocomplete="off"
          bind:value={title}
        />
      {/snippet}
    </FormField>
    <FormField label="Body" description="Plain text, up to 5000 characters." error={errors.body}>
      {#snippet children(control)}
        <Textarea
          id={control.id}
          aria-describedby={control.describedBy}
          aria-invalid={control.invalid}
          rows={6}
          bind:value={body}
        />
      {/snippet}
    </FormField>
    <label class="inline-flex min-h-touch items-center gap-2 text-sm sm:min-h-0">
      <Checkbox class="size-4" bind:checked={pinned} />
      Pin to the top
    </label>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button type="submit" form="note-form" loading={saving}>{note ? 'Save changes' : 'Create note'}</Button>
  {/snippet}
</Dialog>
