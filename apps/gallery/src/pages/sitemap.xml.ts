import type { APIRoute } from 'astro';
import { getPublicDocs } from '../lib/docs/index.ts';

const escapeXml = (value: string) => value.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Site pages that always exist: home, marketplace, themes, the player landing page and the docs. */
export const STATIC_PATHS: readonly string[] = [
  '/',
  '/marketplace/',
  '/themes/',
  '/play/',
  '/docs/',
];

export interface SitemapSources {
  prototypes: readonly { slug: string; embedded?: { url: string } | null }[];
  templates: readonly { slug: string; embedded?: { url: string } | null }[];
  /** Marketplace detail pages (`/marketplace/<kind>/<slug>/`). */
  shelf: readonly { k: string; s: string }[];
  /** Published guides (`getPublicDocs()`), each at `/docs/<slug>/`. */
  docs: readonly { slug: string }[];
}

/**
 * A canonical, indexable page path: root-relative, ending in `/`, with no
 * query or fragment. Share instances (`/play/#bp=…`, `?src=…`) never qualify:
 * each one is a viewer's blueprint, not a page of the site.
 */
export function isIndexablePath(path: string): boolean {
  return (
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !/[?#\s\\]/.test(path) &&
    !path.split('/').includes('..') &&
    path.endsWith('/')
  );
}

/** Every indexable page path, before the base path, in a stable order. */
export function sitemapPaths(sources: SitemapSources): string[] {
  const paths = new Set<string>(STATIC_PATHS);
  for (const doc of sources.docs) paths.add(`/docs/${doc.slug}/`);
  for (const entry of sources.prototypes) {
    paths.add(`/p/${entry.slug}/`);
    if (entry.embedded) paths.add(`/${entry.embedded.url.replace(/^\//, '')}`);
  }
  for (const entry of sources.templates) {
    paths.add(`/t/${entry.slug}/`);
    if (entry.embedded) paths.add(`/${entry.embedded.url.replace(/^\//, '')}`);
  }
  for (const entry of sources.shelf) paths.add(`/marketplace/${entry.k}/${entry.s}/`);
  return [...paths].filter(isIndexablePath);
}

/** `path` under the configured base (`/` or `/sub/`), like `withBase`. */
export function underBase(path: string, base: string): string {
  return `${base.replace(/\/$/, '')}${path}`;
}

/**
 * The sitemap document. URLs are absolute from Astro's `site`
 * (`protoyard showcase --site https://…` or GALLERY_SITE); without a site it
 * is empty, because a sitemap may only hold absolute URLs.
 */
export function sitemapXml(
  paths: readonly string[],
  site: URL | undefined,
  base: string = import.meta.env.BASE_URL
): string {
  const urls = site
    ? paths.map(
        (path) => `  <url><loc>${escapeXml(new URL(underBase(path, base), site).href)}</loc></url>`
      )
    : [];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}${urls.length ? '\n' : ''}</urlset>\n`;
}

/**
 * Every indexable page: the static pages, every published guide, prototype,
 * template and marketplace detail page, and the embedded live demos a
 * showcase build bundles.
 */
export const GET: APIRoute = async ({ site }) => {
  // The registry is a build-time virtual module; loaded here so the builders above stay testable.
  const [{ prototypes, templates }, { shelf }] = await Promise.all([
    import('../lib/registry.ts'),
    import('../components/marketplace/shelf.ts'),
  ]);
  const paths = sitemapPaths({
    prototypes: prototypes(),
    templates: templates(),
    shelf: shelf().map(({ entry }) => entry),
    docs: getPublicDocs(),
  });
  return new Response(sitemapXml(paths, site), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
