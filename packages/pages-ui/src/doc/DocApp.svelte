<script lang="ts">
import type { FormBlock } from '@protoyard/blocks';
import { forEachBlock } from '@protoyard/blocks';
import type { PrototypeRuntime } from '@protoyard/core';
import { createFormServices, type DocDocument, type FormServices } from '@protoyard/pages';
import { ErrorState, LoadingState } from '@protoyard/ui';
import { setFormServices } from '../form/context.ts';
import DocHost from './DocHost.svelte';

/**
 * Player / generate entry for `kind: "doc"`. Mounts DocHost with the shared
 * kind runtime and wires form services into context when the doc has forms.
 */
let {
  doc,
  runtime,
  formServices: formServicesProp,
  loading = false,
  error = null,
  onRetry,
  brandName,
  class: className = '',
}: {
  doc: DocDocument;
  runtime?: PrototypeRuntime | null;
  formServices?: FormServices | null;
  loading?: boolean;
  error?: string | Error | null;
  onRetry?: () => void | Promise<void>;
  brandName?: string;
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

$effect(() => {
  setFormServices(services);
});

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
  {:else}
    <DocHost {doc} {brandName} />
  {/if}
</div>
