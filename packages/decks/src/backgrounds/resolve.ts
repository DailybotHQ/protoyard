import { z } from 'zod';
import { chooseInk, opaqueColor, sampleGradient } from './contrast.ts';
import { checkDeckMediaSrc, type DeckMediaKind } from './media.ts';

/**
 * Slide backgrounds (ported from the developer's site: solid, gradient,
 * image, full-screen image, video, full-screen video, pattern). Every
 * background resolves to a text tone, light or dark, whose body text reaches
 * WCAG AA (4.5:1) against everything behind it: gradients are checked at
 * their stops and in between, media at the worst possible pixel (pure black
 * or pure white), and when the background alone is not enough a scrim is
 * added at the lowest alpha that works. Images and video default to light
 * text over a dark scrim, as on the site; `tone: "light"` declares a light
 * image (dark text over a light scrim).
 *
 * Colors come only from the theme palette and from numbers computed here, so
 * no author string ever reaches CSS. Iframe backgrounds are not a level-1
 * mode: the artifact CSP blocks third-party frames.
 */

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

/** Five gradients, each two or three theme tokens. */
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

/** Named presets a deck or slide can reference by id (`style.background`, `slide.background`). */
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
  /** Declares the media's own brightness: `dark` (default) gets light text, `light` dark text. */
  tone: z.enum(['dark', 'light']).optional(),
  /** A stronger scrim than the computed minimum (0–0.9). Never weaker. */
  overlay: z.number().min(0).max(0.9).optional(),
  position: z.enum(['center', 'top', 'bottom', 'left', 'right']).optional(),
};

/** A background spec: a preset, or media with its source checked by `checkDeckMediaSrc`. */
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
    /** Describes the image when it carries meaning; omit for decoration. */
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

/** A preset id or a spec. */
export const DeckBackgroundSchema = z.union([
  z.enum(DECK_BACKGROUND_PRESET_IDS as [DeckBackgroundPresetId, ...DeckBackgroundPresetId[]]),
  DeckBackgroundSpecSchema,
]);
export type DeckBackground = z.infer<typeof DeckBackgroundSchema>;

export interface ResolvedDeckBackground {
  kind: DeckBackgroundSpec['kind'];
  /** The preset id, when the background came from one. */
  preset?: DeckBackgroundPresetId;
  /** `light` text (the site's white-on-dark rule) or `dark` text (`.has-light-background`). */
  textTone: 'light' | 'dark';
  textColor: string;
  /** Worst-case contrast of `textColor` over the background and its overlay (≥ 4.5). */
  contrast: number;
  /** A flat color (solid and pattern bases, and behind media while it loads). */
  color: string;
  gradient?: { angle: number; stops: string[] };
  pattern?: { kind: DeckPattern; ink: string };
  media?: {
    type: 'image' | 'video';
    src: string;
    full: boolean;
    alt?: string;
    poster?: string;
    fit: 'cover' | 'contain';
    position: 'center' | 'top' | 'bottom' | 'left' | 'right';
    /** Background video is always muted, looping, inline and without controls (iOS autoplay). */
    muted?: true;
    autoplay?: true;
    loop?: true;
    playsInline?: true;
  };
  overlay: { color: string; alpha: number } | null;
  /** CSS custom properties built only from computed colors (no author strings). */
  variables: Record<string, string>;
  /** Set when an unknown preset id fell back to the default. */
  warning?: string;
}

const LIGHT_INK = '#ffffff';
/** Any pixel of an image or video: the scrim must hold against both extremes. */
const ANY_PIXEL = ['#000000', '#ffffff'];

/** Every token as an opaque hex over the page background (dark-mode borders carry alpha). */
function normalizePalette(palette: DeckBackgroundPalette): DeckBackgroundPalette {
  const base = opaqueColor(palette.background, '#ffffff');
  const out = { ...palette };
  for (const key of Object.keys(out) as (keyof DeckBackgroundPalette)[]) {
    out[key] = opaqueColor(String(palette[key]), base);
  }
  return out;
}

function darkInk(palette: DeckBackgroundPalette): string {
  // The darker of the two text-bearing tokens, so dark text stays on-theme in either mode.
  const lum = (hex: string) => {
    const n = Number.parseInt(hex.slice(1), 16);
    return ((n >> 16) & 255) * 0.2126 + ((n >> 8) & 255) * 0.7152 + (n & 255) * 0.0722;
  };
  return lum(palette.foreground) <= lum(palette.background)
    ? palette.foreground
    : palette.background;
}

function solidColor(token: DeckSolidToken, palette: DeckBackgroundPalette): string {
  return token === 'inverse' ? palette.foreground : palette[token];
}

/**
 * Resolves a background against a theme palette (the mode the deck renders
 * in). Pass a value that already passed `DeckBackgroundSchema`; an unknown
 * preset id falls back to `solid-color` with a warning instead of throwing.
 */
export function resolveDeckBackground(
  input: DeckBackground | string | undefined,
  themePalette: DeckBackgroundPalette
): ResolvedDeckBackground {
  const palette = normalizePalette(themePalette);
  let warning: string | undefined;
  let preset: DeckBackgroundPresetId | undefined;
  let spec: DeckBackgroundSpec;
  if (input === undefined) {
    preset = DEFAULT_DECK_BACKGROUND;
    spec = DECK_BACKGROUND_PRESETS[preset];
  } else if (typeof input === 'string') {
    if (Object.hasOwn(DECK_BACKGROUND_PRESETS, input)) {
      preset = input as DeckBackgroundPresetId;
    } else {
      warning = `Unknown background "${input.slice(0, 64)}"; using ${DEFAULT_DECK_BACKGROUND}.`;
      preset = DEFAULT_DECK_BACKGROUND;
    }
    spec = DECK_BACKGROUND_PRESETS[preset];
  } else {
    spec = input;
  }

  const base = palette.background;
  const inks = { light: LIGHT_INK, dark: darkInk(palette) };
  let result: Omit<
    ResolvedDeckBackground,
    'variables' | 'textColor' | 'textTone' | 'contrast' | 'overlay'
  >;
  let choice: ReturnType<typeof chooseInk>;

  switch (spec.kind) {
    case 'solid': {
      const color = solidColor(spec.token ?? 'background', palette);
      choice = chooseInk([color], inks);
      result = { kind: 'solid', color };
      break;
    }
    case 'gradient': {
      const stops = DECK_GRADIENTS[spec.gradient].map((token) => palette[token]);
      choice = chooseInk(sampleGradient(stops), inks);
      result = {
        kind: 'gradient',
        color: stops[0] as string,
        gradient: { angle: spec.angle ?? 135, stops },
      };
      break;
    }
    case 'pattern': {
      choice = chooseInk([base, palette.border], inks);
      result = {
        kind: 'pattern',
        color: base,
        pattern: { kind: spec.pattern, ink: palette.border },
      };
      break;
    }
    case 'image':
    case 'image-full':
    case 'video':
    case 'video-full': {
      const forced = spec.tone === 'light' ? 'dark' : 'light';
      choice = chooseInk(ANY_PIXEL, inks, forced, spec.overlay ?? 0);
      const isVideo = spec.kind === 'video' || spec.kind === 'video-full';
      result = {
        kind: spec.kind,
        color: forced === 'light' ? '#000000' : '#ffffff',
        media: {
          type: isVideo ? 'video' : 'image',
          src: spec.src,
          full: spec.kind.endsWith('-full'),
          fit: 'fit' in spec && spec.fit ? spec.fit : 'cover',
          position: spec.position ?? 'center',
          ...('alt' in spec && spec.alt ? { alt: spec.alt } : {}),
          ...('poster' in spec && spec.poster ? { poster: spec.poster } : {}),
          ...(isVideo ? { muted: true, autoplay: true, loop: true, playsInline: true } : {}),
        },
      };
      break;
    }
  }

  const overlay = choice.overlay;
  const variables: Record<string, string> = {
    '--py-deck-bg': result.color,
    '--py-deck-bg-text': choice.ink,
    '--py-deck-bg-tone': choice.tone,
    '--py-deck-bg-overlay': overlay ? overlay.color : 'transparent',
    '--py-deck-bg-overlay-alpha': String(overlay?.alpha ?? 0),
  };
  if (result.gradient) {
    variables['--py-deck-bg-gradient'] =
      `linear-gradient(${result.gradient.angle}deg, ${result.gradient.stops.join(', ')})`;
  }
  if (result.pattern) variables['--py-deck-bg-pattern-ink'] = result.pattern.ink;

  return {
    ...result,
    ...(preset ? { preset } : {}),
    textTone: choice.tone,
    textColor: choice.ink,
    contrast: Math.round(choice.contrast * 100) / 100,
    overlay,
    variables,
    ...(warning ? { warning } : {}),
  };
}
