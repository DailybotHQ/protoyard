import { type Deck, DeckSchema } from '@protoyard/decks/schema';

/** Deck-wide slide and outline references are enforced by the engine schema. */
export const DeckBodySchema = DeckSchema;
export type DeckBody = Deck;
