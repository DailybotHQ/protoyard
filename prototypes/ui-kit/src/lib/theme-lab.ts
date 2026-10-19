import type { Theme } from '@protoyard/core';
import { THEME_FILE_FORMAT } from '@protoyard/runtime';
import type { LibraryThemeMeta } from '@protoyard/themes';
import { contrastRatio, TEXT_CONTRAST_PAIRS, UI_CONTRAST_PAIRS } from '@protoyard/themes';
import type { ThemeLabServices } from '../domain/themes.ts';

export const ALL_THEME_CATEGORIES = 'all';

export function listThemeCategories(themes: readonly LibraryThemeMeta[]): string[] {
  return [...new Set(themes.map((theme) => theme.category))].sort((a, b) => a.localeCompare(b));
}

export function filterLibraryThemes(
  themes: readonly LibraryThemeMeta[],
  category: string
): readonly LibraryThemeMeta[] {
  return category === ALL_THEME_CATEGORIES
    ? themes
    : themes.filter((theme) => theme.category === category);
}

/** Apply a theme through the Theme Lab service (assert → environment.run). */
export async function activateTheme(
  theme: Theme,
  services: Pick<ThemeLabServices, 'activate'>
): Promise<Theme> {
  return services.activate(theme);
}

export interface ThemeContrastAudit {
  theme: Theme;
  mode: 'light' | 'dark';
  failing: { fg: string; bg: string; ratio: number; min: number }[];
  lowest: number;
}

/** WCAG text + UI pair audit for one theme/mode (library and custom included). */
export function auditThemeContrast(theme: Theme, mode: 'light' | 'dark'): ThemeContrastAudit {
  const palette = theme[mode];
  const failing: ThemeContrastAudit['failing'] = [];
  let lowest = Number.POSITIVE_INFINITY;
  for (const [fg, bg] of TEXT_CONTRAST_PAIRS) {
    const ratio = contrastRatio(palette[fg], palette[bg]);
    lowest = Math.min(lowest, ratio);
    if (ratio < 4.5) failing.push({ fg, bg, ratio, min: 4.5 });
  }
  for (const [fg, bg] of UI_CONTRAST_PAIRS) {
    const ratio = contrastRatio(palette[fg], palette[bg]);
    lowest = Math.min(lowest, ratio);
    if (ratio < 3) failing.push({ fg, bg, ratio, min: 3 });
  }
  return {
    theme,
    mode,
    failing,
    lowest: Number.isFinite(lowest) ? lowest : 0,
  };
}

/** Audit every theme in the list (both modes). */
export function auditThemesContrast(themes: readonly Theme[]): ThemeContrastAudit[] {
  const out: ThemeContrastAudit[] = [];
  for (const theme of themes) {
    out.push(auditThemeContrast(theme, 'light'), auditThemeContrast(theme, 'dark'));
  }
  return out;
}

/** Prefer the runtime's canonical export path; unloaded library themes use its importable envelope. */
export function exportThemeJson(theme: Theme, exportFromRuntime: (id: string) => string): string {
  try {
    return exportFromRuntime(theme.id);
  } catch {
    return JSON.stringify({ format: THEME_FILE_FORMAT, theme }, null, 2);
  }
}
