<script lang="ts">
import { setBlockHost } from '@protoyard/blocks-ui';
import { blueprintMotionLevel, deckWithMotionCeiling } from '@protoyard/blueprint';
import { avatarUrl, getRuntime } from '@protoyard/renderer-svelte';
import { ErrorState, LoadingState } from '@protoyard/ui';
import { MotionProvider } from 'texuli/motion';
import { deckDebugSource } from './debug-source.ts';
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
const { blueprint, namespace, mountEmbed, studio, draft } = kindApp();
const runtime = getRuntime();
/**
 * The blueprint's `motion.level` caps every Texuli animation below, and a
 * deck's own `style.motion` (slide transitions and fragments) with it.
 */
const motionLevel = blueprintMotionLevel(blueprint);

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
  // The kind services record poll votes and quiz answers under the active
  // persona; blocks must read "mine" as the same viewer, or a saved vote never
  // shows as the viewer's own. Read at use, so a persona switch follows.
  get viewerId() {
    return runtime.session.principal()?.persona.id ?? 'viewer';
  },
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
const deck = $derived(
  blueprint.kind === 'deck'
    ? deckWithMotionCeiling(studio?.preview ?? blueprint.deck, motionLevel)
    : null
);
const what = blueprint.kind === 'deck' ? 'deck' : blueprint.kind === 'page' ? 'page' : 'document';
</script>

<MotionProvider level={motionLevel}>
  {#if draft}
    <!-- Progressive painting (quick serve): the blueprint is still arriving. -->
    <p
      role="status"
      data-py-draft=""
      style="position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:40;margin:0;padding:2px 12px;border:1px solid var(--tx-border);border-radius:99px;background:var(--tx-muted);color:var(--tx-foreground);font-size:13px;pointer-events:none"
    >
      Receiving the {what}: showing the part that has arrived so far.
    </p>
  {/if}
  {#await view}
    <LoadingState label={`Loading the ${what}`} class="py-16" />
  {:then module}
    {#if blueprint.kind === 'deck' && 'DeckApp' in module}
      <module.DeckApp
        deck={deck ?? blueprint.deck}
        {namespace}
        resolveAvatar={(id: string) => avatarUrl(id)}
        debugSource={deckDebugSource(location.search, namespace)}
      />
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
</MotionProvider>
