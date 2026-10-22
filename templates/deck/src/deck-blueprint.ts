import type { DeckBlueprint } from '@protoyard/blueprint';
import rawBlueprint from './blueprint.json';

/** The CLI validates this source document against the deck blueprint schema. */
export const deckBlueprint = rawBlueprint as DeckBlueprint;
