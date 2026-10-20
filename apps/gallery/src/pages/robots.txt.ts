import type { APIRoute } from 'astro';
import { underBase } from './sitemap.xml.ts';

/** Allows every crawler and, when the build knows its site, points at the sitemap. */
export function robotsTxt(site: URL | undefined, base: string = import.meta.env.BASE_URL): string {
  const lines = ['User-agent: *', 'Allow: /'];
  if (site) lines.push('', `Sitemap: ${new URL(underBase('/sitemap.xml', base), site).href}`);
  return `${lines.join('\n')}\n`;
}

export const GET: APIRoute = ({ site }) =>
  new Response(robotsTxt(site), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
