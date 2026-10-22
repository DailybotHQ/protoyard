import { chooseInk, opaqueColor, sampleGradient } from './contrast.ts';
import {
  DECK_BACKGROUND_PRESETS,
  DECK_GRADIENTS,
  DEFAULT_DECK_BACKGROUND,
  type DeckBackground,
  type DeckBackgroundPalette,
  type DeckBackgroundPresetId,
  type DeckBackgroundSpec,
  type DeckPattern,
  type DeckSolidToken,
} from './schema.ts';

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
