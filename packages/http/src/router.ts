export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof METHODS)[number];

export interface CompiledRoute<H> {
  /** The key as written: `GET /deals/:id`. */
  key: string;
  method: HttpMethod;
  pattern: string;
  params: string[];
  regex: RegExp;
  handler: H;
}

/** `'GET /deals/:id'` → method + matcher. Throws on malformed keys at startup. */
export function compileRoutes<H>(routes: Record<string, H>): CompiledRoute<H>[] {
  return Object.entries(routes).map(([key, handler]) => {
    const match = /^([A-Z]+)\s+(\/\S*)$/.exec(key.trim());
    const method = match?.[1] as HttpMethod | undefined;
    const pattern = match?.[2];
    if (!method || !pattern || !METHODS.includes(method)) {
      throw new Error(
        `Invalid route "${key}". Use "<METHOD> /path/:param" with one of ${METHODS.join(', ')}.`
      );
    }
    const params: string[] = [];
    const source = pattern
      .split('/')
      .map((segment) => {
        if (segment.startsWith(':')) {
          params.push(segment.slice(1));
          return '([^/]+)';
        }
        return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    return {
      key,
      method,
      pattern,
      params,
      regex: new RegExp(`^${source === '' ? '/' : source}/?$`),
      handler,
    };
  });
}

export type RouteMatch<H> =
  | { kind: 'found'; route: CompiledRoute<H>; params: Record<string, string> }
  | { kind: 'method-not-allowed'; allow: HttpMethod[] }
  | { kind: 'not-found' };

export function matchRoute<H>(
  routes: readonly CompiledRoute<H>[],
  method: string,
  path: string
): RouteMatch<H> {
  const allow = new Set<HttpMethod>();
  for (const route of routes) {
    const hit = route.regex.exec(path);
    if (!hit) continue;
    if (route.method !== method) {
      allow.add(route.method);
      continue;
    }
    const params: Record<string, string> = {};
    route.params.forEach((name, index) => {
      const raw = hit[index + 1] ?? '';
      try {
        params[name] = decodeURIComponent(raw);
      } catch {
        params[name] = raw;
      }
    });
    return { kind: 'found', route, params };
  }
  return allow.size ? { kind: 'method-not-allowed', allow: [...allow] } : { kind: 'not-found' };
}
