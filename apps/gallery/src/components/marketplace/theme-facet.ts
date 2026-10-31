import { BUILTIN_THEMES, loadFullLibraryMeta, THEME_COLLECTIONS } from '@protoyard/themes';
import type { MarketTheme } from './model';

/*
 * Build-time only (imported by shelf.ts and the marketplace pages, never by
 * the browse island): maps a registry `defaultTheme` id to what a card shows.
 * Library themes (every one: the catalog and Texuli's expanded set) use their
 * metadata (seed and secondary colors; no palette is built), built-ins their
 * light and dark primary, anything else is the prototype's own theme.
 */

/** Every library theme's metadata, catalog first; loaded once at build time. */
const FULL_LIBRARY = await loadFullLibraryMeta();
const library = new Map(FULL_LIBRARY.map((meta) => [meta.id, meta]));
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
    const first = FULL_LIBRARY.find((meta) => meta.collection === collection);
    const theme = first ? marketTheme(first.id) : null;
    if (theme) choices.push(theme);
  }
  return choices;
}
