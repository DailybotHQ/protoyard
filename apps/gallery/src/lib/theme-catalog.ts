import type { Theme } from '@protoyard/core';
import {
  BUILTIN_THEMES,
  loadAllLibraryThemes,
  THEME_LIBRARY_META,
  themeVariables,
} from '@protoyard/themes';

/** Serializable card for the Themes page (CSS vars precomputed at build time). */
export interface ThemeCardData {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: readonly string[];
  source: 'builtin' | 'library';
  /** Inline style applying light-mode `--py-*` tokens. */
  lightStyle: string;
  /** Inline style applying dark-mode `--py-*` tokens. */
  darkStyle: string;
  seed?: string;
}

function styleAttr(theme: Theme, mode: 'light' | 'dark'): string {
  const vars = themeVariables({ theme, resolvedMode: mode, reducedMotion: true });
  return Object.entries(vars)
    .map(([name, value]) => `${name}:${value}`)
    .join(';');
}

function cardFromTheme(
  theme: Theme,
  source: 'builtin' | 'library',
  category: string,
  tags: readonly string[],
  seed?: string
): ThemeCardData {
  return {
    id: theme.id,
    name: theme.name,
    description: theme.description,
    category,
    tags,
    source,
    lightStyle: styleAttr(theme, 'light'),
    darkStyle: styleAttr(theme, 'dark'),
    ...(seed ? { seed } : {}),
  };
}

/** Built-ins + library presets with live light/dark token styles. */
export async function buildThemeCatalog(): Promise<ThemeCardData[]> {
  const library = await loadAllLibraryThemes();
  const metaById = new Map(THEME_LIBRARY_META.map((meta) => [meta.id, meta]));
  const cards: ThemeCardData[] = BUILTIN_THEMES.map((theme) =>
    cardFromTheme(theme, 'builtin', 'builtin', ['builtin', 'core'])
  );
  for (const theme of library) {
    const meta = metaById.get(theme.id);
    cards.push(
      cardFromTheme(
        theme,
        'library',
        meta?.category ?? 'library',
        meta?.tags ?? ['library'],
        meta?.seed
      )
    );
  }
  return cards;
}

/** Unique categories in catalog order (builtin first). */
export function themeCategories(cards: readonly ThemeCardData[]): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const card of cards) {
    if (seen.has(card.category)) continue;
    seen.add(card.category);
    list.push(card.category);
  }
  return list;
}

export function filterThemeCards(
  cards: readonly ThemeCardData[],
  options: { category?: string; q?: string } = {}
): ThemeCardData[] {
  const category = options.category?.trim() ?? '';
  const needle = (options.q ?? '').trim().toLowerCase();
  return cards.filter((card) => {
    if (category && category !== 'all' && card.category !== category) return false;
    if (!needle) return true;
    const haystack =
      `${card.id} ${card.name} ${card.description} ${card.category} ${card.tags.join(' ')}`.toLowerCase();
    return needle.split(/\s+/).every((term) => haystack.includes(term));
  });
}

/** Append `theme` (and optional `mode`) to a prototype preview URL. */
export function withThemeParam(url: string, themeId: string, mode?: 'light' | 'dark'): string {
  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
  const joiner = beforeHash.includes('?') ? '&' : '?';
  let next = `${beforeHash}${joiner}theme=${encodeURIComponent(themeId)}`;
  if (mode) next += `&mode=${mode}`;
  return `${next}${hash}`;
}
