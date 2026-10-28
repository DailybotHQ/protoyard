<script lang="ts">
import { isValidationError, runService } from '@protoyard/renderer-svelte';
import { Button, Textarea } from '@protoyard/ui';
import { decodeMentions, encodeMentions } from '@protoyard/views/activity';
import { type Component, onMount } from 'svelte';
import type { ComposerEditorProps, EditorLoader } from './types.ts';

/**
 * Writes or edits one comment. With `loadEditor` the rich editor is fetched
 * when the composer opens; until then (or without it) a textarea is used.
 * What `@`/`#` completion inserts is stored as id tokens.
 */
let {
  label,
  initial = '',
  submitLabel = 'Comment',
  mentions = [],
  references = [],
  loadEditor,
  onSubmit,
  onCancel,
  autofocus = false,
}: {
  label: string;
  /** A stored body to edit (with id tokens). */
  initial?: string;
  submitLabel?: string;
  mentions?: readonly { id: string; value: string; label: string }[];
  references?: readonly { id: string; value: string; label: string }[];
  loadEditor?: EditorLoader;
  /** Saves the encoded body; reject to keep the draft and show why. */
  onSubmit: (body: string) => unknown;
  onCancel?: () => void;
  autofocus?: boolean;
} = $props();

const uid = $props.id();
// svelte-ignore state_referenced_locally
let draft = $state(decodeMentions(initial, { mentions, references }));
let error = $state('');
let Editor = $state<Component<ComposerEditorProps, Record<string, never>, 'value'> | null>(null);
let root = $state<HTMLElement>();

onMount(() => {
  if (loadEditor) {
    void loadEditor()
      .then((component) => {
        Editor = component;
      })
      .catch(() => {
        // Keep the textarea: the comment still works.
      });
  }
  if (autofocus) root?.querySelector<HTMLElement>('textarea')?.focus();
});

async function submit() {
  const body = encodeMentions(draft, { mentions, references }).trim();
  if (!body) {
    error = 'Write something first';
    return;
  }
  error = '';
  // The field clears at once (the thread shows the comment as sending) and refills if saving fails.
  const sent = draft;
  draft = '';
  const result = await runService(() => onSubmit(body));
  if (result.ok) return;
  draft = sent;
  error = isValidationError(result.error)
    ? (result.error.issues.body ?? Object.values(result.error.issues)[0] ?? result.error.message)
    : result.error instanceof Error
      ? result.error.message
      : 'Not saved.';
}
</script>

<div bind:this={root} class="grid gap-2">
  {#if Editor}
    <Editor bind:value={draft} {label} {mentions} {references} rows={3} />
  {:else}
    <label for={`composer-${uid}`} class="sr-only">{label}</label>
    <Textarea
      id={`composer-${uid}`}
      bind:value={draft}
      rows={3}
      maxlength={5000}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `composer-${uid}-error` : undefined}
      class="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      placeholder="Write a comment… use @ to mention someone"
      onkeydown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          void submit();
        } else if (event.key === 'Escape' && onCancel) {
          event.preventDefault();
          onCancel();
        }
      }}
    ></Textarea>
  {/if}
  {#if error}<p id={`composer-${uid}-error`} role="alert" class="text-sm text-destructive">{error}</p>{/if}
  <div class="flex justify-end gap-2">
    {#if onCancel}<Button type="button" variant="ghost" size="sm" onclick={onCancel}>Cancel</Button>{/if}
    <Button type="button" size="sm" disabled={!draft.trim()} onclick={() => submit()}>{submitLabel}</Button>
  </div>
</div>
