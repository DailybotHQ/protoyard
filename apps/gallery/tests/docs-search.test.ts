import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DocsSearch from '../src/components/docs/DocsSearch.svelte';
import {
  GITHUB_SOURCE,
  getPublicDocs,
  PUBLIC_GUIDES,
  renderMarkdown,
} from '../src/lib/docs/index.ts';
import {
  buildSearchIndex,
  type DocsSearchIndex,
  isDocsSearchIndex,
  MAX_SECTION_CHARS,
  queryTokens,
  searchDocs,
} from '../src/lib/docs/search.ts';

/**
 * Docs search (ADR: build-time index, no remote service): sections and
 * anchors come from the rendered guides, search ranks heading matches first,
 * the combobox is keyboard-operable and announces results, and every link on
 * every public page resolves.
 */

// A string, not `new URL()`: under happy-dom, URL is not Node's (fileURLToPath rejects it).
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
afterEach(() => cleanup());

const SAMPLE = [
  '# Sharing guide',
  '',
  'Intro text about sharing prototypes.',
  '',
  '## Share links',
  '',
  'A share link encodes the blueprint in the fragment.',
  '',
  '- Links stay under 16 KB.',
  '',
  '```bash',
  'secretcommand --never-indexed',
  '```',
  '',
  '| Limit | Value |',
  '| --- | --- |',
  '| Decoded | 256 KB |',
  '',
  '## Café privacy',
  '',
  'Nothing leaves the browser.',
].join('\n');

function sampleIndex(): DocsSearchIndex {
  const rendered = renderMarkdown(SAMPLE, 'PLAYER.md');
  return buildSearchIndex([{ slug: 'player', filename: 'PLAYER.md', ...rendered }], '/preview/');
}

describe('sections from the renderer', () => {
  it('collects prose, list, quote and table text per heading, never fenced code', () => {
    const { sections, headings } = renderMarkdown(SAMPLE, 'PLAYER.md');
    expect(sections.map((s) => s.id)).toEqual(headings.map((h) => h.id));
    expect(sections.map((s) => s.id)).toEqual(['sharing-guide', 'share-links', 'café-privacy']);
    const share = sections.find((s) => s.id === 'share-links');
    expect(share?.text).toContain('encodes the blueprint');
    expect(share?.text).toContain('Links stay under 16 KB.');
    expect(share?.text).toContain('Decoded 256 KB');
    expect(share?.text).not.toContain('never-indexed');
  });

  it('uses GitHub-compatible heading ids so GitHub-authored anchors resolve', () => {
    const { headings } = renderMarkdown(
      [
        '# T',
        '## The showcase: gallery + live demos as one site',
        '## Pages (`--comments`)',
        '## A',
        '## A',
      ].join('\n\n'),
      'X.md'
    );
    expect(headings.map((h) => h.id)).toEqual([
      't',
      'the-showcase-gallery--live-demos-as-one-site',
      'pages---comments',
      'a',
      'a-1',
    ]);
  });
});

describe('buildSearchIndex', () => {
  it('has one entry per heading with the base path and an anchor (none for the title)', () => {
    const index = sampleIndex();
    expect(index.format).toBe('protoyard.docs-search');
    expect(index.entries.map((e) => e.href)).toEqual([
      '/preview/docs/player/',
      '/preview/docs/player/#share-links',
      '/preview/docs/player/#café-privacy',
    ]);
    expect(index.entries.every((e) => e.docTitle === 'Sharing guide')).toBe(true);
    expect(isDocsSearchIndex(index)).toBe(true);
  });

  it('caps section text', () => {
    const long = renderMarkdown(`# T\n\n## Long\n\n${'word '.repeat(2000)}`, 'X.md');
    const index = buildSearchIndex([{ slug: 'x', filename: 'X.md', ...long }]);
    expect(Math.max(...index.entries.map((e) => e.text.length))).toBeLessThanOrEqual(
      MAX_SECTION_CHARS
    );
  });
});

describe('searchDocs', () => {
  const index = sampleIndex();

  it('requires every word, ranks heading matches first and returns the anchor', () => {
    const results = searchDocs(index, 'share link');
    expect(results[0]?.entry.href).toBe('/preview/docs/player/#share-links');
    expect(searchDocs(index, 'share zebra')).toEqual([]);
    // "sharing" only appears in the title section; "share" heads the second.
    expect(searchDocs(index, 'share').map((r) => r.entry.id)[0]).toBe('share-links');
  });

  it('matches without accents or case and builds a plain-text snippet', () => {
    const [first] = searchDocs(index, 'CAFE');
    expect(first?.entry.id).toBe('café-privacy');
    const [byText] = searchDocs(index, 'fragment');
    expect(byText?.snippet).toContain('fragment');
    expect(byText?.snippet).not.toMatch(/</);
  });

  it('ignores empty queries, caps words and limits results', () => {
    expect(searchDocs(index, '   ')).toEqual([]);
    expect(queryTokens('a b c d e f g h i j k')).toHaveLength(8);
    expect(queryTokens('x'.repeat(500))[0]?.length).toBe(100);
    expect(searchDocs(index, 'the', 1).length).toBeLessThanOrEqual(1);
  });

  it('refuses an index with unsafe or foreign hrefs', () => {
    const good = sampleIndex();
    const entry = good.entries[0];
    if (!entry) throw new Error('fixture');
    for (const href of ['javascript:alert(1)', '//evil.example/docs/', 'https://evil.example/']) {
      expect(isDocsSearchIndex({ ...good, entries: [{ ...entry, href }] }), href).toBe(false);
    }
    expect(isDocsSearchIndex({ ...good, format: 'other' })).toBe(false);
    expect(isDocsSearchIndex(null)).toBe(false);
  });
});

describe('the real docs corpus', () => {
  const docs = getPublicDocs();
  const index = buildSearchIndex(docs);

  it('publishes the allow-listed guides that exist and keeps internal docs out', () => {
    const existing = PUBLIC_GUIDES.filter((g) => existsSync(join(REPO, 'docs', `${g}.md`)));
    expect(docs.map((d) => d.filename.replace(/\.md$/, ''))).toEqual(existing);
    expect(docs.length).toBeGreaterThanOrEqual(19);
    for (const internal of [
      'ARCHITECTURE',
      'DECISIONS',
      'STANDARDS',
      'TESTING_GUIDE',
      'DEVELOPMENT_COMMANDS',
      'PERFORMANCE',
      'AI_AGENT_ONBOARDING',
      'AI_AGENT_COLLAB',
      'IMPLEMENTATION_PLAN',
      'PRODUCT_SPEC',
    ]) {
      expect(PUBLIC_GUIDES, internal).not.toContain(internal);
    }
  });

  it('indexes every heading of every page with an anchor that exists on that page', () => {
    const ids = new Map(docs.map((d) => [d.slug, new Set(d.headings.map((h) => h.id))]));
    expect(index.entries.length).toBe(docs.reduce((n, d) => n + d.headings.length, 0));
    for (const entry of index.entries) {
      expect(ids.get(entry.doc)?.has(entry.id), entry.href).toBe(true);
    }
    expect(isDocsSearchIndex(index)).toBe(true);
    // Fetched on demand by docs pages only; keep it a reasonable download.
    expect(JSON.stringify(index).length).toBeLessThan(600_000);
  });

  it('finds sections by title and by content and points at their headings', () => {
    const byHeading = searchDocs(index, 'share links');
    expect(byHeading[0]?.entry.doc).toBe('player');
    expect(byHeading[0]?.entry.href).toMatch(/^\/docs\/player\/#/);
    const byTitle = searchDocs(index, 'security model');
    expect(byTitle.some((r) => r.entry.doc === 'security')).toBe(true);
    const byContent = searchDocs(index, 'IndexedDB');
    expect(byContent.length).toBeGreaterThan(1);
  });

  it('every page renders and every link on it resolves', () => {
    const ids = new Map(docs.map((d) => [d.slug, new Set(d.headings.map((h) => h.id))]));
    /** Heading ids of a repository Markdown file (for GitHub links with a fragment). */
    const fileIds = (path: string) =>
      new Set(
        renderMarkdown(readFileSync(join(REPO, path), 'utf8'), path).headings.map((h) => h.id)
      );
    const problems: string[] = [];
    let checked = 0;
    for (const doc of docs) {
      expect(doc.title, doc.filename).toBeTruthy();
      expect(doc.html.length, doc.filename).toBeGreaterThan(100);
      for (const match of doc.html.matchAll(/href="([^"]+)"/g)) {
        const href = (match[1] ?? '').replaceAll('&amp;', '&');
        checked += 1;
        const at = `${doc.filename}: ${href}`;
        if (href.startsWith('#')) {
          if (!ids.get(doc.slug)?.has(decodeURIComponent(href.slice(1))))
            problems.push(`${at} (no heading)`);
        } else if (href.startsWith('/docs/')) {
          const [, slug, fragment] = /^\/docs\/([^/]+)\/(?:#(.*))?$/.exec(href) ?? [];
          if (!slug || !ids.has(slug)) problems.push(`${at} (no page)`);
          else if (fragment && !ids.get(slug)?.has(decodeURIComponent(fragment)))
            problems.push(`${at} (no heading)`);
        } else if (href.startsWith(GITHUB_SOURCE)) {
          const [path = '', fragment] = href.slice(GITHUB_SOURCE.length).split('#');
          const file = decodeURIComponent(path);
          if (!existsSync(join(REPO, file))) problems.push(`${at} (no file)`);
          else if (
            fragment &&
            file.endsWith('.md') &&
            !fileIds(file).has(decodeURIComponent(fragment))
          )
            problems.push(`${at} (no heading in ${file})`);
        } else if (!/^(https?:|mailto:)/.test(href)) {
          problems.push(`${at} (unexpected link form)`);
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
    expect(problems).toEqual([]);
  });

  it('links source files on main, the branch the public site builds from', () => {
    expect(GITHUB_SOURCE).toBe('https://github.com/DailybotHQ/protoyard/blob/main/');
    expect(docs.some((d) => d.html.includes('/blob/dev/'))).toBe(false);
  });
});

describe('DocsSearch component', () => {
  const index = sampleIndex();

  function setup(fetchIndex = vi.fn(async () => index as unknown)) {
    const navigate = vi.fn();
    render(DocsSearch, {
      props: { indexUrl: '/preview/docs/search-index.json', fetchIndex, navigate },
    });
    const input = screen.getByRole('combobox', { name: 'Search the documentation' });
    return { input, navigate, fetchIndex };
  }

  it('loads the index once on focus, shows results and announces the count', async () => {
    const { input, fetchIndex } = setup();
    expect(fetchIndex).not.toHaveBeenCalled();
    await fireEvent.focus(input);
    await fireEvent.input(input, { target: { value: 'share' } });
    const list = await screen.findByRole('listbox', { name: 'Documentation search results' });
    expect(list).toBeTruthy();
    expect(fetchIndex).toHaveBeenCalledTimes(1);
    expect(fetchIndex).toHaveBeenCalledWith('/preview/docs/search-index.json');
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/result/));
    const first = screen.getAllByRole('option')[0]?.querySelector('a');
    expect(first?.getAttribute('href')).toBe('/preview/docs/player/#share-links');
  });

  it('moves through results with the arrow keys and opens one with Enter', async () => {
    const { input, navigate } = setup();
    await fireEvent.input(input, { target: { value: 'share' } });
    await screen.findByRole('listbox');
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe('docs-search-option-0');
    expect(screen.getAllByRole('option')[0]?.getAttribute('aria-selected')).toBe('true');
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigate).toHaveBeenCalledWith('/preview/docs/player/#share-links');
  });

  it('closes with Escape, then clears the query with a second Escape', async () => {
    const { input } = setup();
    await fireEvent.input(input, { target: { value: 'share' } });
    await screen.findByRole('listbox');
    await fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.getAttribute('aria-expanded')).toBe('false');
    await fireEvent.keyDown(input, { key: 'Escape' });
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('says when nothing matches', async () => {
    const { input } = setup();
    await fireEvent.input(input, { target: { value: 'zebra' } });
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('No results for “zebra”.')
    );
  });

  it('reports an unavailable or invalid index instead of failing silently', async () => {
    for (const fetchIndex of [
      vi.fn(async () => {
        throw new Error('offline');
      }),
      vi.fn(async () => ({
        format: 'protoyard.docs-search',
        version: 1,
        entries: [{ href: 'javascript:x' }],
      })),
    ]) {
      const { input } = setup(fetchIndex);
      await fireEvent.input(input, { target: { value: 'share' } });
      await waitFor(() => expect(screen.getByRole('status').textContent).toContain('unavailable'));
      expect(screen.queryByRole('listbox')).toBeNull();
      cleanup();
    }
  });
});
