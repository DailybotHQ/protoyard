import { z } from 'zod';
import { checkDeckMediaSrc, type DeckMediaKind } from './media.ts';

/** Theme palette tokens a background reads (hex colors, as in every Protoyard theme). */
export interface DeckBackgroundPalette {
  background: string;
  foreground: string;
  surface: string;
  primary: string;
  accent: string;
  muted: string;
  border: string;
  info: string;
  success: string;
  warning: string;
  destructive: string;
}

export const DECK_SOLID_TOKENS = [
  'background',
  'surface',
  'primary',
  'accent',
  'muted',
  'inverse',
] as const;
export type DeckSolidToken = (typeof DECK_SOLID_TOKENS)[number];

export const DECK_GRADIENTS = {
  brand: ['primary', 'info'],
  dusk: ['foreground', 'primary'],
  dawn: ['warning', 'destructive'],
  forest: ['success', 'info'],
  mist: ['muted', 'accent', 'surface'],
} as const satisfies Record<string, readonly (keyof DeckBackgroundPalette)[]>;
export type DeckGradient = keyof typeof DECK_GRADIENTS;
export const DECK_GRADIENT_IDS = Object.keys(DECK_GRADIENTS) as DeckGradient[];

export const DECK_PATTERNS = ['dots', 'grid'] as const;
export type DeckPattern = (typeof DECK_PATTERNS)[number];

export const DECK_BACKGROUND_PRESETS = {
  'solid-color': { kind: 'solid', token: 'background' },
  'solid-surface': { kind: 'solid', token: 'surface' },
  'solid-primary': { kind: 'solid', token: 'primary' },
  'solid-accent': { kind: 'solid', token: 'accent' },
  'solid-muted': { kind: 'solid', token: 'muted' },
  'solid-inverse': { kind: 'solid', token: 'inverse' },
  'gradient-brand': { kind: 'gradient', gradient: 'brand' },
  'gradient-dusk': { kind: 'gradient', gradient: 'dusk' },
  'gradient-dawn': { kind: 'gradient', gradient: 'dawn' },
  'gradient-forest': { kind: 'gradient', gradient: 'forest' },
  'gradient-mist': { kind: 'gradient', gradient: 'mist' },
  'pattern-dots': { kind: 'pattern', pattern: 'dots' },
  'pattern-grid': { kind: 'pattern', pattern: 'grid' },
} as const satisfies Record<string, DeckBackgroundSpec>;
export type DeckBackgroundPresetId = keyof typeof DECK_BACKGROUND_PRESETS;
export const DECK_BACKGROUND_PRESET_IDS = Object.keys(
  DECK_BACKGROUND_PRESETS
) as DeckBackgroundPresetId[];
export const DEFAULT_DECK_BACKGROUND: DeckBackgroundPresetId = 'solid-color';

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
    gradient: z.enum(DECK_GRADIENT_IDS as [DeckGradient, ...DeckGradient[]]),
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
  z.enum(DECK_BACKGROUND_PRESET_IDS as [DeckBackgroundPresetId, ...DeckBackgroundPresetId[]]),
  DeckBackgroundSpecSchema,
]);
export type DeckBackground = z.infer<typeof DeckBackgroundSchema>;
