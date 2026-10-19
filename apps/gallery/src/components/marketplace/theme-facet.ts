import { BUILTIN_THEMES, THEME_COLLECTIONS, THEME_LIBRARY_META } from '@protoyard/themes';
import type { MarketTheme } from './model';

/*
 * Build-time only (imported by shelf.ts and the marketplace pages, never by
 * the browse island): maps a registry `defaultTheme` id to what a card shows.
 * Library themes use their metadata (seed and secondary colors; no palette is
 * built), built-ins their light and dark primary, anything else is the
 * prototype's own theme.
 */

const library = new Map(THEME_LIBRARY_META.map((meta) => [meta.id, meta]));
const builtins = new Map(BUILTIN_THEMES.map((theme) => [theme.id, theme]));

export function marketTheme(id: string | null | undefined): MarketTheme | null {
  if (!id) return null;
  const meta = library.get(id);
  if (meta) {
    return {
      i: id,
      n: meta.name,
      c: meta.collection,
      s: [meta.seed, ...(meta.secondary ? [meta.secondary] : [])],
    };
  }
  const builtin = builtins.get(id);
  if (builtin) {
    return {
      i: id,
      n: builtin.name,
      c: 'builtin',
      s: [builtin.light.primary, builtin.dark.primary],
    };
  }
  return { i: id, n: id, c: 'custom', s: [] };
}

/** The "Try in theme" choices: the first library theme of each collection, in collection order. */
export function themeChoices(): MarketTheme[] {
  const choices: MarketTheme[] = [];
  for (const collection of THEME_COLLECTIONS) {
    const first = THEME_LIBRARY_META.find((meta) => meta.collection === collection);
    const theme = first ? marketTheme(first.id) : null;
    if (theme) choices.push(theme);
  }
  return choices;
}
