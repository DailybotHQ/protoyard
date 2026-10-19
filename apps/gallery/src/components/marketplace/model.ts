import { CATALOG_CATEGORIES } from '@protoyard/core';
import { normalize } from '../../lib/search.ts';

/**
 * The marketplace's data model: pure functions over the registry, shared by
 * the static pages (build time) and the browse and create islands (runtime).
 * The gallery reads only the registry (ADR-001), never prototype code.
 */

export type MarketKind = 'prototype' | 'template' | 'blueprint';

/** One shelf item, kept small: the browse island inlines every entry as JSON. */
export interface MarketEntry {
  k: MarketKind;
  s: string;
  n: string;
  d: string;
  i: string | null;
  /** Catalog category (always one of CATALOG_CATEGORIES). */
  c: string;
  /** Product type, e.g. "CRM". */
  pt: string | null;
  /** Catalog platforms (web, mobile, desktop, widget…). */
  pf: string[];
  /** Resolved shell the card frames the thumbnail in. */
  sh: string;
  /** Feature keys. */
  f: string[];
  df: string | null;
  /** Base-relative thumbnail URL, or null. */
  th: string | null;
  sc: number;
}

/** The registry fields the marketplace reads (any kind, including blueprints). */
export interface MarketSource {
  kind: string;
  slug: string;
  name: string;
  description: string;
  icon: string | null;
  scenarioCount: number;
  catalog?: {
    category?: string;
    productType?: string | null;
    platforms?: string[];
    shell?: string;
    features?: string[];
    difficulty?: string | null;
  } | null;
}

const KINDS: readonly MarketKind[] = ['prototype', 'template', 'blueprint'];
const CATEGORY_ORDER: readonly string[] = CATALOG_CATEGORIES;

/** Only entries with a catalog block in a shared category are shelved. */
export function toMarketEntry(source: MarketSource, thumbnail: string | null): MarketEntry | null {
  const kind = source.kind as MarketKind;
  const catalog = source.catalog;
  if (!KINDS.includes(kind) || !catalog?.category || !CATEGORY_ORDER.includes(catalog.category)) {
    return null;
  }
  return {
    k: kind,
    s: source.slug,
    n: source.name,
    d: source.description,
    i: source.icon,
    c: catalog.category,
    pt: catalog.productType ?? null,
    pf: catalog.platforms ?? [],
    sh: catalog.shell ?? 'none',
    f: catalog.features ?? [],
    df: catalog.difficulty ?? null,
    th: thumbnail,
    sc: source.scenarioCount,
  };
}

export interface MarketQuery {
  q: string;
  kind: '' | MarketKind;
  category: string;
  platform: string;
  shell: string;
  /** Every selected feature must be present. */
  features: string[];
}

export const EMPTY_QUERY: MarketQuery = {
  q: '',
  kind: '',
  category: '',
  platform: '',
  shell: '',
  features: [],
};

export function isFiltered(query: MarketQuery): boolean {
  return (
    query.q.trim() !== '' ||
    query.kind !== '' ||
    query.category !== '' ||
    query.platform !== '' ||
    query.shell !== '' ||
    query.features.length > 0
  );
}

function haystack(entry: MarketEntry): string {
  return normalize(
    [entry.n, entry.s, entry.d, entry.pt ?? '', entry.c, ...entry.pf, entry.sh, ...entry.f].join(
      ' '
    )
  );
}

export function matches(entry: MarketEntry, query: MarketQuery): boolean {
  if (query.kind && entry.k !== query.kind) return false;
  if (query.category && entry.c !== query.category) return false;
  if (query.platform && !entry.pf.includes(query.platform)) return false;
  if (query.shell && entry.sh !== query.shell) return false;
  if (query.features.some((feature) => !entry.f.includes(feature))) return false;
  const terms = normalize(query.q).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = haystack(entry);
  return terms.every((term) => text.includes(term));
}

const KIND_RANK: Record<MarketKind, number> = { prototype: 0, template: 1, blueprint: 2 };

/** Filtered entries, flagship prototypes first, then templates, then blueprints, by name. */
export function filterMarket(entries: readonly MarketEntry[], query: MarketQuery): MarketEntry[] {
  return entries
    .filter((entry) => matches(entry, query))
    .sort(
      (a, b) => KIND_RANK[a.k] - KIND_RANK[b.k] || a.n.localeCompare(b.n) || a.s.localeCompare(b.s)
    );
}

/** Category rails in the shared catalog order; empty categories are omitted. */
export function groupRails(entries: readonly MarketEntry[]): [string, MarketEntry[]][] {
  const rails = new Map<string, MarketEntry[]>();
  for (const entry of entries) rails.set(entry.c, [...(rails.get(entry.c) ?? []), entry]);
  return [...rails.entries()].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0])
  );
}

export type Facet = [value: string, count: number];

export interface Facets {
  kind: Facet[];
  category: Facet[];
  platform: Facet[];
  shell: Facet[];
  features: Facet[];
}

function count(values: readonly string[]): Facet[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function facets(entries: readonly MarketEntry[]): Facets {
  return {
    kind: count(entries.map((e) => e.k)).sort(
      (a, b) => KIND_RANK[a[0] as MarketKind] - KIND_RANK[b[0] as MarketKind]
    ),
    category: count(entries.map((e) => e.c)).sort(
      (a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0])
    ),
    platform: count(entries.flatMap((e) => e.pf)),
    shell: count(entries.map((e) => e.sh)),
    features: count(entries.flatMap((e) => e.f)),
  };
}

/** URL ↔ query, so a filtered view is shareable (`?category=ai&feature=voice`). */
export function queryFromParams(params: URLSearchParams): MarketQuery {
  const kind = params.get('kind') ?? '';
  return {
    q: params.get('q') ?? '',
    kind: KINDS.includes(kind as MarketKind) ? (kind as MarketKind) : '',
    category: CATEGORY_ORDER.includes(params.get('category') ?? '')
      ? (params.get('category') ?? '')
      : '',
    platform: params.get('platform') ?? '',
    shell: params.get('shell') ?? '',
    features: [...new Set(params.getAll('feature').filter(Boolean))],
  };
}

export function paramsFromQuery(query: MarketQuery): string {
  const params = new URLSearchParams();
  if (query.q.trim()) params.set('q', query.q.trim());
  if (query.kind) params.set('kind', query.kind);
  if (query.category) params.set('category', query.category);
  if (query.platform) params.set('platform', query.platform);
  if (query.shell) params.set('shell', query.shell);
  for (const feature of query.features) params.append('feature', feature);
  const text = params.toString();
  return text ? `?${text}` : '';
}

const LABELS: Record<string, string> = {
  ai: 'AI',
  hr: 'HR',
  'developer-tools': 'Developer tools',
  'internal-tools': 'Internal tools',
  'real-estate': 'Real estate',
  'desktop-window': 'Desktop window',
  'widget-host': 'Widget on a site',
  'extension-popup': 'Extension popup',
  'side-panel': 'Plugin panel',
  none: 'Full screen',
  prototype: 'Prototype',
  template: 'Template',
  blueprint: 'Blueprint',
};

/** "developer-tools" → "Developer tools"; known acronyms and shells get fixed labels. */
export function label(value: string): string {
  if (LABELS[value]) return LABELS[value];
  const text = value.replace(/-/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function detailHref(entry: Pick<MarketEntry, 'k' | 's'>): string {
  return `/marketplace/${entry.k}/${encodeURIComponent(entry.s)}/`;
}

// --- Create flow ("Use this template" / "Remix" / "Use this blueprint") -------

/** Mirrors core checkSlug(): lowercase kebab-case, 2–48 characters. */
const SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function slugError(slug: string): string {
  if (slug === '') return 'Choose a slug.';
  if (slug.length < 2 || slug.length > 48 || !SLUG_PATTERN.test(slug)) {
    return 'Use lowercase kebab-case, 2–48 characters (e.g. "team-crm").';
  }
  return '';
}

/** "Team CRM ÿ" → "team-crm-y" (a suggestion; the user can edit it). */
export function suggestSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^[^a-z]+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
}

/** POSIX single-quote quoting so a copied command is safe to paste. */
function quote(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

/** The exact command for the same action, shown when the gallery is read-only. */
export function createCommand(
  source: Pick<MarketEntry, 'k' | 's'>,
  input: { slug: string; name?: string }
): string {
  const slug = input.slug || '<slug>';
  if (source.k === 'blueprint') {
    return `pnpm protoyard generate ${slug} --blueprint blueprints/${source.s}.json`;
  }
  const parts = ['pnpm protoyard new', slug, '--from', source.s];
  if (input.name?.trim()) parts.push('--name', quote(input.name.trim()));
  return parts.join(' ');
}

/** Body for POST /api/new. Blueprints are generated, not copied: they have no request. */
export function createRequest(
  source: Pick<MarketEntry, 'k' | 's'>,
  input: { slug: string; name?: string }
): { slug: string; from: string; name?: string } | null {
  if (source.k === 'blueprint') return null;
  const name = input.name?.trim();
  return { slug: input.slug, from: source.s, ...(name ? { name } : {}) };
}

export type CreateOutcome =
  | { state: 'running'; slug: string; url: string }
  | { state: 'created'; slug: string; error: string }
  | { state: 'needs-install'; slug: string; command: string; next: string }
  | { state: 'failed'; error: string };

/**
 * Reads the POST /api/new response. `localUrl` is the gallery's guard that a
 * URL is a dev server on this machine; anything else is never opened.
 */
export function interpretCreate(
  body: Record<string, unknown>,
  ok: boolean,
  localUrl: (url: string) => string | null
): CreateOutcome {
  if (!ok || body.ok !== true) {
    return {
      state: 'failed',
      error: String(body.error ?? 'The control server refused the request.'),
    };
  }
  const slug = String(body.slug ?? '');
  if (body.linked === false) {
    const command = String(body.command ?? 'pnpm install');
    return {
      state: 'needs-install',
      slug,
      command,
      next: String(body.next ?? `Run \`${command}\`, then start ${slug}.`),
    };
  }
  if (body.started === false) {
    return { state: 'created', slug, error: String(body.error ?? 'It could not be started.') };
  }
  const url = localUrl(String(body.url ?? ''));
  if (!url) {
    return {
      state: 'created',
      slug,
      error: 'The control server returned a non-local URL; it was not opened.',
    };
  }
  return { state: 'running', slug, url };
}
