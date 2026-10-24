import type { Theme, ThemePalette } from '@protoyard/core';
import {
  defineTheme as defineTexuliTheme,
  SEMANTIC_ROLES,
  type SemanticRole,
  type SemanticRoleValue,
  type Theme as TexuliTheme,
  type ThemeCharts,
} from '@texuli/tokens/contract';
import { contrastRatio, hoverFill } from './contrast.ts';
import { SHARED_PALETTE_ROLES } from './from-texuli.ts';

export { fromTexuliTheme, SHARED_PALETTE_ROLES } from './from-texuli.ts';
export {
  disableTexuliAppearance,
  enableTexuliAppearance,
  writeTexuliAppearance,
} from './texuli-apply.ts';

/**
 * The bridge between Protoyard's theme contract and `@texuli/tokens`
 * (`@protoyard/themes/texuli`). It imports `@texuli/tokens` at runtime, so
 * only pages that import this subpath load it: `enableTexuliAppearance()`
 * turns on the `--tx-*` variables for pages that render Texuli components.
 *
 * - `fromTexuliTheme` (`from-texuli.ts`) turns a Texuli theme (50 semantic
 *   roles, each with interaction states) into a Protoyard `Theme` (34 flat roles): the shared
 *   roles keep their default values and the chart roles take the first five
 *   categorical chart colors, as Protoyard's own palette engine does.
 * - `toTexuliTheme` completes a Protoyard theme into a Texuli theme so
 *   `@texuli/tokens` can write the `--tx-*` variables. The 34 shared roles pass
 *   through unchanged (so every `--py-<role>` equals `--tx-<role>`); the 16
 *   roles Protoyard does not have are derived from existing roles, each
 *   choosing the first candidate that meets the contrast pairs Texuli's AA
 *   gate holds it to.
 */

const HEX = /^#[0-9a-f]{6}$/i;

/** Contrast of two colors, or `undefined` when either is not a hex color. */
function ratio(foreground: string, background: string): number | undefined {
  if (!HEX.test(foreground) || !HEX.test(background)) return undefined;
  return contrastRatio(foreground, background);
}

/** True when `color` reaches `minimum` against every background (unknown counts as met). */
function meets(color: string, backgrounds: readonly string[], minimum: number): boolean {
  return backgrounds.every((background) => (ratio(color, background) ?? minimum) >= minimum);
}

/** The first candidate meeting `minimum` on every background, else the strongest one. */
function pick(
  candidates: readonly string[],
  backgrounds: readonly string[],
  minimum: number
): string {
  const met = candidates.find((candidate) => meets(candidate, backgrounds, minimum));
  if (met) return met;
  const worst = (candidate: string) =>
    Math.min(...backgrounds.map((background) => ratio(candidate, background) ?? 0));
  return [...candidates].sort((a, b) => worst(b) - worst(a))[0] as string;
}

/**
 * The 16 roles Texuli has and Protoyard does not, derived from one Protoyard
 * palette. The pairs named here are the ones Texuli's AA gate checks for them.
 */
export function deriveTexuliRoles(palette: ThemePalette): Record<string, string> {
  const p = palette;
  // Soft tones: a tinted surface that `foreground` and a soft foreground read on.
  const softBackground = pick([p.muted, p.background], [p.foreground], 4.5);
  const softForeground = pick([p.foreground, p.mutedForeground], [softBackground], 4.5);
  const link = pick(
    [p.primary, p.foreground, p.mutedForeground],
    [p.background, p.surface, p.muted, p.elevated],
    4.5
  );
  return {
    canvas: p.background,
    elevatedForeground: pick([p.foreground, p.surfaceForeground], [p.elevated], 4.5),
    subtle: p.muted,
    subtleForeground: pick([p.mutedForeground, p.foreground], [p.background, p.muted], 4.5),
    borderStrong: pick(
      [p.border, p.input, p.ring, p.mutedForeground],
      [p.background, p.surface],
      3
    ),
    primarySoft: softBackground,
    primarySoftForeground: softForeground,
    destructiveSoft: softBackground,
    destructiveSoftForeground: softForeground,
    successSoft: softBackground,
    successSoftForeground: softForeground,
    warningSoft: softBackground,
    warningSoftForeground: softForeground,
    infoSoft: softBackground,
    infoSoftForeground: softForeground,
    sidebarPrimary: p.primary,
    overlay: p.elevated,
    scrim: p.shadow,
    link,
    linkVisited: link,
    selection: p.primary,
    selectionForeground: p.primaryForeground,
  };
}

/** One mode's Texuli palette input from a Protoyard palette. */
function texuliPalette(palette: ThemePalette): Record<SemanticRole, string | SemanticRoleValue> {
  const derived = deriveTexuliRoles(palette);
  const out: Record<string, string | SemanticRoleValue> = {};
  for (const role of SEMANTIC_ROLES) {
    const shared = (SHARED_PALETTE_ROLES as readonly string[]).includes(role);
    out[role] = shared ? palette[role as keyof ThemePalette] : (derived[role] as string);
  }
  // Protoyard computes these hover fills (`--py-primary-hover`); Texuli carries them as states.
  const primaryHover = hoverFill(palette.primary, palette.primaryForeground);
  out.primary = { default: palette.primary, hover: primaryHover };
  out.sidebarPrimary = { default: palette.primary, hover: primaryHover };
  out.destructive = {
    default: palette.destructive,
    hover: hoverFill(palette.destructive, palette.destructiveForeground),
  };
  return out as Record<SemanticRole, string | SemanticRoleValue>;
}

const texuliCache = new WeakMap<Theme, TexuliTheme>();

/** A Protoyard theme as a validated Texuli theme (cached per theme object). */
export function toTexuliTheme(theme: Theme): TexuliTheme {
  const cached = texuliCache.get(theme);
  if (cached) return cached;
  const converted = defineTexuliTheme({
    id: theme.id,
    name: theme.name,
    description: theme.description,
    fontFamily: theme.fontFamily,
    ...(theme.fontFamilyHeading ? { fontFamilyHeading: theme.fontFamilyHeading } : {}),
    fontFamilyMono: theme.fontFamilyMono,
    radius: theme.radius,
    density: theme.density,
    light: texuliPalette(theme.light),
    dark: texuliPalette(theme.dark),
    style: theme.style,
    // Texuli validates the chart arrays' lengths (8, 9 and 9) like Protoyard's schema.
    ...(theme.charts ? { charts: theme.charts as unknown as ThemeCharts } : {}),
  });
  texuliCache.set(theme, converted);
  return converted;
}
