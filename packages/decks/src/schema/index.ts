import { z } from 'zod';
import { DECK_ASPECTS } from '../canvas.ts';

/**
 * `@protoyard/decks/schema`: the zod schemas for deck documents, imported by
 * the blueprint `kind` union (ADR-036, ADR-038) without Svelte. The full
 * DeckSchema arrives with T-decks-schema; the aspect enum is fixed by ADR-038.
 */
export const DeckAspectSchema = z.enum(DECK_ASPECTS);
