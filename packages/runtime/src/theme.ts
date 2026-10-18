import {
  parseInput,
  type Theme,
  type ThemeInput,
  ThemeSchema,
  ValidationError,
} from '@protoyard/core';
import type { Kernel } from './kernel.ts';

/**
 * Custom themes made in the DevTools Theme Studio. They live in this
 * prototype's control database (never the data DB), are validated with the
 * core `ThemeSchema` on save, on import and on every boot, and join the
 * runtime's theme list next to the built-in and prototype themes.
 *
 * Imported JSON is untrusted input: it is size-capped, parsed with
 * `JSON.parse` only, and every color, length and font value must pass the
 * schema before it can become a CSS custom property.
 */

/** Control-state key for the saved list. */
export const CUSTOM_THEMES_KEY = 'customThemes' as const;
/** Upper bound for an imported theme file. */
export const MAX_THEME_JSON_BYTES = 64 * 1024;
/** Keeps the control DB and the theme picker small. */
export const MAX_CUSTOM_THEMES = 24;
/** Marker written by `exportTheme` (import also accepts a bare theme object). */
export const THEME_FILE_FORMAT = 'protoyard-theme/v1';

export interface ThemeControllerExtras {
  /** Saved custom themes, oldest first. */
  customThemes(): readonly Theme[];
  isCustom(id: string): boolean;
  /**
   * Validates and saves (or replaces) a custom theme, then re-applies the
   * appearance. Throws a `ValidationError` (`issues` per field) for malformed
   * values or an id that a built-in or prototype theme already uses.
   */
  saveCustom(input: ThemeInput): Promise<Theme>;
  /** Removes a custom theme; anything using it falls back to the default theme. */
  removeCustom(id: string): Promise<void>;
  /** Pretty JSON for download or sharing. Throws for unknown ids. */
  exportTheme(id: string): string;
  /** Parses untrusted JSON (a `exportTheme` file or a bare theme) and saves it. */
  importTheme(json: string): Promise<Theme>;
}

/**
 * Validates stored custom themes at boot and adds them to `themes` (in
 * place). Invalid entries and ids taken by built-in or prototype themes are
 * skipped and reported, never thrown: a bad row must not brick the app.
 */
export function loadCustomThemes(
  stored: unknown,
  themes: Theme[],
  report: (error: unknown) => void
): Set<string> {
  const ids = new Set<string>();
  if (stored === undefined || stored === null) return ids;
  if (!Array.isArray(stored)) {
    report(new Error('Ignoring stored custom themes: expected a list.'));
    return ids;
  }
  for (const entry of stored.slice(0, MAX_CUSTOM_THEMES)) {
    const result = ThemeSchema.safeParse(entry);
    if (!result.success) {
      report(new Error(`Ignoring an invalid stored custom theme: ${result.error.message}`));
      continue;
    }
    if (themes.some((t) => t.id === result.data.id)) {
      report(new Error(`Ignoring custom theme "${result.data.id}": that id is already in use.`));
      continue;
    }
    themes.push(result.data);
    ids.add(result.data.id);
  }
  return ids;
}

export function createThemeExtras(k: Kernel): ThemeControllerExtras {
  // The kernel's list is shared with `theme.themes()`; custom entries are edited in place.
  const themes = k.themes as Theme[];
  const custom = () => themes.filter((t) => k.customThemeIds.has(t.id));

  const persist = () => k.control.setState(CUSTOM_THEMES_KEY, custom());

  /** Recomputes appearance and always notifies: a theme's tokens may change under the same id. */
  const reapply = () => {
    k.refreshDerived();
    k.events.appearance.emit(k.appearance);
  };

  const save = async (input: unknown): Promise<Theme> => {
    const theme = parseInput(ThemeSchema, input);
    if (themes.some((t) => t.id === theme.id) && !k.customThemeIds.has(theme.id)) {
      throw new ValidationError({
        id: `"${theme.id}" is a built-in or prototype theme. Pick another id.`,
      });
    }
    const index = themes.findIndex((t) => t.id === theme.id);
    if (index < 0 && k.customThemeIds.size >= MAX_CUSTOM_THEMES) {
      throw new ValidationError({
        form: `You can keep up to ${MAX_CUSTOM_THEMES} custom themes. Delete one first.`,
      });
    }
    const previous = index < 0 ? undefined : themes[index];
    if (index < 0) themes.push(theme);
    else themes[index] = theme;
    k.customThemeIds.add(theme.id);
    try {
      await persist();
    } catch (error) {
      // Keep memory and storage in agreement when the write fails.
      if (previous) themes[index] = previous;
      else {
        themes.splice(themes.indexOf(theme), 1);
        k.customThemeIds.delete(theme.id);
      }
      throw error;
    }
    reapply();
    return theme;
  };

  return {
    customThemes: custom,
    isCustom: (id) => k.customThemeIds.has(id),
    saveCustom: (input) => save(input),

    async removeCustom(id) {
      if (!k.customThemeIds.has(id)) throw new Error(`"${id}" is not a custom theme.`);
      const index = themes.findIndex((t) => t.id === id);
      const [removed] = themes.splice(index, 1);
      k.customThemeIds.delete(id);
      try {
        await persist();
      } catch (error) {
        if (removed) themes.splice(index, 0, removed);
        k.customThemeIds.add(id);
        throw error;
      }
      reapply();
    },

    exportTheme(id) {
      const theme = custom().find((t) => t.id === id) ?? themes.find((t) => t.id === id);
      if (!theme) throw new Error(`Unknown theme "${id}".`);
      return JSON.stringify({ format: THEME_FILE_FORMAT, theme }, null, 2);
    },

    async importTheme(json) {
      if (json.length > MAX_THEME_JSON_BYTES) {
        throw new ValidationError({
          form: `That file is too large for a theme (limit ${MAX_THEME_JSON_BYTES / 1024} KB).`,
        });
      }
      let data: unknown;
      try {
        data = JSON.parse(json);
      } catch {
        throw new ValidationError({ form: 'That is not valid JSON.' });
      }
      const wrapped =
        typeof data === 'object' &&
        data !== null &&
        (data as { format?: unknown }).format === THEME_FILE_FORMAT;
      return save(wrapped ? (data as { theme?: unknown }).theme : data);
    },
  };
}
