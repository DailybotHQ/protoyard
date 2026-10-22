<script lang="ts">
import { setBlockHost } from '@protoyard/blocks-ui';
import { DeckApp } from '@protoyard/decks-ui/app';
import { getRuntime } from '@protoyard/renderer-svelte';
import { deckBlueprint } from './deck-blueprint.ts';
import { getTemplateDeckStudio } from './deck-studio.ts';
import { mountEmbeddedApp } from './embed-host.ts';

const runtime = getRuntime();
setBlockHost({
  mountEmbed: (target, app) => mountEmbeddedApp(target, app, runtime.manifest.storage.namespace),
});
const studio = getTemplateDeckStudio();
const deck = $derived(studio?.preview ?? deckBlueprint.deck);
</script>

<DeckApp {deck} />
