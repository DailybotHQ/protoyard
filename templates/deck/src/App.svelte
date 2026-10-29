<script lang="ts">
import { setBlockHost } from '@protoyard/blocks-ui';
import { DeckApp } from '@protoyard/decks-ui/app';
import { avatarUrl, getRuntime } from '@protoyard/renderer-svelte';
import { customSlides } from './custom-slides.ts';
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

<!-- A per-prototype namespace keeps two decks on one origin from sharing presenter state. -->
<!-- The debug panel's agent reference names this prototype's blueprint (prototypes/<slug>/blueprint.json). -->
<DeckApp
  {deck}
  namespace={runtime.manifest.storage.namespace}
  {customSlides}
  resolveAvatar={(id) => avatarUrl(id)}
  debugSource={{ kind: 'prototype', value: runtime.manifest.slug }}
/>
