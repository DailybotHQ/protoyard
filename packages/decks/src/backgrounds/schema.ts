import {
  DECK_BACKGROUND_PRESET_IDS,
  DECK_BACKGROUND_PRESETS,
  DECK_GRADIENT_IDS,
  DECK_GRADIENTS,
  DECK_PATTERNS,
  DECK_SOLID_TOKENS,
  DEFAULT_DECK_BACKGROUND,
  type DeckBackgroundPalette,
  type DeckBackgroundPresetId,
  type DeckGradient,
  type DeckPattern,
  type DeckSolidToken,
} from '@texuli/deck/model';
import { z } from 'zod';
import { checkDeckMediaSrc, type DeckMediaKind } from './media.ts';

/*
 * The 13 presets, the solid tokens, the gradients and patterns are the deck
 * model's (`@texuli/deck/model`); the resolver and its contrast math too.
 * Protoyard keeps this zod schema for its deck shape (blueprints, JSON
 * Schema) and its offline media policy (`checkDeckMediaSrc`).
 */
export {
  DECK_BACKGROUND_PRESET_IDS,
  DECK_BACKGROUND_PRESETS,
  DECK_GRADIENT_IDS,
  DECK_GRADIENTS,
  DECK_PATTERNS,
  DECK_SOLID_TOKENS,
  DEFAULT_DECK_BACKGROUND,
  type DeckBackgroundPalette,
  type DeckBackgroundPresetId,
  type DeckGradient,
  type DeckPattern,
  type DeckSolidToken,
};

const mediaSrc = (kind: DeckMediaKind) =>
  z.string().superRefine((value, ctx) => {
    const check = checkDeckMediaSrc(value, kind);
    if (!check.ok) ctx.addIssue({ code: 'custom', message: check.reason });
  });

const mediaShape = {
  tone: z.enum(['dark', 'light']).optional(),
  overlay: z.number().min(0).max(0.9).optional(),
  position: z.enum(['center', 'top', 'bottom', 'left', 'right']).optional(),
};

/** A validated preset or local media background specification. */
export const DeckBackgroundSpecSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('solid'), token: z.enum(DECK_SOLID_TOKENS).optional() }),
  z.strictObject({
    kind: z.literal('gradient'),
    gradient: z.enum(DECK_GRADIENT_IDS as unknown as [DeckGradient, ...DeckGradient[]]),
    angle: z.number().int().min(0).max(359).optional(),
  }),
  z.strictObject({ kind: z.literal('pattern'), pattern: z.enum(DECK_PATTERNS) }),
  z.strictObject({
    kind: z.enum(['image', 'image-full']),
    src: mediaSrc('image'),
    alt: z.string().max(200).optional(),
    fit: z.enum(['cover', 'contain']).optional(),
    ...mediaShape,
  }),
  z.strictObject({
    kind: z.enum(['video', 'video-full']),
    src: mediaSrc('video'),
    poster: mediaSrc('image').optional(),
    ...mediaShape,
  }),
]);
export type DeckBackgroundSpec = z.infer<typeof DeckBackgroundSpecSchema>;

export const DeckBackgroundSchema = z.union([
  z.enum(
    DECK_BACKGROUND_PRESET_IDS as unknown as [DeckBackgroundPresetId, ...DeckBackgroundPresetId[]]
  ),
  DeckBackgroundSpecSchema,
]);
export type DeckBackground = z.infer<typeof DeckBackgroundSchema>;
