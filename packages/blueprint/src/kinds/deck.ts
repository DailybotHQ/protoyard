import { type Deck, DeckSchema } from '@protoyard/decks/schema';
import type { z } from 'zod';

/**
 * Deck-wide slide and outline references are enforced by the engine schema. The explicit type keeps
 * the published declarations portable (no inferred reference into another package's zod copy).
 */
export const DeckBodySchema: z.ZodType<Deck> = DeckSchema;
export type DeckBody = Deck;
