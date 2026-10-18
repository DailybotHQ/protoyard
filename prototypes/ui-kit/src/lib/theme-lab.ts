import type { Theme, ThemeController } from '@protoyard/core';
import { THEME_FILE_FORMAT } from '@protoyard/runtime';
import type { LibraryThemeMeta } from '@protoyard/themes';

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

export async function activateTheme(
  theme: Theme,
  controller: Pick<ThemeController, 'themes' | 'setOverride'>,
  saveCustom: (theme: Theme) => Promise<unknown>
): Promise<void> {
  if (!controller.themes().some((known) => known.id === theme.id)) await saveCustom(theme);
  await controller.setOverride({ themeId: theme.id });
}

/** Prefer the runtime's canonical export path; unloaded library themes use its importable envelope. */
export function exportThemeJson(theme: Theme, exportFromRuntime: (id: string) => string): string {
  try {
    return exportFromRuntime(theme.id);
  } catch {
    return JSON.stringify({ format: THEME_FILE_FORMAT, theme }, null, 2);
  }
}
