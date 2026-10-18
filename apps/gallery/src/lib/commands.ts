import { haystack, normalize } from './search.ts';
import type { CompactEntry } from './types.ts';

/** Terminal commands shown in the gallery — the same ones the CLI documents. */

export function devCommand(slug: string) {
  return `pnpm protoyard dev ${slug}`;
}

export function commandsFor(slug: string) {
  return [
    { label: 'Run it (dev server, live reload)', command: devCommand(slug) },
    { label: 'Open on your phone (same Wi-Fi)', command: `pnpm protoyard dev ${slug} --host` },
    { label: 'Check it', command: `pnpm protoyard validate ${slug}` },
    { label: 'Static build', command: `pnpm protoyard build ${slug}` },
    { label: 'Portable ZIP', command: `pnpm protoyard export ${slug}` },
    { label: 'Serve the build locally', command: `pnpm protoyard preview ${slug}` },
    {
      label: 'Publish (dry run first)',
      command: `pnpm protoyard publish ${slug} --provider cloudflare --dry-run`,
    },
  ];
}

export function newCommand(input: {
  slug: string;
  template: string;
  name?: string;
  description?: string;
}) {
  const parts = [
    'pnpm protoyard new',
    input.slug || '<slug>',
    '--template',
    input.template || '<template>',
  ];
  if (input.name?.trim()) parts.push('--name', shellQuote(input.name.trim()));
  if (input.description?.trim()) parts.push('--description', shellQuote(input.description.trim()));
  return parts.join(' ');
}

/** POSIX single-quote quoting so a copied command is safe to paste. */
export function shellQuote(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

export function agentPrompt(input: { slug: string; template: string; idea: string }) {
  const slug = input.slug || '<slug>';
  const template = input.template || '<template>';
  const idea = input.idea.trim() || '<describe the product, its users and the key flows>';
  return [
    `Create a new Protoyard prototype in this repository.`,
    ``,
    `1. Run: pnpm protoyard new ${slug} --template ${template}`,
    `2. Read prototypes/${slug}/src/prototype.ts first, then AGENTS.md for the rules.`,
    `3. Build this idea: ${idea}`,
    `4. Model the domain in src/database/schema.ts, write services in src/domain/ that`,
    `   validate input, check permissions with session.assert() and run inside`,
    `   environment.run() and a transaction.`,
    `5. Add scenarios (lifecycle, roles, empty/dense data, offline) in src/scenarios/ and`,
    `   keep generators deterministic (ctx.rng, ctx.faker, ctx.ids, ctx.time — never Math.random/Date.now).`,
    `6. Verify: pnpm protoyard validate ${slug} && pnpm protoyard scenario validate ${slug} && pnpm protoyard build ${slug}`,
  ].join('\n');
}

export type PaletteAction =
  | { type: 'navigate'; href: string }
  | { type: 'open-device'; slug: string; detailHref: string; embeddedUrl: string | null }
  | { type: 'server'; slug: string; operation: 'start' | 'stop' }
  | { type: 'copy'; command: string }
  | { type: 'theme' };

export interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  description?: string;
  searchText: string;
  action: PaletteAction;
}

interface PaletteOptions {
  basePath?: string;
  controlAvailable: boolean | null;
  runningSlugs?: readonly string[];
}

function baseHref(path: string, basePath: string): string {
  const base = basePath === '/' ? '' : basePath.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}` || '/';
}

function command(
  id: string,
  label: string,
  group: string,
  searchTerms: string,
  action: PaletteAction,
  description?: string
): PaletteCommand {
  return {
    id,
    label,
    group,
    ...(description ? { description } : {}),
    searchText: normalize(`${label} ${description ?? ''} ${searchTerms}`),
    action,
  };
}

/** Creates the navigational and development actions available in the gallery. */
export function paletteCommands(
  entries: readonly CompactEntry[],
  { basePath = '/', controlAvailable, runningSlugs = [] }: PaletteOptions
): PaletteCommand[] {
  const running = new Set(runningSlugs);
  const commands: PaletteCommand[] = [
    command('page:templates', 'Go to Templates', 'Pages', 'browse starter projects templates', {
      type: 'navigate',
      href: `${baseHref('/', basePath)}#templates`,
    }),
    command('page:create', 'Create a prototype', 'Pages', 'new build generate project', {
      type: 'navigate',
      href: baseHref('/new/', basePath),
    }),
    command('action:theme', 'Toggle color theme', 'Actions', 'dark light appearance color mode', {
      type: 'theme',
    }),
  ];

  for (const entry of entries) {
    const detailHref = baseHref(
      `/${entry.k === 'prototype' ? 'p' : 't'}/${encodeURIComponent(entry.s)}/`,
      basePath
    );
    const terms = `${haystack(entry)} ${entry.s}`;
    commands.push(
      command(
        `${entry.k}:${entry.s}:open`,
        `Open ${entry.n}`,
        entry.k === 'prototype' ? 'Prototypes' : 'Templates',
        terms,
        { type: 'navigate', href: detailHref },
        entry.d || `${entry.k === 'prototype' ? 'Prototype' : 'Template'} · ${entry.s}`
      )
    );

    if (entry.k !== 'prototype') continue;
    commands.push(
      command(
        `prototype:${entry.s}:device`,
        `Open ${entry.n} in a device`,
        'Device previews',
        `${terms} phone tablet mobile preview`,
        {
          type: 'open-device',
          slug: entry.s,
          detailHref: `${detailHref}#preview-title`,
          embeddedUrl: entry.e,
        },
        'Open a live or bundled prototype with the phone shell when available.'
      )
    );

    if (controlAvailable) {
      const operation = running.has(entry.s) ? 'stop' : 'start';
      commands.push(
        command(
          `prototype:${entry.s}:${operation}`,
          `${operation === 'start' ? 'Start' : 'Stop'} ${entry.n}`,
          'Local development',
          `${terms} dev server ${operation}`,
          { type: 'server', slug: entry.s, operation },
          `${operation === 'start' ? 'Start' : 'Stop'} the local development server.`
        )
      );
    } else if (controlAvailable === false) {
      commands.push(
        command(
          `prototype:${entry.s}:copy-dev`,
          `Copy dev command for ${entry.n}`,
          'Terminal',
          `${terms} run terminal cli command copy`,
          { type: 'copy', command: devCommand(entry.s) },
          devCommand(entry.s)
        )
      );
    }
  }

  return commands;
}

function termScore(term: string, text: string): number | null {
  const start = text.indexOf(term);
  if (start >= 0) return 120 - Math.min(start, 80) + (start === 0 ? 20 : 0);

  let cursor = 0;
  let first = -1;
  let gaps = 0;
  for (const char of term) {
    const found = text.indexOf(char, cursor);
    if (found < 0) return null;
    if (first < 0) first = found;
    gaps += found - cursor;
    cursor = found + 1;
  }
  return 60 - Math.min(first, 40) - gaps;
}

/** Fuzzy ranks commands by label and registry metadata; bounded output keeps the listbox small. */
export function rankPaletteCommands(
  commands: readonly PaletteCommand[],
  query: string,
  limit = 12
): PaletteCommand[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const ranked = commands
    .map((item, order) => {
      let score = 0;
      for (const term of terms) {
        const match = termScore(term, item.searchText);
        if (match === null) return null;
        score += match;
      }
      return { item, order, score };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, Math.max(0, limit));
  return ranked.map(({ item }) => item);
}

function parseCompactIndex(text: string): CompactEntry[] {
  try {
    const value: unknown = JSON.parse(text);
    if (!Array.isArray(value)) return [];
    return value.filter(isCompactEntry);
  } catch {
    return [];
  }
}

function isCompactEntry(value: unknown): value is CompactEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<CompactEntry>;
  return (
    (entry.k === 'prototype' || entry.k === 'template') &&
    typeof entry.s === 'string' &&
    typeof entry.n === 'string' &&
    typeof entry.d === 'string' &&
    typeof entry.c === 'string' &&
    Array.isArray(entry.t) &&
    entry.t.every((tag) => typeof tag === 'string') &&
    typeof entry.p === 'string' &&
    typeof entry.st === 'string' &&
    (entry.tp === null || typeof entry.tp === 'string') &&
    (entry.i === null || typeof entry.i === 'string') &&
    typeof entry.sc === 'number' &&
    typeof entry.m === 'string' &&
    (entry.th === null || typeof entry.th === 'string') &&
    (entry.e === null || typeof entry.e === 'string')
  );
}

/** Reads the page's inline compact index, fetching the home document when absent. */
export async function loadCompactIndex(
  doc: Document,
  homeUrl: string,
  fetcher: typeof fetch = fetch
): Promise<CompactEntry[]> {
  const inline = doc.getElementById('py-index')?.textContent;
  if (inline !== undefined && inline !== null) {
    const entries = parseCompactIndex(inline);
    if (entries.length > 0) return entries;
  }

  const response = await fetcher(homeUrl, {
    headers: { accept: 'text/html' },
    cache: 'force-cache',
  });
  if (!response.ok) throw new Error(`Could not load the gallery index (HTTP ${response.status}).`);
  const html = await response.text();
  const home = new DOMParser().parseFromString(html, 'text/html');
  const text = home.getElementById('py-index')?.textContent;
  if (!text) throw new Error('The gallery home page did not contain an index.');
  const entries = parseCompactIndex(text);
  if (entries.length === 0) throw new Error('The gallery index was empty or invalid.');
  return entries;
}
