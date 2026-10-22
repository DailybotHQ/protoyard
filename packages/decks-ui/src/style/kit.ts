import {
  checkDeckMediaSrc,
  DECK_TEXT_CONTRAST_MIN,
  type DeckBackgroundPalette,
  type ResolvedDeckBackground,
  resolveDeckBackground,
} from '@protoyard/decks';
import type { DeckStyle } from '@protoyard/decks/schema';
import { type ResolvedDeckStyle, resolveDeckStyle } from '@protoyard/decks/style';

/**
 * The deck style kit, loaded lazily by `deck-style.svelte.ts` so library
 * themes, the palette engine and the background resolver stay out of the
 * DeckApp entry. Everything a slide's style attribute receives is computed
 * here from theme colors and numbers; no author string ever reaches CSS.
 */

export type DeckTheme = ResolvedDeckStyle['appearance']['theme'];
export type DeckPalette = DeckTheme['light'];
export type DeckMode = 'light' | 'dark';

/** Theme tokens that carry text inside a slide. */
export const TEXT_TOKENS = [
  'foreground',
  'mutedForeground',
  'surfaceForeground',
  'primary',
] as const;
type TextToken = (typeof TEXT_TOKENS)[number];
const CSS_VAR: Record<TextToken, string> = {
  foreground: '--py-foreground',
  mutedForeground: '--py-muted-foreground',
  surfaceForeground: '--py-surface-foreground',
  primary: '--py-primary',
};

/**
 * Tailwind's `@theme inline` utilities read `--py-*` directly, but the base
 * layer (body font, headings, default borders, focus rings) reads aliases such
 * as `--font-heading` and `--color-border` that are resolved once at `:root`.
 * Re-declaring them on the deck root (and on each slide frame, whose tokens
 * may flip) makes those rules follow the deck's theme too.
 */
const BASE_ALIASES: Record<string, string> = {
  '--font-sans': 'var(--py-font-sans)',
  '--font-heading': 'var(--py-font-heading)',
  '--font-mono': 'var(--py-font-mono)',
  '--color-background': 'var(--py-background)',
  '--color-foreground': 'var(--py-foreground)',
  '--color-border': 'var(--py-border)',
  '--color-ring': 'var(--py-ring)',
  '--color-primary': 'var(--py-primary)',
  '--color-muted-foreground': 'var(--py-muted-foreground)',
};

// ── WCAG contrast (hex only; theme palettes are hex) ─────────────────────────

function rgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h =
    (m[1] as string).length === 3
      ? [...(m[1] as string)].map((c) => c + c).join('')
      : (m[1] as string);
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const c = rgb(hex);
  if (!c) return 0;
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  if (!x || !y) return a;
  return `#${x
    .map((v, i) =>
      Math.round(v + ((y[i] as number) - v) * t)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}

/** Every color text may sit on: solid → itself; gradient → stops and points between; pattern → base and ink. */
export function backgroundSamples(bg: ResolvedDeckBackground): string[] {
  if (bg.gradient) {
    const out: string[] = [];
    bg.gradient.stops.forEach((stop, i) => {
      out.push(stop);
      const next = bg.gradient?.stops[i + 1];
      if (next) for (let k = 1; k < 4; k += 1) out.push(mix(stop, next, k / 4));
    });
    return bg.overlay
      ? out.map((c) => mix(c, (bg.overlay as { color: string }).color, bg.overlay?.alpha ?? 0))
      : out;
  }
  if (bg.pattern) return [bg.color, bg.pattern.ink];
  return [bg.color];
}

// ── slide surfaces ──────────────────────────────────────────────────────────

export interface SlideSurface {
  preset?: string;
  kind: ResolvedDeckBackground['kind'];
  /** Text tone of the background (`light` = light text). */
  tone: 'light' | 'dark';
  /** True when the background flips the theme's text tone (light text on a light theme). */
  inverse: boolean;
  /** Computed text color with ≥ 4.5:1 against every sample of the background. */
  ink: string;
  /** Effective color of each text token inside the slide. */
  text: Record<TextToken, string>;
  /** `style` attribute value: CSS variables and the background, numbers and theme colors only. */
  style: string;
  warning?: string;
}

function backgroundCss(bg: ResolvedDeckBackground): string {
  const layers: string[] = [];
  if (bg.overlay && bg.overlay.alpha > 0) {
    const c = rgb(bg.overlay.color) ?? [0, 0, 0];
    const rgba = `rgba(${c.join(', ')}, ${Math.round(bg.overlay.alpha * 1000) / 1000})`;
    layers.push(`linear-gradient(${rgba}, ${rgba})`);
  }
  if (bg.gradient)
    layers.push(`linear-gradient(${bg.gradient.angle}deg, ${bg.gradient.stops.join(', ')})`);
  if (bg.pattern?.kind === 'dots') {
    layers.push(
      `radial-gradient(circle, ${bg.pattern.ink} 1.5px, transparent 1.75px) 0 0 / 32px 32px`
    );
  }
  if (bg.pattern?.kind === 'grid') {
    layers.push(
      `linear-gradient(${bg.pattern.ink} 1px, transparent 1px) 0 0 / 48px 48px`,
      `linear-gradient(90deg, ${bg.pattern.ink} 1px, transparent 1px) 0 0 / 48px 48px`
    );
  }
  return layers.length > 0 ? `${layers.join(', ')}, ${bg.color}` : bg.color;
}

/**
 * The surface of one slide. When the background flips the theme's text tone
 * (a dark gradient on a light theme), the slide's text tokens become the
 * computed ink and its surfaces go transparent, so every glyph sits on the
 * background the resolver proved ≥ 4.5:1. Otherwise only the text tokens
 * that would fall under 4.5:1 on this background are raised to the ink.
 */
export function slideSurface(background: string | undefined, palette: DeckPalette): SlideSurface {
  const bg = resolveDeckBackground(background, palette as unknown as DeckBackgroundPalette);
  const samples = backgroundSamples(bg);
  const naturalTone =
    luminance(palette.foreground) > luminance(palette.background) ? 'light' : 'dark';
  const inverse = bg.textTone !== naturalTone;
  const vars: Record<string, string> = { ...bg.variables };
  const text = {} as Record<TextToken, string>;
  for (const token of TEXT_TOKENS) {
    const own = palette[token];
    const readable = samples.every((sample) => contrast(own, sample) >= DECK_TEXT_CONTRAST_MIN);
    text[token] = inverse || !readable ? bg.textColor : own;
    if (text[token] !== own) vars[CSS_VAR[token]] = text[token];
  }
  if (inverse) {
    // Cards and panels become outlines on the slide's own background.
    vars['--py-background'] = 'transparent';
    vars['--py-surface'] = 'transparent';
    vars['--py-muted'] = 'transparent';
    vars['--py-elevated'] = 'transparent';
    vars['--py-border'] = mix(bg.color, bg.textColor, 0.45);
    // Filled accents (bg-primary) carry the background color as their text.
    vars['--py-primary-foreground'] = bg.color;
    vars['--py-ring'] = bg.textColor;
  }
  Object.assign(vars, BASE_ALIASES);
  vars.color = text.foreground;
  vars.background = backgroundCss(bg);
  vars['print-color-adjust'] = 'exact';
  vars['-webkit-print-color-adjust'] = 'exact';
  const style = Object.entries(vars)
    .map(([name, value]) => `${name}:${value}`)
    .join(';');
  return {
    ...(bg.preset ? { preset: bg.preset } : {}),
    kind: bg.kind,
    tone: bg.textTone,
    inverse,
    ink: bg.textColor,
    text,
    style,
    ...(bg.warning ? { warning: bg.warning } : {}),
  };
}

// ── whole-deck resolution ───────────────────────────────────────────────────

export interface DeckStyleResolution {
  themeId: string;
  mode: DeckMode;
  /** CSS variables for the deck root (theme, fonts, radius, density, deck tokens). */
  rootStyle: string;
  palette: DeckPalette;
  warnings: string[];
  logo?: string;
  footer?: string;
  slideNumbers: boolean;
}

/** Resolves a deck style (theme lazily, unknown ids fall back with a warning) for one mode. */
export async function resolveDeckLook(
  style: DeckStyle | undefined,
  mode: DeckMode
): Promise<DeckStyleResolution> {
  const resolved = await resolveDeckStyle(style ?? {}, undefined, { mode });
  const theme = resolved.appearance.theme;
  const palette = mode === 'dark' ? theme.dark : theme.light;
  const warnings = resolved.warnings.map((warning) => warning.message);
  const background = resolveDeckBackground(
    style?.background,
    palette as unknown as DeckBackgroundPalette
  );
  if (background.warning) warnings.push(background.warning);
  const rootVars: Record<string, string> = {
    ...resolved.variables,
    ...BASE_ALIASES,
    'font-family': 'var(--py-font-sans)',
  };
  const rootStyle = Object.entries(rootVars)
    .map(([name, value]) => `${name}:${value}`)
    .join(';');
  const logo = style?.logo && checkDeckMediaSrc(style.logo, 'image').ok ? style.logo : undefined;
  if (style?.logo && !logo) warnings.push('The deck logo is not a local image; it is not shown.');
  return {
    themeId: theme.id,
    mode,
    rootStyle,
    palette,
    warnings,
    ...(logo ? { logo } : {}),
    ...(style?.footer ? { footer: style.footer } : {}),
    slideNumbers: style?.slideNumbers !== false,
  };
}
