import { contrastRatio, parseHex } from '@protoyard/themes';

/** WCAG AA for normal-size text. Body text on every background must reach it. */
export const DECK_TEXT_CONTRAST_MIN = 4.5;

const hex = (n: number) =>
  Math.round(Math.min(255, Math.max(0, n)))
    .toString(16)
    .padStart(2, '0');

/** `top` over `base` at `alpha` (0–1), composited in sRGB like a browser does. */
export function compositeOver(base: string, top: string, alpha: number): string {
  const b = parseHex(base);
  const t = parseHex(top);
  if (!b || !t)
    throw new TypeError(`compositeOver(): expected hex colors, got "${base}" and "${top}"`);
  const a = Math.min(1, Math.max(0, alpha));
  return `#${b.map((value, i) => hex(value * (1 - a) + (t[i] as number) * a)).join('')}`;
}

const RGB =
  /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:\s*[,/]\s*(\d*\.?\d+)(%?))?\s*\)$/i;

/**
 * A theme color as an opaque hex: hex passes through, `rgb()`/`rgba()` (with
 * an optional alpha, as dark-mode `border` tokens use) is composited over
 * `base`. Anything else falls back to `base`, so the contrast math never
 * guesses at a color it cannot read.
 */
export function opaqueColor(color: string, base: string): string {
  const value = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${[...value.slice(1)].map((c) => c + c).join('')}`.toLowerCase();
  }
  const match = RGB.exec(value);
  if (!match) return base;
  const [r, g, b] = [match[1], match[2], match[3]].map((n) => Math.min(255, Number(n)));
  const rawAlpha = match[4] === undefined ? 1 : Number(match[4]) / (match[5] === '%' ? 100 : 1);
  const opaque = `#${[r, g, b].map((n) => hex(n as number)).join('')}`;
  return compositeOver(base, opaque, Number.isFinite(rawAlpha) ? rawAlpha : 1);
}

/** Points along a linear gradient (stops and in-between), for worst-case checks. */
export function sampleGradient(stops: readonly string[], perSegment = 4): string[] {
  const out: string[] = [];
  stops.forEach((stop, i) => {
    out.push(stop);
    const next = stops[i + 1];
    if (next === undefined) return;
    for (let k = 1; k < perSegment; k++) out.push(compositeOver(stop, next, k / perSegment));
  });
  return out;
}

/** The lowest contrast of `ink` over any of `backgrounds`. */
export function worstContrast(ink: string, backgrounds: readonly string[]): number {
  return Math.min(...backgrounds.map((bg) => contrastRatio(ink, bg)));
}

export interface InkChoice {
  tone: 'light' | 'dark';
  ink: string;
  /** A scrim over the background, when the background alone is not enough. */
  overlay: { color: string; alpha: number } | null;
  /** Worst-case contrast of the ink over the background (with the overlay). */
  contrast: number;
}

const OVERLAY_STEP = 0.05;
const OVERLAY_MAX = 0.95;

/**
 * The scrim needed for `ink` to reach AA over every background: black under
 * light ink, white under dark ink, at the lowest alpha (in 0.05 steps) that
 * works. `null` alpha means no overlay was needed.
 */
export function inkWithOverlay(
  tone: 'light' | 'dark',
  ink: string,
  backgrounds: readonly string[],
  minimumAlpha = 0
): InkChoice {
  const scrim = tone === 'light' ? '#000000' : '#ffffff';
  for (
    let step = Math.round(minimumAlpha / OVERLAY_STEP);
    step * OVERLAY_STEP <= OVERLAY_MAX + 1e-9;
    step++
  ) {
    const alpha = Math.round(step * OVERLAY_STEP * 100) / 100;
    const seen =
      alpha === 0 ? backgrounds : backgrounds.map((bg) => compositeOver(bg, scrim, alpha));
    const contrast = worstContrast(ink, seen);
    if (contrast >= DECK_TEXT_CONTRAST_MIN) {
      return { tone, ink, overlay: alpha === 0 ? null : { color: scrim, alpha }, contrast };
    }
  }
  // Pure black or white ink over a 95 % scrim always clears AA; reaching here means a non-pure ink.
  const seen = backgrounds.map((bg) => compositeOver(bg, scrim, OVERLAY_MAX));
  return {
    tone,
    ink,
    overlay: { color: scrim, alpha: OVERLAY_MAX },
    contrast: worstContrast(ink, seen),
  };
}

/**
 * Picks the ink for a set of backgrounds: whichever tone needs the lighter
 * overlay (none, ideally); ties go to the higher contrast. A forced tone (an
 * image declared dark or light) is respected and only its overlay is solved.
 */
export function chooseInk(
  backgrounds: readonly string[],
  inks: { light: string; dark: string },
  forced?: 'light' | 'dark',
  minimumAlpha = 0
): InkChoice {
  if (forced) return inkWithOverlay(forced, inks[forced], backgrounds, minimumAlpha);
  const light = inkWithOverlay('light', inks.light, backgrounds, minimumAlpha);
  const dark = inkWithOverlay('dark', inks.dark, backgrounds, minimumAlpha);
  const alphaOf = (choice: InkChoice) => choice.overlay?.alpha ?? 0;
  if (alphaOf(light) !== alphaOf(dark)) return alphaOf(light) < alphaOf(dark) ? light : dark;
  return light.contrast >= dark.contrast ? light : dark;
}
