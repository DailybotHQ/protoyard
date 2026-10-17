/**
 * Hash-route matching. Hash routing (`#/deals/42`) is used on purpose: it
 * survives refresh on ANY static host (no rewrite rules), works under a
 * sub-path base and inside the gallery's iframe.
 */

export type RouteParams = Record<string, string>;

export interface ParsedLocation {
  /** Normalized path, always starting with `/` and without a trailing slash. */
  path: string;
  /** Query parameters that live inside the hash (`#/deals?stage=won`). */
  query: URLSearchParams;
}

export function normalizePath(path: string): string {
  let p = path.trim();
  if (p.startsWith('#')) p = p.slice(1);
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/\/{2,}/g, '/');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

export function parseHash(hash: string): ParsedLocation {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const q = raw.indexOf('?');
  const path = normalizePath(q === -1 ? raw : raw.slice(0, q));
  return { path, query: new URLSearchParams(q === -1 ? '' : raw.slice(q + 1)) };
}

/** Turns `/deals/42` or `#/deals/42` into the `#/deals/42` href form. */
export function toHref(path: string): string {
  const raw = path.startsWith('#') ? path.slice(1) : path;
  const q = raw.indexOf('?');
  const pathname = normalizePath(q === -1 ? raw : raw.slice(0, q));
  return `#${pathname}${q === -1 ? '' : raw.slice(q)}`;
}

export interface CompiledPattern {
  pattern: string;
  /** Static segments weigh more, so `/deals/new` beats `/deals/:id`. */
  score: number;
  match(path: string): RouteParams | null;
}

export function compilePattern(pattern: string): CompiledPattern {
  const segments = normalizePath(pattern).split('/').filter(Boolean);
  let score = 0;
  for (const segment of segments) score += segment === '*' ? 0 : segment.startsWith(':') ? 2 : 3;
  return {
    pattern,
    score,
    match(path) {
      const parts = normalizePath(path).split('/').filter(Boolean);
      const params: RouteParams = {};
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i] as string;
        if (segment === '*') {
          params['*'] = parts.slice(i).map(safeDecode).join('/');
          return params;
        }
        const part = parts[i];
        const optional = segment.startsWith(':') && segment.endsWith('?');
        if (part === undefined) {
          // `/notes/:id?` matches `/notes`; anything else needs every segment.
          if (optional) continue;
          return null;
        }
        if (segment.startsWith(':')) {
          params[segment.slice(1, optional ? -1 : undefined)] = safeDecode(part);
        } else if (segment !== part) {
          return null;
        }
      }
      return parts.length <= segments.length ? params : null;
    },
  };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
