<script lang="ts">
import { ErrorState, LoadingState } from '@protoyard/ui';
import { blueprint } from './generated/blueprint.ts';

/**
 * The shared blueprint app shell (@protoyard/crud/app), the same one the player
 * runs. It loads as its own chunk, so the first download stays small. This file
 * is yours: pass `home`, `extraRoutes`, `recordHref` or an `actions` snippet
 * to BlueprintApp to customize the app.
 */
let attempt = $state(0);
const shell = $derived.by(() => {
  void attempt;
  return import('@protoyard/crud/app');
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
  <BlueprintApp {blueprint} {themeLibrary} />
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

<style>
  :global([data-board-card] .text-muted-foreground) {
    color: var(--tx-primary-foreground);
  }
</style>
