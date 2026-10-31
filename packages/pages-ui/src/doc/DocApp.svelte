<script lang="ts">
import type { FormBlock } from '@protoyard/blocks';
import { forEachBlock } from '@protoyard/blocks';
import type { PrototypeRuntime } from '@protoyard/core';
import {
  createDocEditServices,
  createFormServices,
  DOC_CAPABILITIES,
  type DocConversionNote,
  type DocDocument,
  type DocEditServices,
  type DocEditsState,
  type FormServices,
} from '@protoyard/pages';
import { liveQuery } from '@protoyard/renderer-svelte';
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
 * Texuli's writers. With a runtime, Apply saves the edits through
 * `createDocEditServices` (the kind runtime's `docEdits` store, per doc and
 * world), so they survive a reload; Reset removes them. Without a runtime
 * (a bare reading view) edits stay in the tab. Saved edits are re-validated
 * on every load; edits made on an earlier version of the doc are not shown.
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

// Saved edits for this doc and world (the kind runtime's docEdits store).
const editStore = $derived.by((): DocEditServices | null =>
  runtime?.db ? createDocEditServices(runtime) : null
);
const saved = liveQuery(
  (): Promise<DocEditsState> | DocEditsState =>
    editStore ? editStore.load(doc) : { status: 'none' },
  { initial: undefined, deps: () => [doc, editStore] }
);

// What this tab applied or reset, tied to the doc it started from: it bridges
// the moment between a write and the store reporting it (or holds the edits
// when there is no store). `doc: null` is a reset.
let local = $state.raw<{ base: DocDocument; doc: DocDocument | null } | null>(null);
let editing = $state(false);
let notes = $state<DocConversionNote[]>([]);
let resetFailure = $state<string | null>(null);

// The store has reported again (a save, a reset, a world reload): it is the truth from here.
$effect(() => {
  void saved.current;
  if (editStore) local = null;
});

const stored = $derived(saved.current?.status === 'saved' ? saved.current.doc : null);
const current = $derived.by((): DocDocument => {
  if (local && local.base === doc) return local.doc ?? doc;
  return stored ?? doc;
});
const edited = $derived(current !== doc);
const unusable = $derived(
  saved.current?.status === 'stale' || saved.current?.status === 'invalid' ? saved.current : null
);
const loadFailed = $derived(editStore !== null && saved.error !== undefined);
// The first read of the store: hold the reading view so saved edits never flash the original.
const reading = $derived(editStore !== null && saved.current === undefined && !loadFailed);
const canEdit = $derived(runtime ? runtime.session.can(DOC_CAPABILITIES.edit) : true);

async function applyEdits(next: DocDocument, conversionNotes: DocConversionNote[]): Promise<void> {
  const result = editStore ? (await editStore.save(doc, next)).doc : next;
  local = { base: doc, doc: result };
  notes = conversionNotes;
  editing = false;
}

async function resetEdits(): Promise<void> {
  resetFailure = null;
  try {
    if (editStore) await editStore.reset(doc);
    local = { base: doc, doc: null };
    notes = [];
  } catch (error) {
    resetFailure = error instanceof Error ? error.message : 'The edits could not be reset.';
  }
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
  {:else if reading}
    <LoadingState label="Loading the document" class="py-16" />
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
        {edited}
        saved={editStore !== null}
        canReset={canEdit && (edited || unusable !== null || loadFailed)}
        onEdit={() => (editing = true)}
        onReset={resetEdits}
      />
    {/if}
    {#if unusable || resetFailure || loadFailed}
      <div class="mx-auto max-w-3xl px-4 pt-3" data-py-doc-saved-notice>
        {#await import('./DocNotice.svelte') then { default: DocNotice }}
          {#if resetFailure}
            <DocNotice tone="error" title="The edits could not be reset" text={resetFailure} />
          {:else if loadFailed}
            <DocNotice
              tone="warning"
              title="Saved edits could not be loaded"
              text="The doc shows its original text. Reload to try again."
            />
          {:else if unusable?.status === 'stale'}
            <DocNotice
              tone="warning"
              title="Saved edits are for an earlier version"
              text="This doc changed since its edits were saved, so they are not shown. Reset to clear them."
            />
          {:else if unusable}
            <DocNotice
              tone="warning"
              title="Saved edits could not be read"
              text="They are not shown. Reset to clear them."
            />
          {/if}
        {/await}
      </div>
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
