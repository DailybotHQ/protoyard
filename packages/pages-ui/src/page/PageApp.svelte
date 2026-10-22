<script lang="ts">
import type { FormBlock } from '@protoyard/blocks';
import { forEachBlock } from '@protoyard/blocks';
import type { PrototypeRuntime } from '@protoyard/core';
import { createFormServices, type FormServices, type PageDocument } from '@protoyard/pages';
import { ErrorState, LoadingState } from '@protoyard/ui';
import { untrack } from 'svelte';
import { setFormServices } from '../form/context.ts';
import PageHost from './PageHost.svelte';

/**
 * Player / generate entry for `kind: "page"`. Mounts PageHost with the shared
 * kind runtime and wires `@protoyard/pages` form services into context.
 */
let {
  page,
  runtime,
  formServices: formServicesProp,
  loading = false,
  error = null,
  onRetry,
  brandName,
  class: className = '',
}: {
  page: PageDocument;
  /** Content-kind runtime from `defineKindRuntime` / `definePrototypeFromPage`. */
  runtime?: PrototypeRuntime | null;
  /** Optional pre-built services (tests); otherwise derived from runtime + forms. */
  formServices?: FormServices | null;
  loading?: boolean;
  error?: string | Error | null;
  onRetry?: () => void | Promise<void>;
  brandName?: string;
  class?: string;
} = $props();

function collectForms(document: PageDocument): FormBlock[] {
  const forms: FormBlock[] = [];
  const seen = new Set<string>();
  for (const section of document.sections) {
    forEachBlock(section.blocks, (block) => {
      if (block.type !== 'form' || !block.id || seen.has(block.id)) return;
      seen.add(block.id);
      forms.push(block);
    });
  }
  return forms;
}

const services = $derived.by((): FormServices | null => {
  if (formServicesProp) return formServicesProp;
  if (!runtime) return null;
  const forms = collectForms(page);
  if (forms.length === 0) return null;
  return createFormServices(runtime, forms, {
    documentId: runtime.manifest.storage.namespace,
  });
});

// Context can only be set while the component initializes (Svelte 5); a page
// and its runtime are fixed for the life of this component, so read them once.
setFormServices(untrack(() => services));

const errorMessage = $derived(
  error instanceof Error ? error.message : typeof error === 'string' ? error : null
);
</script>

<div class={className} data-py-page-app data-page-id={page.id}>
  {#if loading}
    <LoadingState label="Loading the page" class="py-16" />
  {:else if errorMessage}
    <ErrorState
      title="The page could not be loaded"
      message={errorMessage}
      onRetry={onRetry}
      retryLabel="Try again"
    />
  {:else}
    <PageHost {page} {brandName} />
  {/if}
</div>
