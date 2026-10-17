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
});
export type Theme = z.infer<typeof ThemeSchema>;
export type ThemeInput = z.input<typeof ThemeSchema>;

export function defineTheme(theme: ThemeInput): Theme {
  return ThemeSchema.parse(theme);
}

export function tokenToCssVar(token: string): string {
  return `--py-${token.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;
}
