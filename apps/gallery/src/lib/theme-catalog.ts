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
  collection: string;
  mood: readonly string[];
  tags: readonly string[];
  source: 'builtin' | 'library';
  /** Inline style applying light-mode `--tx-*` tokens. */
  lightStyle: string;
  /** Inline style applying dark-mode `--tx-*` tokens. */
  darkStyle: string;
  /** Chart series colors, derived from the precomputed mode styles. */
  chartColors: readonly string[];
  seed?: string;
}

function styleAttr(theme: Theme, mode: 'light' | 'dark'): string {
  const vars = Object.entries(themeVariables({ theme, resolvedMode: mode, reducedMotion: true }));
  const overridden = new Set(
    vars
      .filter(([name]) => name.startsWith('--py-'))
      .map(([name]) => name.replace('--py-', '--tx-'))
  );
  return vars
    .filter(([name]) => !name.startsWith('--tx-') || !overridden.has(name))
    .map(
      ([name, value]) =>
        `${name.replaceAll('--py-', '--tx-')}:${value.replaceAll('--py-', '--tx-')}`
    )
    .join(';');
}

function cardFromTheme(
  theme: Theme,
  source: 'builtin' | 'library',
  category: string,
  collection: string,
  mood: readonly string[],
  tags: readonly string[],
  seed?: string
): ThemeCardData {
  const lightStyle = styleAttr(theme, 'light');
  const darkStyle = styleAttr(theme, 'dark');
  const chartColors = [...lightStyle.matchAll(/--tx-chart-([1-8]):([^;]+)/g)]
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map((match) => match[2] ?? '')
    .filter(Boolean);
  return {
    id: theme.id,
    name: theme.name,
    description: theme.description,
    category,
    collection,
    mood,
    tags,
    source,
    lightStyle,
    darkStyle,
    chartColors,
    ...(seed ? { seed } : {}),
  };
}

/** Built-ins + library presets with live light/dark token styles. */
export async function buildThemeCatalog(): Promise<ThemeCardData[]> {
  const library = await loadAllLibraryThemes();
  const metaById = new Map(THEME_LIBRARY_META.map((meta) => [meta.id, meta]));
  const cards: ThemeCardData[] = BUILTIN_THEMES.map((theme) =>
    cardFromTheme(theme, 'builtin', 'builtin', 'builtin', [], ['builtin', 'core'])
  );
  for (const theme of library) {
    const meta = metaById.get(theme.id);
    cards.push(
      cardFromTheme(
        theme,
        'library',
        meta?.category ?? 'library',
        meta?.collection ?? 'industry',
        meta?.mood ?? [],
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
  options: { category?: string; collection?: string; mood?: string; q?: string } = {}
): ThemeCardData[] {
  const category = options.category?.trim() ?? '';
  const collection = options.collection?.trim() ?? '';
  const mood = options.mood?.trim() ?? '';
  const needle = (options.q ?? '').trim().toLowerCase();
  return cards.filter((card) => {
    if (category && category !== 'all' && card.category !== category) return false;
    if (collection && collection !== 'all' && card.collection !== collection) return false;
    if (mood && mood !== 'all' && !card.mood.includes(mood)) return false;
    if (!needle) return true;
    const haystack =
      `${card.id} ${card.name} ${card.description} ${card.category} ${card.collection} ${card.mood.join(' ')} ${card.tags.join(' ')}`.toLowerCase();
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
