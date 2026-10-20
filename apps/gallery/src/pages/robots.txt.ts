import type { APIRoute } from 'astro';
import { withBase } from '@/lib/format';

/** Allows every crawler and, when the build knows its site, points at the sitemap. */
export const GET: APIRoute = ({ site }) => {
  const lines = ['User-agent: *', 'Allow: /'];
  if (site) lines.push('', `Sitemap: ${new URL(withBase('/sitemap.xml'), site).href}`);
  return new Response(`${lines.join('\n')}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
