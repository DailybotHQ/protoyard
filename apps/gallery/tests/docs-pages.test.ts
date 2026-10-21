// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  checkBuilt,
  checkPublicDocs,
  checkSitemap,
  parseArgs,
  sourceLinks,
} from '../../../scripts/check-public-docs.ts';
import {
  getPublicDocs,
  PUBLIC_GUIDES,
  renderMarkdown,
  rewriteDocLink,
} from '../src/lib/docs/index.ts';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function write(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

describe('public documentation pages', () => {
  it('loads only the explicitly public guide set with stable filename slugs', () => {
    const docs = getPublicDocs();

    expect(docs.length).toBeGreaterThan(0);
    expect(docs.map((doc) => doc.slug)).toEqual(expect.arrayContaining(['player', 'skill']));
    expect(docs.every((doc) => doc.slug === doc.filename.replace(/\.md$/i, '').toLowerCase())).toBe(
      true
    );
    expect(docs.every((doc) => doc.title && doc.html)).toBe(true);
    // Lead decision: user-facing guides are public; contributor docs are not.
    expect(docs.some((doc) => doc.filename === 'SECURITY.md')).toBe(true);
    for (const internal of [
      'ARCHITECTURE.md',
      'DECISIONS.md',
      'TESTING_GUIDE.md',
      'PERFORMANCE.md',
    ]) {
      expect(
        docs.some((doc) => doc.filename === internal),
        internal
      ).toBe(false);
    }
  });

  it('rewrites public guide links with anchors and configured base paths', () => {
    expect(rewriteDocLink('PLAYER.md', 'SKILL.md#trust', '/preview/')).toBe(
      '/preview/docs/skill/#trust'
    );
    expect(rewriteDocLink('PLAYER.md', 'SKILL.md#trust')).toBe('/docs/skill/#trust');
    expect(rewriteDocLink('QUICK.md', '../packages/player/README.md#embed')).toBe(
      'https://github.com/DailybotHQ/protoyard/blob/main/packages/player/README.md#embed'
    );
  });

  it('renders markdown structure while escaping raw HTML and keeping code inert', () => {
    const rendered = renderMarkdown(
      [
        '# Safe title',
        '',
        '## Repeat',
        '',
        '## Repeat',
        '',
        '<script>alert(1)</script> [unsafe](javascript:alert(1))',
        '',
        '```html',
        '<img src=x onerror=alert(1)>',
        '```',
        '',
        '| Name | Value |',
        '| --- | --- |',
        '| Example | `safe` |',
      ].join('\n'),
      'PLAYER.md'
    );

    expect(rendered.title).toBe('Safe title');
    // GitHub-compatible ids: repeated headings are numbered -1, -2, …
    expect(rendered.headings.map(({ id }) => id)).toEqual(['safe-title', 'repeat', 'repeat-1']);
    expect(rendered.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(rendered.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).not.toContain('<img');
    expect(rendered.html).not.toContain('href="javascript:');
    expect(rendered.html).toContain('<table>');
    // Code blocks and tables scroll sideways, so the keyboard must reach them (axe
    // scrollable-region-focusable).
    expect(rendered.html).toContain('<pre tabindex="0"><code class="language-html">');
    expect(rendered.html).toContain(
      '<div class="docs-table-wrap" tabindex="0" role="region" aria-label="Table, scrolls sideways"><table>'
    );
  });

  it('rejects unsafe and escaping relative links', () => {
    expect(rewriteDocLink('PLAYER.md', 'javascript:alert(1)')).toBeNull();
    expect(rewriteDocLink('PLAYER.md', '//example.com/path')).toBeNull();
    expect(rewriteDocLink('PLAYER.md', '../../../../outside.md')).toBeNull();
  });
});

/** The agreed public set: user-facing guides only (contributor docs stay on GitHub). */
const AGREED_PUBLIC_GUIDES = [
  'QUICKSTART',
  'AGENT_GUIDE',
  'GENERATOR',
  'BRIEF_TO_PROTOTYPE',
  'DATABASE',
  'SCENARIOS',
  'THEMES',
  'LAYOUTS',
  'SHELLS',
  'VIEWS',
  'CHARTS',
  'ANALYTICS',
  'SAAS_KITS',
  'AI_KITS',
  'AVATARS',
  'PUBLISHING',
  'REVIEW_COMMENTS',
  'SPECS',
  'SECURITY',
  'QUICK',
  'PLAYER',
  'PACKAGES',
  'SKILL',
  'INTERFACE',
  'MCP',
  'DWP',
];
const CONTRIBUTOR_DOCS = [
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
];

describe('the public guide set (check-public-docs)', () => {
  it('publishes exactly the agreed guides, every one with a source and a page', () => {
    expect([...PUBLIC_GUIDES].sort()).toEqual([...AGREED_PUBLIC_GUIDES].sort());
    for (const internal of CONTRIBUTOR_DOCS)
      expect(PUBLIC_GUIDES, internal).not.toContain(internal);
    expect(
      getPublicDocs()
        .map((doc) => doc.filename.replace(/\.md$/, ''))
        .sort()
    ).toEqual([...AGREED_PUBLIC_GUIDES].sort());
  });

  it('renders every page, and every link in every page resolves', () => {
    const report = checkPublicDocs();
    expect(report.problems).toEqual([]);
    expect(report.counts.guides).toBe(AGREED_PUBLIC_GUIDES.length);
    expect(report.counts.links).toBeGreaterThan(100);
  });

  it('reads source links outside code, and never images', () => {
    const markdown = [
      'See [Player](PLAYER.md#entry-points) and ![logo](../assets/logo.png).',
      'Inline `[not](a-link.md)` code.',
      '```bash',
      '[also not](inside-a-fence.md)',
      '```',
      '[Source](../packages/player/README.md "title")',
    ].join('\n');
    expect(sourceLinks(markdown)).toEqual([
      'PLAYER.md#entry-points',
      '../packages/player/README.md',
    ]);
  });

  it('names every missing, unexpected and unindexed docs route of a built site', () => {
    const dir = mkdtempSync(join(tmpdir(), 'protoyard-docs-built-'));
    roots.push(dir);
    write(join(dir, 'docs', 'index.html'), '<!doctype html>');
    write(join(dir, 'docs', 'player', 'index.html'), '<!doctype html>');
    write(join(dir, 'docs', 'decisions', 'index.html'), '<!doctype html>');
    write(join(dir, 'docs', 'search-index.json'), JSON.stringify([{ url: '/docs/player/' }]));
    const problems: string[] = [];
    const counts = { guides: 0, links: 0, routes: 0, locs: 0 };
    checkBuilt(dir, ['player', 'skill'], problems, counts);
    expect(problems).toEqual([
      `missing route: /docs/skill/ (no ${dir}/docs/skill/index.html)`,
      'unexpected route: /docs/decisions/ is not a public guide',
      'search index: /docs/skill/ is not in docs/search-index.json',
    ]);
    expect(counts.routes).toBe(2);
  });

  it('maps every sitemap <loc> to a built, indexable page under the site base, and lists every guide', () => {
    const dir = mkdtempSync(join(tmpdir(), 'protoyard-docs-sitemap-'));
    roots.push(dir);
    const site = 'https://protoyard.example/base/';
    write(
      join(dir, 'sitemap.xml'),
      `<?xml version="1.0"?><urlset>${[
        site,
        `${site}docs/player/`,
        `${site}play/`,
        `${site}player/`,
        `${site}robots.txt`,
      ]
        .map((loc) => `<url><loc>${loc}</loc></url>`)
        .join('')}</urlset>`
    );
    write(join(dir, 'index.html'), '<!doctype html>');
    write(join(dir, 'docs', 'player', 'index.html'), '<!doctype html>');
    write(join(dir, 'robots.txt'), 'User-agent: *');
    write(
      join(dir, 'player', 'index.html'),
      '<!doctype html><meta name="robots" content="noindex" />'
    );
    const problems: string[] = [];
    const counts = { guides: 0, links: 0, routes: 0, locs: 0 };
    checkSitemap(dir, ['player', 'skill'], problems, counts);
    expect(counts.locs).toBe(5);
    expect(problems).toEqual([
      `sitemap: ${site}play/ has no built page (${join(dir, 'play', 'index.html')})`,
      `sitemap: ${site}player/ is a noindex page (${join(dir, 'player', 'index.html')})`,
      'sitemap: /docs/skill/ is not listed',
    ]);
  });

  it('parses its flags', () => {
    expect(parseArgs(['--built', 'apps/gallery/dist', '--json'])).toEqual({
      json: true,
      built: 'apps/gallery/dist',
    });
    expect(parseArgs(['--sitemap', 'artifacts/showcase'])).toMatchObject({
      sitemap: 'artifacts/showcase',
    });
    expect(() => parseArgs(['--built'])).toThrow(/needs a directory/);
    expect(() => parseArgs(['--bogus'])).toThrow(/Unknown option/);
  });
});
