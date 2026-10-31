<script lang="ts">
import type { FormBlock } from '@protoyard/blocks';
import { forEachBlock } from '@protoyard/blocks';
import type { PrototypeRuntime } from '@protoyard/core';
import {
  createFormServices,
  DOC_CAPABILITIES,
  type DocConversionNote,
  type DocDocument,
  type FormServices,
} from '@protoyard/pages';
import { ErrorState, LoadingState } from '@protoyard/ui';
import { untrack } from 'svelte';
import { setFormServices } from '../form/context.ts';
import DocHost from './DocHost.svelte';
import DocTools from './DocTools.svelte';

/**
 * Player / generate entry for `kind: "doc"`. Mounts DocHost with the shared
 * kind runtime and wires form services into context when the doc has forms.
 *
 * With `tools` (default on) it adds the doc tool bar: Edit opens the
 * `@texuli/pages` editor (lazy chunk) for personas with
 * `DOC_CAPABILITIES.edit`, and downloads write Word, PDF or Markdown with
 * Texuli's writers. Edits live in this tab (the kind runtime has no doc
 * store yet); the reading view shows them until reload or reset.
 */
let {
  doc,
  runtime,
  formServices: formServicesProp,
  loading = false,
  error = null,
  onRetry,
  brandName,
  tools = true,
  class: className = '',
}: {
  doc: DocDocument;
  runtime?: PrototypeRuntime | null;
  formServices?: FormServices | null;
  loading?: boolean;
  error?: string | Error | null;
  onRetry?: () => void | Promise<void>;
  brandName?: string;
  /** Show the Edit and Download tool bar (default true). */
  tools?: boolean;
  class?: string;
} = $props();

function collectForms(document: DocDocument): FormBlock[] {
  const forms: FormBlock[] = [];
  const seen = new Set<string>();
  forEachBlock(document.blocks, (block) => {
    if (block.type !== 'form' || !block.id || seen.has(block.id)) return;
    seen.add(block.id);
    forms.push(block);
  });
  return forms;
}

const services = $derived.by((): FormServices | null => {
  if (formServicesProp) return formServicesProp;
  if (!runtime) return null;
  const forms = collectForms(doc);
  if (forms.length === 0) return null;
  return createFormServices(runtime, forms, {
    documentId: runtime.manifest.storage.namespace,
  });
});

// Svelte context must be provided during initialization, before DocHost's
// descendant blocks render and look up their form services.
setFormServices(untrack(() => services));

// Edits made in this tab, tied to the doc they started from: a new `doc`
// prop (another blueprint) drops them.
let edits = $state.raw<{ base: DocDocument; doc: DocDocument } | null>(null);
let editing = $state(false);
let notes = $state<DocConversionNote[]>([]);
const current = $derived(edits && edits.base === doc ? edits.doc : doc);
const canEdit = $derived(runtime ? runtime.session.can(DOC_CAPABILITIES.edit) : true);

function applyEdits(next: DocDocument, conversionNotes: DocConversionNote[]): void {
  edits = { base: doc, doc: next };
  notes = conversionNotes;
  editing = false;
}

function resetEdits(): void {
  edits = null;
  notes = [];
}

const errorMessage = $derived(
  error instanceof Error ? error.message : typeof error === 'string' ? error : null
);
</script>

<div class={className} data-py-doc-app data-doc-id={doc.id}>
  {#if loading}
    <LoadingState label="Loading the document" class="py-16" />
  {:else if errorMessage}
    <ErrorState
      title="The document could not be loaded"
      message={errorMessage}
      onRetry={onRetry}
      retryLabel="Try again"
    />
  {:else if editing}
    {#await import('./DocEditor.svelte')}
      <LoadingState label="Loading the editor" class="py-16" />
    {:then { default: DocEditor }}
      <DocEditor doc={current} onApply={applyEdits} onCancel={() => (editing = false)} />
    {:catch}
      <ErrorState
        title="The editor could not be loaded"
        message="Check the connection and try again."
        onRetry={() => {
          editing = false;
        }}
        retryLabel="Back to reading"
      />
    {/await}
  {:else}
    {#if tools}
      <DocTools
        doc={current}
        {canEdit}
        edited={edits !== null && edits.base === doc}
        onEdit={() => (editing = true)}
        onReset={resetEdits}
      />
    {/if}
    {#if notes.length > 0}
      <div class="mx-auto max-w-3xl px-4 pt-3" data-py-doc-edit-notes>
        {#await import('./DocNotice.svelte') then { default: DocNotice }}
          <DocNotice
            tone="warning"
            title="Some edits have no doc equivalent"
            text={notes.map((note) => note.message).join(' ')}
          />
        {/await}
      </div>
    {/if}
    <DocHost doc={current} {brandName} />
  {/if}
</div>
