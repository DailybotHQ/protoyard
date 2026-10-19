import { defineTheme, type Theme, type ThemePalette } from '@protoyard/core';
import {
  amber,
  blue,
  type ColorScale,
  emerald,
  gray,
  green,
  hues,
  red,
  rose,
  sky,
  slate,
  stone,
  violet,
  zinc,
} from './scales.ts';

/**
 * Built-in presets. Light and dark are designed separately rather than
 * inverted: dark surfaces step UP in lightness (background → surface →
 * elevated), primaries move to the lighter 400 step with a deep foreground,
 * and borders stay subtle. Every foreground/background pair is checked for
 * WCAG AA in `tests/contrast.test.ts`.
 */

export const DEFAULT_THEME_ID = 'violet';

interface Accent {
  /** Fill + text on top of it, per mode. */
  light: { primary: string; primaryForeground: string; ring: string };
  dark: { primary: string; primaryForeground: string; ring: string };
  /** Tinted hover/selection surface. */
  scale: ColorScale;
  /**
   * chart1…chart5 per mode. Hex entries replace a scale step that missed 3:1
   * on the surfaces or the series separation rules (tests/charts.test.ts).
   */
  charts: { light: readonly string[]; dark: readonly string[] };
}

const semanticLight = {
  // red-700: red-600 drops to 4.4:1 as text on muted surfaces.
  destructive: red[700],
  destructiveForeground: '#ffffff',
  success: green[700],
  successForeground: '#ffffff',
  warning: amber[400],
  warningForeground: amber[950],
  info: sky[700],
  infoForeground: '#ffffff',
};

const semanticDark = {
  destructive: red[400],
  destructiveForeground: red[950],
  success: green[400],
  successForeground: green[950],
  warning: amber[400],
  warningForeground: amber[950],
  info: sky[400],
  infoForeground: sky[950],
};

function charts(list: readonly string[]) {
  const [chart1, chart2, chart3, chart4, chart5] = list as [string, string, string, string, string];
  return { chart1, chart2, chart3, chart4, chart5 };
}

function lightPalette(base: ColorScale, accent: Accent): ThemePalette {
  return {
    background: base[50],
    foreground: base[950],
    surface: '#ffffff',
    surfaceForeground: base[950],
    elevated: '#ffffff',
    muted: base[100],
    mutedForeground: base[600],
    border: base[200],
    input: base[300],
    ring: accent.light.ring,
    primary: accent.light.primary,
    primaryForeground: accent.light.primaryForeground,
    secondary: base[100],
    secondaryForeground: base[900],
    accent: accent.scale[50],
    accentForeground: accent.scale[900],
    ...semanticLight,
    sidebar: base[100],
    sidebarForeground: base[800],
    sidebarBorder: base[200],
    ...charts(accent.charts.light),
    shadow: 'rgb(15 23 42 / 0.08)',
  };
}

function darkPalette(base: ColorScale, accent: Accent): ThemePalette {
  return {
    background: base[950],
    foreground: base[50],
    surface: base[900],
    surfaceForeground: base[50],
    elevated: base[800],
    muted: base[800],
    mutedForeground: base[400],
    // Translucent white keeps borders visible on every dark elevation step.
    border: 'rgb(255 255 255 / 0.1)',
    input: 'rgb(255 255 255 / 0.16)',
    ring: accent.dark.ring,
    primary: accent.dark.primary,
    primaryForeground: accent.dark.primaryForeground,
    secondary: base[800],
    secondaryForeground: base[50],
    accent: accent.scale[950],
    accentForeground: accent.scale[100],
    ...semanticDark,
    sidebar: base[900],
    sidebarForeground: base[200],
    sidebarBorder: 'rgb(255 255 255 / 0.08)',
    ...charts(accent.charts.dark),
    shadow: 'rgb(0 0 0 / 0.45)',
  };
}

function preset(input: {
  id: string;
  name: string;
  description: string;
  base: ColorScale;
  accent: Accent;
  radius?: string;
  fontFamilyHeading?: string;
}): Theme {
  const light = lightPalette(input.base, input.accent);
  const dark = darkPalette(input.base, input.accent);
  // A neutral accent scale would make hover tints vanish into the page.
  if (light.accent === light.background) light.accent = input.base[200];
  if (dark.accent === dark.background) dark.accent = input.base[800];
  return defineTheme({
    id: input.id,
    name: input.name,
    description: input.description,
    radius: input.radius ?? '0.625rem',
    ...(input.fontFamilyHeading ? { fontFamilyHeading: input.fontFamilyHeading } : {}),
    light,
    dark,
  });
}

export const violetTheme = preset({
  id: 'violet',
  name: 'Violet',
  description: 'The Protoyard default: calm zinc neutrals with a violet accent.',
  base: zinc,
  accent: {
    light: { primary: violet[600], primaryForeground: '#ffffff', ring: violet[500] },
    dark: { primary: violet[400], primaryForeground: violet[950], ring: violet[400] },
    scale: violet,
    charts: {
      light: [violet[600], sky[600], '#27a094', '#c88000', rose[500]],
      dark: [violet[400], sky[400], '#42e1cc', amber[400], rose[400]],
    },
  },
});

export const oceanTheme = preset({
  id: 'ocean',
  name: 'Ocean',
  description: 'Cool slate surfaces and a confident blue — classic SaaS.',
  base: slate,
  accent: {
    light: { primary: blue[600], primaryForeground: '#ffffff', ring: blue[500] },
    dark: { primary: blue[400], primaryForeground: blue[950], ring: blue[400] },
    scale: blue,
    charts: {
      light: [blue[600], hues.cyan600, '#4637d7', '#00885f', '#c88000'],
      dark: [blue[400], hues.cyan400, '#767fea', emerald[400], amber[400]],
    },
  },
});

export const emeraldTheme = preset({
  id: 'emerald',
  name: 'Emerald',
  description: 'Fresh green on soft gray — finance, health and sustainability.',
  base: gray,
  accent: {
    light: { primary: emerald[700], primaryForeground: '#ffffff', ring: emerald[600] },
    dark: { primary: emerald[400], primaryForeground: emerald[950], ring: emerald[400] },
    scale: emerald,
    charts: {
      light: [emerald[600], '#007a70', '#2090d4', '#62a003', '#a86b00'],
      dark: [emerald[400], '#54efd9', '#23b0ea', hues.lime400, '#edb200'],
    },
  },
});

export const roseTheme = preset({
  id: 'rose',
  name: 'Rose',
  description: 'Warm stone with a rose accent — consumer and lifestyle products.',
  base: stone,
  radius: '0.875rem',
  accent: {
    light: { primary: rose[700], primaryForeground: '#ffffff', ring: rose[500] },
    dark: { primary: rose[400], primaryForeground: rose[950], ring: rose[400] },
    scale: rose,
    charts: {
      light: [rose[600], '#ea3983', '#ea6730', violet[600], '#986000'],
      dark: [rose[400], '#ff82c2', '#ffa461', violet[400], amber[400]],
    },
  },
});

export const amberTheme = preset({
  id: 'amber',
  name: 'Amber',
  description: 'Sunny amber with dark text — energetic dashboards and marketplaces.',
  base: stone,
  accent: {
    light: { primary: amber[700], primaryForeground: '#ffffff', ring: amber[600] },
    dark: { primary: amber[400], primaryForeground: amber[950], ring: amber[400] },
    scale: amber,
    charts: {
      light: [amber[600], '#d84e00', '#bd0037', emerald[600], '#2090d4'],
      dark: [amber[400], hues.orange400, rose[400], emerald[400], '#23b0ea'],
    },
  },
});

export const monochromeTheme = preset({
  id: 'monochrome',
  name: 'Monochrome',
  description: 'Pure grayscale, crisp corners — wireframe-grade focus on behavior.',
  base: zinc,
  radius: '0.375rem',
  accent: {
    light: { primary: zinc[900], primaryForeground: zinc[50], ring: zinc[500] },
    dark: { primary: zinc[50], primaryForeground: zinc[900], ring: zinc[400] },
    scale: zinc,
    charts: {
      light: [zinc[900], zinc[700], zinc[500], '#8f8f97', '#555559'],
      dark: [zinc[50], '#d2d2d6', '#888891', '#65656e', '#acacb7'],
    },
  },
});

export const BUILTIN_THEMES: readonly Theme[] = [
  violetTheme,
  oceanTheme,
  emeraldTheme,
  roseTheme,
  amberTheme,
  monochromeTheme,
];
