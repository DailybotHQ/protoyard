import type { APIRoute } from 'astro';
import { getPublicDocs } from '@/lib/docs';
import { buildSearchIndex } from '@/lib/docs/search';
import { withBase } from '@/lib/format';

/**
 * The docs search index, generated at build time as a static file. Only docs
 * pages fetch it, and only when a reader starts a search.
 */
export const GET: APIRoute = () => {
  const base = withBase('');
  return new Response(JSON.stringify(buildSearchIndex(getPublicDocs(base), base)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
