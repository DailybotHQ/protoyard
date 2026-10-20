import type { APIRoute } from 'astro';
import { shelf } from '@/components/marketplace/shelf';
import { withBase } from '@/lib/format';
import { prototypes, templates } from '@/lib/registry';

const escapeXml = (value: string) => value.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Every indexable page, with absolute URLs from Astro's `site`
 * (`protoyard showcase --site https://…` or GALLERY_SITE). Without a site the
 * sitemap is empty: a sitemap may only hold absolute URLs. Embedded live demos
 * are listed when the build bundles them (a showcase).
 */
export const GET: APIRoute = ({ site }) => {
  const paths = new Set<string>(['/', '/marketplace/', '/themes/']);
  for (const entry of prototypes()) {
    paths.add(`/p/${entry.slug}/`);
    if (entry.embedded) paths.add(`/${entry.embedded.url.replace(/^\//, '')}`);
  }
  for (const entry of templates()) {
    paths.add(`/t/${entry.slug}/`);
    if (entry.embedded) paths.add(`/${entry.embedded.url.replace(/^\//, '')}`);
  }
  for (const { entry } of shelf()) paths.add(`/marketplace/${entry.k}/${entry.s}/`);
  const urls = site
    ? [...paths].map(
        (path) => `  <url><loc>${escapeXml(new URL(withBase(path), site).href)}</loc></url>`
      )
    : [];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}${urls.length ? '\n' : ''}</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
