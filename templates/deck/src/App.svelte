<script lang="ts">
import { DeckApp } from '@protoyard/decks-ui/app';
import { deckBlueprint } from './deck-blueprint.ts';
import { getTemplateDeckStudio } from './deck-studio.ts';

const studio = getTemplateDeckStudio();
const deck = $derived(studio?.preview ?? deckBlueprint.deck);
</script>

<DeckApp {deck} />
