import { describe, expect, it } from 'vitest';
import { getPublicDocs } from '../src/lib/docs/index.ts';
import { robotsTxt } from '../src/pages/robots.txt.ts';
import {
  isIndexablePath,
  type SitemapSources,
  STATIC_PATHS,
  sitemapPaths,
  sitemapXml,
  underBase,
} from '../src/pages/sitemap.xml.ts';

/**
 * The sitemap lists every canonical public page (the /play/ landing page and
 * every published guide included) with absolute, base-aware URLs, never a
 * share instance; robots.txt points at it for the configured site.
 */

const SITE = new URL('https://protoyard.app');

const sources = (overrides: Partial<SitemapSources> = {}): SitemapSources => ({
  prototypes: [
    { slug: 'crm-demo', embedded: { url: 'p/crm-demo/app/' } },
    { slug: 'helpdesk-demo' },
  ],
  templates: [{ slug: 'blank', embedded: null }],
  shelf: [{ k: 'blueprint', s: 'crm' }],
  docs: [{ slug: 'player' }, { slug: 'quickstart' }],
  ...overrides,
});

const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] ?? '');

describe('isIndexablePath', () => {
  it('accepts canonical page paths', () => {
    for (const path of ['/', '/play/', '/docs/', '/docs/player/', '/p/crm-demo/app/']) {
      expect(isIndexablePath(path), path).toBe(true);
    }
  });

  it('refuses share instances and anything that is not a canonical page path', () => {
    for (const path of [
      '/play/#bp=AAAA',
      '/play/?src=./blueprint.json',
      '/docs/player/#share-links',
      '//evil.example/',
      '/docs/../p/',
      'docs/player/',
      '/docs/player',
      '/a b/',
    ]) {
      expect(isIndexablePath(path), path).toBe(false);
    }
  });
});

describe('sitemapPaths', () => {
  it('includes the static pages, /play/, /docs/ and every published guide', () => {
    const paths = sitemapPaths(sources());
    expect(STATIC_PATHS).toEqual(['/', '/marketplace/', '/themes/', '/play/', '/docs/']);
    for (const path of [...STATIC_PATHS, '/docs/player/', '/docs/quickstart/']) {
      expect(paths, path).toContain(path);
    }
    expect(paths).toEqual(
      expect.arrayContaining([
        '/p/crm-demo/',
        '/p/crm-demo/app/',
        '/p/helpdesk-demo/',
        '/t/blank/',
        '/marketplace/blueprint/crm/',
      ])
    );
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('drops a share-instance URL even if one reaches it as an embedded demo', () => {
    const paths = sitemapPaths(
      sources({ prototypes: [{ slug: 'x', embedded: { url: 'play/#bp=AAAA' } }] })
    );
    expect(paths.some((p) => p.includes('#') || p.includes('?'))).toBe(false);
    expect(paths).toContain('/play/');
  });
});

describe('sitemapXml', () => {
  it('writes absolute URLs for the configured site and base path', () => {
    const paths = sitemapPaths(sources());
    const root = locs(sitemapXml(paths, SITE, '/'));
    expect(root).toContain('https://protoyard.app/play/');
    expect(root).toContain('https://protoyard.app/docs/');
    expect(root).toContain('https://protoyard.app/docs/player/');
    const sub = locs(sitemapXml(paths, SITE, '/protoyard/'));
    expect(sub).toContain('https://protoyard.app/protoyard/play/');
    expect(sub).toContain('https://protoyard.app/protoyard/docs/quickstart/');
    expect(sub.every((url) => url.startsWith('https://protoyard.app/protoyard/'))).toBe(true);
    expect(root.every((url) => !url.includes('#') && !url.includes('?'))).toBe(true);
  });

  it('is a valid, empty urlset without a site (a sitemap holds absolute URLs only)', () => {
    const xml = sitemapXml(sitemapPaths(sources()), undefined, '/');
    expect(xml).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n'
    );
  });

  it('escapes XML in URLs', () => {
    expect(sitemapXml(["/a'b/"], SITE, '/')).toContain('https://protoyard.app/a&#39;b/');
  });

  it('joins the base like withBase', () => {
    expect(underBase('/docs/', '/')).toBe('/docs/');
    expect(underBase('/docs/', '/sub/')).toBe('/sub/docs/');
    expect(underBase('/docs/', '/sub')).toBe('/sub/docs/');
  });
});

describe('the real published guides', () => {
  it('puts every published guide in the sitemap and no internal doc', () => {
    const docs = getPublicDocs();
    const urls = locs(sitemapXml(sitemapPaths(sources({ docs })), SITE, '/'));
    expect(docs.length).toBeGreaterThanOrEqual(19);
    for (const doc of docs)
      expect(urls, doc.slug).toContain(`https://protoyard.app/docs/${doc.slug}/`);
    for (const internal of [
      'architecture',
      'decisions',
      'testing_guide',
      'performance',
      'implementation_plan',
    ]) {
      expect(
        urls.some((url) => url.endsWith(`/docs/${internal}/`)),
        internal
      ).toBe(false);
    }
    const docUrls = urls.filter((url) => url.includes('/docs/'));
    expect(docUrls).toHaveLength(docs.length + 1);
  });
});

describe('robotsTxt', () => {
  it('points at the sitemap for the configured site and base', () => {
    expect(robotsTxt(SITE, '/')).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://protoyard.app/sitemap.xml\n'
    );
    expect(robotsTxt(SITE, '/protoyard/')).toContain(
      'Sitemap: https://protoyard.app/protoyard/sitemap.xml'
    );
  });

  it('has no Sitemap line without a site', () => {
    expect(robotsTxt(undefined, '/')).toBe('User-agent: *\nAllow: /\n');
  });
});
