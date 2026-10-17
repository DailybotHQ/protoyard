import type { CompactEntry } from './types';

/** Accent- and case-insensitive text for matching ("Álpha" matches "alpha"). */
export function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function haystack(entry: CompactEntry): string {
  return normalize(
    [entry.n, entry.s, entry.d, entry.c, entry.tp ?? '', entry.p, ...entry.t].join(' ')
  );
}

export interface BrowseQuery {
  q: string;
  kind: 'all' | 'prototype' | 'template';
  platform: string;
  category: string;
  tag: string;
  sort: 'name' | 'modified';
  view: 'all' | 'favorites' | 'recent';
}

export const DEFAULT_QUERY: BrowseQuery = {
  q: '',
  kind: 'prototype',
  platform: '',
  category: '',
  tag: '',
  sort: 'name',
  view: 'all',
};

/**
 * Pure filter/sort over a pre-normalized index, so 1,000+ entries filter in
 * well under a frame on every keystroke.
 */
export function applyQuery(
  index: readonly { entry: CompactEntry; text: string }[],
  query: BrowseQuery,
  library: { favorites: readonly string[]; recent: readonly string[] }
): CompactEntry[] {
  const terms = normalize(query.q).split(/\s+/).filter(Boolean);
  const favorites = new Set(library.favorites);
  const recentRank = new Map(library.recent.map((slug, i) => [slug, i]));
  const out: CompactEntry[] = [];
  for (const { entry, text } of index) {
    if (query.kind !== 'all' && entry.k !== query.kind) continue;
    if (query.platform && entry.p !== query.platform) continue;
    if (query.category && entry.c !== query.category) continue;
    if (query.tag && !entry.t.includes(query.tag)) continue;
    if (query.view === 'favorites' && !favorites.has(entry.s)) continue;
    if (query.view === 'recent' && !recentRank.has(entry.s)) continue;
    if (terms.length > 0 && !terms.every((t) => text.includes(t))) continue;
    out.push(entry);
  }
  if (query.view === 'recent') {
    out.sort((a, b) => (recentRank.get(a.s) ?? 0) - (recentRank.get(b.s) ?? 0));
  } else if (query.sort === 'modified') {
    out.sort((a, b) => b.m.localeCompare(a.m) || a.n.localeCompare(b.n));
  } else {
    out.sort((a, b) => a.n.localeCompare(b.n) || a.s.localeCompare(b.s));
  }
  return out;
}

/** Query ⇄ URL search params, so a filtered view can be bookmarked or shared. */
export function queryFromParams(params: URLSearchParams): BrowseQuery {
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const value = params.get(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  };
  return {
    q: (params.get('q') ?? '').slice(0, 200),
    kind: pick('kind', ['all', 'prototype', 'template'] as const, DEFAULT_QUERY.kind),
    platform: (params.get('platform') ?? '').slice(0, 40),
    category: (params.get('category') ?? '').slice(0, 40),
    tag: (params.get('tag') ?? '').slice(0, 40),
    sort: pick('sort', ['name', 'modified'] as const, DEFAULT_QUERY.sort),
    view: pick('view', ['all', 'favorites', 'recent'] as const, DEFAULT_QUERY.view),
  };
}

export function paramsFromQuery(query: BrowseQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query) as [keyof BrowseQuery, string][]) {
    if (value && value !== DEFAULT_QUERY[key]) params.set(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}
