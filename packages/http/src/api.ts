import type { PrototypeRuntime } from '@protoyard/core';
import { type ErrorMapping, mapError, OfflineFetchError } from './errors.ts';
import { createNetworkLog, DEFAULT_LOG_SIZE, type NetworkLog, preview } from './log.ts';
import { registerMockApi } from './registry.ts';
import { HttpError, MockResponse, toResponse } from './response.ts';
import { compileRoutes, type HttpMethod, matchRoute } from './router.ts';

/** What a handler receives. `body` is parsed JSON (or text for non-JSON requests). */
export interface MockRequest<TDb = unknown> {
  method: HttpMethod;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  headers: Headers;
  runtime: PrototypeRuntime<TDb>;
}

/** Return plain data (200 JSON), a `MockResponse`, or `undefined` (204). */
export type RouteHandler<TDb = unknown> = (request: MockRequest<TDb>) => unknown | Promise<unknown>;

export type Routes<TDb = unknown> = Record<string, RouteHandler<TDb>>;

export interface MockApiOptions<TDb = unknown> {
  /** Path prefix (`/api`) or absolute URL (`https://api.example.test/v1`). */
  baseUrl?: string;
  routes: Routes<TDb>;
  /** Network log size (default 200). */
  logSize?: number;
  /**
   * Map prototype-specific errors before the defaults, e.g. a PaywallError to
   * 402. Return undefined to fall through.
   */
  mapError?: (error: unknown) => MockResponse | undefined;
}

export interface MockApi {
  readonly baseUrl: string;
  /** Route keys as declared. */
  readonly routes: readonly string[];
  readonly log: NetworkLog;
  /** fetch-compatible: resolves with a real `Response`, rejects when offline. */
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  /** Handles a `Request` whose URL is under `baseUrl`. */
  handle(request: Request): Promise<Response>;
  /** True when a URL belongs to this API (used by installGlobalFetch). */
  matches(input: RequestInfo | URL): boolean;
  /** Removes it from `getMockApis(runtime)` (DevTools). */
  unregister(): void;
}

/** Relative URLs resolve against the page; in Node there is no page, so use a stable origin. */
function documentBase(): string {
  const href = (globalThis as { location?: { href?: string } }).location?.href;
  return href && /^https?:/.test(href) ? href : 'http://localhost/';
}

function toUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) return input;
  if (typeof input === 'string') return new URL(input, documentBase());
  return new URL(input.url, documentBase());
}

async function readBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text === '') return undefined;
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('json') || /^\s*[[{"]/.test(text)) {
    try {
      return JSON.parse(text);
    } catch {
      throw new HttpError(400, 'Request body is not valid JSON.');
    }
  }
  return text;
}

/**
 * A mock HTTP API over a prototype's own services: no server, no service
 * worker. Every call goes through `runtime.environment.run('http.<METHOD> <route>')`,
 * so DevTools' offline / latency / failure toggles (and `failureScope: ['http.']`)
 * apply exactly as they do to services.
 */
export function createMockApi<TDb = unknown>(
  runtime: PrototypeRuntime<TDb>,
  options: MockApiOptions<TDb>
): MockApi {
  const base = new URL(options.baseUrl ?? '/api', documentBase());
  const basePath = base.pathname.replace(/\/+$/, '');
  const compiled = compileRoutes(options.routes);
  const log = createNetworkLog(options.logSize ?? DEFAULT_LOG_SIZE);

  const matches = (input: RequestInfo | URL) => {
    const url = toUrl(input);
    return (
      url.origin === base.origin &&
      (url.pathname === basePath || url.pathname.startsWith(`${basePath}/`) || basePath === '')
    );
  };

  const resolveError = (error: unknown): ErrorMapping =>
    options.mapError?.(error) ?? mapError(error);

  async function handle(request: Request): Promise<Response> {
    const started = performance.now();
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const path = url.pathname.slice(basePath.length) || '/';
    const entry = {
      at: runtime.clock.now().toISOString(),
      method,
      url: `${url.pathname}${url.search}`,
      route: null as string | null,
    };

    let requestBody: unknown;
    let result: MockResponse | OfflineFetchError;
    try {
      requestBody = await readBody(request);
      const match = matchRoute(compiled, method, path);
      if (match.kind === 'not-found') {
        result = new MockResponse(404, {
          error: 'not_found',
          message: `No route for ${method} ${path}.`,
        });
      } else if (match.kind === 'method-not-allowed') {
        result = new MockResponse(
          405,
          { error: 'method_not_allowed', message: `${method} is not allowed on ${path}.` },
          { allow: match.allow.join(', ') }
        );
      } else {
        entry.route = match.route.key;
        const value = await runtime.environment.run(`http.${match.route.key}`, () =>
          match.route.handler({
            method: match.route.method,
            path,
            params: match.params,
            query: url.searchParams,
            body: requestBody,
            headers: request.headers,
            runtime,
          })
        );
        result =
          value instanceof MockResponse
            ? value
            : value === undefined
              ? new MockResponse(204, null)
              : new MockResponse(200, value);
      }
    } catch (error) {
      result = resolveError(error);
    }

    const durationMs = Math.round(performance.now() - started);
    if (result instanceof OfflineFetchError) {
      log.add({
        ...entry,
        status: null,
        durationMs,
        requestBody: preview(requestBody),
        error: 'Failed to fetch (offline, simulated)',
      });
      throw result;
    }
    log.add({
      ...entry,
      status: result.status,
      durationMs,
      requestBody: preview(requestBody),
      responseBody: preview(result.body),
    });
    return toResponse(result);
  }

  let unregister = () => {};
  const api: MockApi = {
    baseUrl: base.href.replace(/\/+$/, ''),
    routes: compiled.map((route) => route.key),
    log,
    matches,
    handle,
    fetch(input, init) {
      const url = toUrl(input);
      if (!matches(url)) {
        return Promise.reject(new TypeError(`${url.href} is outside the mock API (${base.href}).`));
      }
      // Relative strings were resolved above; a Request keeps its own method/body.
      const request = input instanceof Request ? new Request(input, init) : new Request(url, init);
      return handle(request);
    },
    unregister: () => unregister(),
  };
  unregister = registerMockApi(runtime as PrototypeRuntime<unknown>, api);
  return api;
}
