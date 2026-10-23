import {
  defineTheme as defineProtoyardTheme,
  type Theme,
  type ThemePalette,
} from '@protoyard/core';
import type { SemanticRole, Theme as TexuliTheme, ThemeCharts } from '@texuli/tokens';

/**
 * Texuli theme → Protoyard theme. Type-only imports from `@texuli/tokens`, so
 * the library registry (eager in every bundle that lists themes) never pulls
 * Texuli code; the tokens themselves arrive through the registry's dynamic
 * imports. The shared roles keep Texuli's default values and the chart roles
 * take the first five categorical chart colors, as Protoyard's palette engine
 * does.
 */

/** Palette roles both contracts share (Protoyard's palette minus its chart roles). */
export const SHARED_PALETTE_ROLES = [
  'background',
  'foreground',
  'surface',
  'surfaceForeground',
  'elevated',
  'muted',
  'mutedForeground',
  'border',
  'input',
  'ring',
  'primary',
  'primaryForeground',
  'secondary',
  'secondaryForeground',
  'accent',
  'accentForeground',
  'destructive',
  'destructiveForeground',
  'success',
  'successForeground',
  'warning',
  'warningForeground',
  'info',
  'infoForeground',
  'sidebar',
  'sidebarForeground',
  'sidebarBorder',
  'shadow',
] as const satisfies readonly (keyof ThemePalette & SemanticRole)[];

const CHART_ROLES = ['chart1', 'chart2', 'chart3', 'chart4', 'chart5'] as const;

function protoyardPalette(
  palette: TexuliTheme['light'],
  charts: ThemeCharts['light'] | undefined
): ThemePalette {
  const out: Record<string, string> = {};
  for (const role of SHARED_PALETTE_ROLES) out[role] = palette[role].default;
  CHART_ROLES.forEach((role, index) => {
    out[role] = charts?.categorical[index] ?? palette.primary.default;
  });
  return out as ThemePalette;
}

/** Chart tokens with plain arrays (Protoyard's schema), copied from Texuli's tuples. */
function protoyardCharts(charts: ThemeCharts): NonNullable<Theme['charts']> {
  const mode = (tokens: ThemeCharts['light']) => ({
    categorical: [...tokens.categorical],
    sequential: [...tokens.sequential],
    diverging: [...tokens.diverging],
    grid: tokens.grid,
    axis: tokens.axis,
  });
  return { light: mode(charts.light), dark: mode(charts.dark) };
}

/** A Texuli theme (and its chart tokens) as a validated Protoyard theme. */
export function fromTexuliTheme(
  theme: TexuliTheme,
  charts: ThemeCharts | undefined = theme.charts
): Theme {
  return defineProtoyardTheme({
    id: theme.id,
    name: theme.name,
    description: theme.description,
    fontFamily: theme.fontFamily,
    ...(theme.fontFamilyHeading ? { fontFamilyHeading: theme.fontFamilyHeading } : {}),
    fontFamilyMono: theme.fontFamilyMono,
    radius: theme.radius,
    density: theme.density,
    light: protoyardPalette(theme.light, charts?.light),
    dark: protoyardPalette(theme.dark, charts?.dark),
    style: theme.style,
    ...(charts ? { charts: protoyardCharts(charts) } : {}),
  });
}
