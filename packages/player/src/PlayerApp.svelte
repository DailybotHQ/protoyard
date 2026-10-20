<script lang="ts">
import { ErrorState, LoadingState } from '@protoyard/ui';
import { playerBlueprint } from './player-blueprint.ts';

const { blueprint, model } = playerBlueprint();

/**
 * The app shell (entity pages, data tables, forms, navigation) loads as its
 * own chunk, so the initial download is the runtime and the boot path only.
 */
let attempt = $state(0);
const shell = $derived.by(() => {
  void attempt;
  return import('@protoyard/crud/app');
});
const conversational = $derived.by(() => {
  const archetype = blueprint.archetype?.id;
  return archetype === 'assistant' || archetype === 'team-chat'
    ? import('./archetypes/conversational/index.ts')
    : null;
});

/** Theme library choices for the settings screen, loaded only when it opens. */
async function themeLibrary() {
  const { THEME_LIBRARY_META } = await import('@protoyard/themes/library');
  return THEME_LIBRARY_META.map(({ id, name }) => ({ id, name }));
}
</script>

{#await shell}
  <LoadingState label="Loading the prototype" class="py-16" />
{:then { BlueprintApp }}
  {#if conversational === null}
    <BlueprintApp {blueprint} {model} {themeLibrary} />
  {:else}
    {#await conversational then { ConversationalApp }}
      <ConversationalApp {blueprint} />
    {:catch error}
      <ErrorState
        title="The conversational archetype could not be loaded"
        message={error instanceof Error ? error.message : String(error)}
        onRetry={() => {
          attempt += 1;
        }}
        retryLabel="Try again"
      />
    {/await}
  {/if}
{:catch error}
  <ErrorState
    title="The prototype could not be loaded"
    message={error instanceof Error ? error.message : String(error)}
    onRetry={() => {
      attempt += 1;
    }}
    retryLabel="Try again"
  />
{/await}
