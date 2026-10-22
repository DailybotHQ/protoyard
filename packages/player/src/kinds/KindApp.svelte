<script lang="ts">
import { setBlockHost } from '@protoyard/blocks-ui';
import { getRuntime } from '@protoyard/renderer-svelte';
import { ErrorState, LoadingState } from '@protoyard/ui';
import { createDeferredStateHost } from './deferred-host.ts';
import { kindApp } from './state.ts';

/**
 * The player's app for decks, pages and docs: the shared kind renderer
 * (decks-ui `DeckApp`, pages-ui `PageApp` / `DocApp`, the same components a
 * generated kind prototype mounts) inside the kind runtime. It provides the
 * blocks-ui host: interactive block state persisted through the kind services
 * (`createKindServices`: session.assert → reducer → environment.run →
 * db.transaction) and `mountEmbed` for embed-app blocks. Each renderer loads
 * as its own chunk.
 */
const { blueprint, namespace, mountEmbed, studio } = kindApp();
const runtime = getRuntime();

const stateHost = createDeferredStateHost(
  import('@protoyard/blueprint/kinds').then(({ createKindServices }) =>
    createKindServices(runtime, blueprint, { documentId: namespace })
  )
);
setBlockHost({
  stateHost,
  mountEmbed,
  documentId: namespace,
  canvasMode: blueprint.kind === 'deck' ? 'slide' : 'flow',
});

let attempt = $state(0);
const view = $derived.by(() => {
  void attempt;
  if (blueprint.kind === 'deck') {
    return Promise.all([import('./content.css'), import('@protoyard/decks-ui/app')]).then(
      ([, module]) => module
    );
  }
  if (blueprint.kind === 'page') {
    return Promise.all([import('./content.css'), import('@protoyard/pages-ui/page')]).then(
      ([, module]) => module
    );
  }
  return Promise.all([import('./content.css'), import('@protoyard/pages-ui/doc')]).then(
    ([, module]) => module
  );
});
const what = blueprint.kind === 'deck' ? 'deck' : blueprint.kind === 'page' ? 'page' : 'document';
</script>

{#await view}
  <LoadingState label={`Loading the ${what}`} class="py-16" />
{:then module}
  {#if blueprint.kind === 'deck' && 'DeckApp' in module}
    <module.DeckApp deck={studio?.preview ?? blueprint.deck} {namespace} />
  {:else if blueprint.kind === 'page' && 'PageApp' in module}
    <module.PageApp page={blueprint.page} {runtime} />
  {:else if blueprint.kind === 'doc' && 'DocApp' in module}
    <module.DocApp doc={blueprint.doc} {runtime} />
  {/if}
{:catch error}
  <ErrorState
    title={`The ${what} could not be loaded`}
    message={error instanceof Error ? error.message : String(error)}
    onRetry={() => {
      attempt += 1;
    }}
    retryLabel="Try again"
  />
{/await}
