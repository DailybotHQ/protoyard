import { z } from 'zod';

/**
 * Theme identity (Violet, Ocean…) is separate from color mode
 * (light/dark/system). A theme defines tokens for both modes; the runtime
 * writes them as `--py-*` CSS custom properties on the prototype root.
 */

/*
 * Theme values become CSS custom properties and can be exported as a CSS
 * file, and imported themes are untrusted. So colors, fonts and radii are
 * constrained to their CSS syntax: no `url(` or other resource-loading
 * function, no `;`, `{`, `}`, `<`, `>`, backslash escapes or `!`, balanced
 * parentheses, and (fonts) balanced quotes.
 */

/** Functions a color may use. Anything else (`url(`, `image(`, `element(`…) is refused. */
const COLOR_FUNCTIONS = new Set([
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'color',
  'color-mix',
  'var',
  'calc',
]);

/** True when every `(` follows an allowed function name and parentheses balance. */
function safeFunctions(value: string, allowed: ReadonlySet<string>): boolean {
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '(') {
      const name = /([A-Za-z-]+)$/.exec(value.slice(0, i))?.[1]?.toLowerCase();
      if (!name || !allowed.has(name)) return false;
      depth++;
    } else if (char === ')') {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const COLOR_KEYWORD = /^[a-z]{3,32}$/i;
const COLOR_FUNCTION_CHARS = /^[a-z][a-z0-9 #.,%/+\-()]*\)$/i;

/** A CSS color: hex, a keyword (`transparent`, `red`) or a color function. */
export function isSafeCssColor(value: string): boolean {
  if (HEX_COLOR.test(value) || COLOR_KEYWORD.test(value)) return true;
  return COLOR_FUNCTION_CHARS.test(value) && safeFunctions(value, COLOR_FUNCTIONS);
}

const FONT_FUNCTIONS = new Set(['var']);
const FONT_CHARS = /^[A-Za-z0-9 ,'"_.()-]+$/;

/** A CSS font-family list: names, quoted names and `var(--token, fallback)`. */
export function isSafeFontFamily(value: string): boolean {
  if (!FONT_CHARS.test(value)) return false;
  if ((value.match(/"/g)?.length ?? 0) % 2 !== 0) return false;
  if ((value.match(/'/g)?.length ?? 0) % 2 !== 0) return false;
  return safeFunctions(value, FONT_FUNCTIONS);
}

const color = z
  .string()
  .min(1)
  .max(64)
  .refine(isSafeCssColor, 'Use a CSS color: hex, a keyword, or rgb()/hsl()/oklch()/color-mix()');
const fontFamily = z
  .string()
  .min(1)
  .max(300)
  .refine(isSafeFontFamily, 'Use a font-family list such as "Inter", system-ui, sans-serif');

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

/** Colors that mark data are plain hex so contrast and color-vision checks can read them. */
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a #rrggbb color');

/**
 * Chart colors for one mode (optional on a theme). `categorical` is the series
 * set (its first five are the theme's `chart1`…`chart5`), `sequential` runs
 * from low to high values, `diverging` from the negative end through a
 * neutral midpoint (index 4) to the positive end. `grid` and `axis` are the
 * chart chrome. Themes without this block get the charts kit's derived
 * palette from `chart1`…`chart5` at run time.
 */
export const ThemeChartTokensSchema = z.object({
  categorical: z.array(hexColor).length(8),
  sequential: z.array(hexColor).length(9),
  diverging: z.array(hexColor).length(9),
  grid: color,
  axis: color,
});
export type ThemeChartTokens = z.infer<typeof ThemeChartTokensSchema>;

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

export const ELEVATION_STYLES = ['flat', 'soft', 'crisp', 'glow', 'layered'] as const;
export type ElevationStyle = (typeof ELEVATION_STYLES)[number];
/**
 * Style preset ids (the values live in `@protoyard/themes` style presets; a
 * test keeps both lists in sync). Overrides and scenarios name presets by id,
 * never free CSS.
 */
export const RADIUS_PRESET_IDS = ['square', 'sharp', 'default', 'round', 'pill'] as const;
export type RadiusPresetId = (typeof RADIUS_PRESET_IDS)[number];
export const MOTION_PRESET_IDS = ['none', 'subtle', 'standard', 'expressive'] as const;
export type MotionPresetId = (typeof MOTION_PRESET_IDS)[number];
/** The `FONT_CATALOG` pairing ids. */
export const FONT_PAIRING_IDS = [
  'system',
  'humanist',
  'geometric',
  'grotesk',
  'editorial',
  'rounded',
  'condensed',
  'mono',
] as const;
export type FontPairingId = (typeof FONT_PAIRING_IDS)[number];

/** A live style choice layered on the effective theme; omitted keys keep the theme's own value. */
export const StylePresetOverridesSchema = z.object({
  radius: z.enum(RADIUS_PRESET_IDS).optional(),
  elevation: z.enum(ELEVATION_STYLES).optional(),
  font: z.enum(FONT_PAIRING_IDS).optional(),
  motion: z.enum(MOTION_PRESET_IDS).optional(),
});
export type StylePresetOverrides = z.infer<typeof StylePresetOverridesSchema>;
/** The style dimensions an override or scenario can set. */
export const STYLE_OVERRIDE_KEYS = ['radius', 'elevation', 'font', 'motion'] as const;
export type StyleOverrideKey = (typeof STYLE_OVERRIDE_KEYS)[number];

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
  /** Shadow character: none (`flat`), today's diffuse `soft`, tight `crisp`, colored `glow`, stacked `layered`. */
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

/** Corner radius: a CSS length, up to `9999px` for pill shapes. */
const radiusLength = z
  .string()
  .regex(/^(?:0|\d{1,5}(?:\.\d{1,4})?(?:px|rem|em))$/, 'Use a length like 0.625rem or 9999px');

export const ThemeSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1).max(40),
  description: z.string().default(''),
  fontFamily: fontFamily.default("'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif"),
  fontFamilyHeading: fontFamily.optional(),
  fontFamilyMono: fontFamily.default(
    "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
  ),
  radius: radiusLength.default('0.625rem'),
  /** Multiplier applied to spacing tokens (compact 0.875 … comfortable 1.125). */
  density: z.number().min(0.75).max(1.25).default(1),
  light: ThemePaletteSchema,
  dark: ThemePaletteSchema,
  /** Optional style profile; omitted fields keep today's look. */
  style: ThemeStyleSchema.prefault({}),
  /** Optional chart palettes per mode (generated themes always carry them). */
  charts: z.object({ light: ThemeChartTokensSchema, dark: ThemeChartTokensSchema }).optional(),
});
export type Theme = z.infer<typeof ThemeSchema>;
export type ThemeInput = z.input<typeof ThemeSchema>;

export function defineTheme(theme: ThemeInput): Theme {
  return ThemeSchema.parse(theme);
}

export function tokenToCssVar(token: string): string {
  return `--py-${token.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;
}
