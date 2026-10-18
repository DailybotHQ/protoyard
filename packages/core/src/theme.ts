import { z } from 'zod';

/**
 * Theme identity (Violet, Ocean…) is separate from color mode
 * (light/dark/system). A theme defines tokens for both modes; the runtime
 * writes them as `--py-*` CSS custom properties on the prototype root.
 */

const color = z.string().min(1).max(64);

export const ThemePaletteSchema = z.object({
  background: color,
  foreground: color,
  surface: color,
  surfaceForeground: color,
  elevated: color,
  muted: color,
  mutedForeground: color,
  border: color,
  input: color,
  ring: color,
  primary: color,
  primaryForeground: color,
  secondary: color,
  secondaryForeground: color,
  accent: color,
  accentForeground: color,
  destructive: color,
  destructiveForeground: color,
  success: color,
  successForeground: color,
  warning: color,
  warningForeground: color,
  info: color,
  infoForeground: color,
  sidebar: color,
  sidebarForeground: color,
  sidebarBorder: color,
  chart1: color,
  chart2: color,
  chart3: color,
  chart4: color,
  chart5: color,
  shadow: color,
});
export type ThemePalette = z.infer<typeof ThemePaletteSchema>;
export type ThemeTokenName = keyof ThemePalette;

/*
 * Style dimensions beyond color. Every field has a default equal to how
 * Protoyard renders today, so a theme without `style` (every existing preset)
 * parses to the same look. Values become CSS custom properties, so each one
 * is validated against a strict pattern instead of accepting free-form text.
 */

/** A CSS length in px, rem or em (`0` allowed): `1px`, `0.125rem`. */
const cssLength = z
  .string()
  .regex(/^(?:0|\d{1,3}(?:\.\d{1,4})?(?:px|rem|em))$/, 'Use a length like 1px or 0.125rem');
/** Letter spacing: `0`, `normal` or an em value such as `-0.02em`. */
const tracking = z
  .string()
  .regex(
    /^(?:0|normal|-?(?:\d(?:\.\d{1,4})?|\.\d{1,4})em)$/,
    'Use normal, 0 or an em value like -0.02em'
  );
const fontWeight = z.number().int().min(100).max(900);
/** Milliseconds; motion is zeroed separately by the reduced-motion setting. */
const durationMs = z.number().int().min(0).max(2000);
const easing = z
  .string()
  .regex(
    /^(?:linear|ease|ease-in|ease-out|ease-in-out|cubic-bezier\(\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*\))$/,
    'Use a CSS easing keyword or cubic-bezier(a, b, c, d)'
  );

export const ELEVATION_STYLES = ['flat', 'soft', 'crisp', 'glow'] as const;
export type ElevationStyle = (typeof ELEVATION_STYLES)[number];
export const SURFACE_STYLES = ['solid', 'glass'] as const;
export type SurfaceStyle = (typeof SURFACE_STYLES)[number];
export const FOCUS_RING_STYLES = ['ring', 'outline', 'glow', 'inset'] as const;
export type FocusRingStyle = (typeof FOCUS_RING_STYLES)[number];

/**
 * Typography beyond the font stacks (the stacks stay on the theme as
 * `fontFamily`, `fontFamilyHeading` and `fontFamilyMono`).
 */
export const ThemeTypographySchema = z.object({
  /**
   * Modular type-scale ratio (1.125 minor third … 1.5 perfect fifth).
   * `null` keeps the built-in Tailwind steps, which is today's rendering.
   */
  scaleRatio: z.number().min(1).max(1.75).nullable().default(null),
  weights: z
    .object({
      body: fontWeight.default(400),
      medium: fontWeight.default(500),
      heading: fontWeight.default(600),
      bold: fontWeight.default(700),
    })
    .prefault({}),
  tracking: z
    .object({
      body: tracking.default('0'),
      heading: tracking.default('0'),
    })
    .prefault({}),
});
export type ThemeTypography = z.infer<typeof ThemeTypographySchema>;

export const ThemeShapeSchema = z.object({
  /**
   * Multiplier for the steps around the base `radius` (xs = radius − 6px ×
   * scale … 2xl = radius + 8px × scale). `0` gives one radius everywhere.
   */
  radiusScale: z.number().min(0).max(4).default(1),
  borderWidth: cssLength.default('1px'),
});
export type ThemeShape = z.infer<typeof ThemeShapeSchema>;

export const ThemeMotionSchema = z.object({
  durations: z
    .object({
      fast: durationMs.default(150),
      base: durationMs.default(200),
      slow: durationMs.default(300),
    })
    .prefault({}),
  /** Tailwind's default transition curve. */
  easing: easing.default('cubic-bezier(0.4, 0, 0.2, 1)'),
});
export type ThemeMotion = z.infer<typeof ThemeMotionSchema>;

export const ThemeFocusRingSchema = z.object({
  style: z.enum(FOCUS_RING_STYLES).default('ring'),
  width: cssLength.default('2px'),
  offset: cssLength.default('2px'),
});
export type ThemeFocusRing = z.infer<typeof ThemeFocusRingSchema>;

export const ThemeStyleSchema = z.object({
  typography: ThemeTypographySchema.prefault({}),
  shape: ThemeShapeSchema.prefault({}),
  /** Shadow character: none (`flat`), today's diffuse `soft`, tight `crisp`, colored `glow`. */
  elevation: z.enum(ELEVATION_STYLES).default('soft'),
  /** `glass` is translucent with a backdrop blur; renderers fall back to solid without support. */
  surface: z.enum(SURFACE_STYLES).default('solid'),
  motion: ThemeMotionSchema.prefault({}),
  focusRing: ThemeFocusRingSchema.prefault({}),
});
export type ThemeStyle = z.infer<typeof ThemeStyleSchema>;
export type ThemeStyleInput = z.input<typeof ThemeStyleSchema>;

/** The style every theme gets when it does not set one (today's rendering). */
export const DEFAULT_THEME_STYLE: ThemeStyle = ThemeStyleSchema.parse({});

/** Fills a partial style with the defaults; throws on malformed values. */
export function resolveThemeStyle(style: ThemeStyleInput | undefined = {}): ThemeStyle {
  return ThemeStyleSchema.parse(style);
}

export const ThemeSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1).max(40),
  description: z.string().default(''),
  fontFamily: z.string().default("'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif"),
  fontFamilyHeading: z.string().optional(),
  fontFamilyMono: z
    .string()
    .default("'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"),
  radius: z.string().default('0.625rem'),
  /** Multiplier applied to spacing tokens (compact 0.875 … comfortable 1.125). */
  density: z.number().min(0.75).max(1.25).default(1),
  light: ThemePaletteSchema,
  dark: ThemePaletteSchema,
  /** Optional style profile; omitted fields keep today's look. */
  style: ThemeStyleSchema.prefault({}),
});
export type Theme = z.infer<typeof ThemeSchema>;
export type ThemeInput = z.input<typeof ThemeSchema>;

export function defineTheme(theme: ThemeInput): Theme {
  return ThemeSchema.parse(theme);
}

export function tokenToCssVar(token: string): string {
  return `--py-${token.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;
}
