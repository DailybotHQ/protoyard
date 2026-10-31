<script lang="ts">
import { setBlockHost } from '@protoyard/blocks-ui';
import { blueprintMotionLevel, deckWithMotionCeiling } from '@protoyard/blueprint';
import { DeckApp } from '@protoyard/decks-ui/app';
import { avatarUrl, getRuntime } from '@protoyard/renderer-svelte';
import { MotionProvider } from 'texuli/motion';
import { customSlides } from './custom-slides.ts';
import { deckBlueprint } from './deck-blueprint.ts';
import { getTemplateDeckStudio } from './deck-studio.ts';
import { mountEmbeddedApp } from './embed-host.ts';

const runtime = getRuntime();
setBlockHost({
  mountEmbed: (target, app) => mountEmbeddedApp(target, app, runtime.manifest.storage.namespace),
});
const studio = getTemplateDeckStudio();
/** blueprint.json `motion.level` caps Texuli's animations and the deck's own `style.motion`. */
const motionLevel = blueprintMotionLevel(deckBlueprint);
const deck = $derived(deckWithMotionCeiling(studio?.preview ?? deckBlueprint.deck, motionLevel));
</script>

<MotionProvider level={motionLevel}>
  <!-- A per-prototype namespace keeps two decks on one origin from sharing presenter state. -->
  <!-- The debug panel's agent reference names this prototype's blueprint (prototypes/<slug>/blueprint.json). -->
  <DeckApp
    {deck}
    namespace={runtime.manifest.storage.namespace}
    {customSlides}
    resolveAvatar={(id) => avatarUrl(id)}
    debugSource={{ kind: 'prototype', value: runtime.manifest.slug }}
  />
</MotionProvider>
