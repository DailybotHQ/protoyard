/**
 * Which pages may hand the player a blueprint (PLAN_004 decision on
 * `postMessage` origins): the player's own origin, plus origins named in
 * `?embedder=` that ALSO match the build-time allowlist. Matching is on the
 * exact serialized origin (`scheme://host[:port]`); `*`, `null`, paths,
 * credentials and non-http(s) schemes never qualify.
 */

/** A build-time allowlist rule: an exact origin, or a host on any port. */
export type AllowRule = { origin: string } | { host: string; schemes: ('http:' | 'https:')[] };

/** protoyard.app, and local development on any port. */
export const DEFAULT_ALLOWLIST: readonly AllowRule[] = Object.freeze([
  { origin: 'https://protoyard.app' },
  { host: 'localhost', schemes: ['http:', 'https:'] },
  { host: '127.0.0.1', schemes: ['http:', 'https:'] },
]);

/** The canonical origin `value` names, or null when it is not exactly an origin. */
export function exactOrigin(value: string): string | null {
  const text = value.trim();
  if (text === '' || text === '*' || text === 'null') return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  // Exactly an origin: no path, query or fragment (a bare trailing "/" is fine).
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) return null;
  if (text.replace(/\/$/, '') !== url.origin) return null;
  return url.origin;
}

export function allowedByRules(origin: string, rules: readonly AllowRule[]): boolean {
  const url = new URL(origin);
  return rules.some((rule) =>
    'origin' in rule
      ? rule.origin === origin
      : rule.host === url.hostname && (rule.schemes as string[]).includes(url.protocol)
  );
}

/**
 * The origins the player listens to. `search` is `location.search`;
 * `?embedder=` may repeat. `selfOrigin` is `location.origin` (dropped when it
 * is opaque, e.g. a `file:` page reports "null").
 */
export function embedderOrigins(
  search: string,
  selfOrigin: string,
  rules: readonly AllowRule[] = DEFAULT_ALLOWLIST
): string[] {
  const origins = new Set<string>();
  const self = exactOrigin(selfOrigin);
  if (self) origins.add(self);
  for (const value of new URLSearchParams(search).getAll('embedder')) {
    const origin = exactOrigin(value);
    if (origin && allowedByRules(origin, rules)) origins.add(origin);
  }
  return [...origins];
}
