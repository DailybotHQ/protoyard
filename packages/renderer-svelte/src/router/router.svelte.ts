import type { Component } from 'svelte';
import { on } from 'svelte/events';
import {
  type CompiledPattern,
  compilePattern,
  parseHash,
  type RouteParams,
  toHref,
} from './match.ts';

export interface RouteProps {
  params: RouteParams;
  query: URLSearchParams;
}

// biome-ignore lint/suspicious/noExplicitAny: route components accept arbitrary extra props.
type AnyComponent = Component<any>;

export interface RouteDefinition {
  /** `/`, `/deals`, `/deals/:id`, `/settings/*`. */
  path: string;
  /** The screen, imported eagerly… */
  component?: AnyComponent;
  /**
   * …or lazily, so the screen becomes its own chunk:
   * `load: () => import('./screens/Reports.svelte')`.
   */
  load?: () => Promise<{ default: AnyComponent }>;
  /** Used for `document.title` as `<title> · <prototype name>`. */
  title?: string;
}

export interface RouteMatch {
  route: RouteDefinition | null;
  params: RouteParams;
  path: string;
  query: URLSearchParams;
}

export interface RouterOptions {
  // biome-ignore lint/suspicious/noExplicitAny: same as RouteDefinition.component.
  notFound?: Component<any>;
  /** Suffix for document titles (defaults to the existing title). */
  titleSuffix?: string;
  /** Scroll to top after navigating (default true). */
  scrollToTop?: boolean;
}

export interface Router {
  readonly current: RouteMatch;
  readonly routes: readonly RouteDefinition[];
  readonly notFound: RouterOptions['notFound'];
  /** True when `path` is the current route or one of its ancestors. */
  isActive(path: string, exact?: boolean): boolean;
  /** Builds a `#/…` href, filling `:params`. */
  href(path: string, params?: RouteParams): string;
  match(path: string): RouteMatch;
  /** Resolves a route's component, loading (and caching) lazy routes. */
  resolve(route: RouteDefinition): AnyComponent | Promise<AnyComponent>;
  destroy(): void;
}

/** Global navigation helper — hash routing has exactly one location. */
export function navigate(path: string, options: { replace?: boolean } = {}): void {
  const href = toHref(path);
  if (options.replace) {
    history.replaceState(history.state, '', `${location.pathname}${location.search}${href}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else if (location.hash !== href) {
    location.hash = href;
  }
}

export function back(fallback = '/'): void {
  if (history.length > 1) history.back();
  else navigate(fallback, { replace: true });
}

export function fillParams(path: string, params: RouteParams = {}): string {
  return path.replace(/:([A-Za-z0-9_]+)\??/g, (_, name: string) =>
    encodeURIComponent(params[name] ?? '')
  );
}

export function createRouter(
  routes: readonly RouteDefinition[],
  options: RouterOptions = {}
): Router {
  for (const route of routes) {
    if (!route.component && !route.load) {
      throw new Error(`[protoyard] Route "${route.path}" needs a component or a load() function.`);
    }
  }
  const compiled: { route: RouteDefinition; pattern: CompiledPattern }[] = routes
    .map((route) => ({ route, pattern: compilePattern(route.path) }))
    .sort((a, b) => b.pattern.score - a.pattern.score);
  const baseTitle = options.titleSuffix ?? (typeof document !== 'undefined' ? document.title : '');

  const match = (hashOrPath: string): RouteMatch => {
    const { path, query } = parseHash(hashOrPath);
    for (const { route, pattern } of compiled) {
      const params = pattern.match(path);
      if (params) return { route, params, path, query };
    }
    return { route: null, params: {}, path, query };
  };

  let current = $state<RouteMatch>(match(typeof location !== 'undefined' ? location.hash : ''));

  const update = () => {
    const next = match(location.hash);
    current = next;
    if (typeof document !== 'undefined') {
      const title = next.route?.title ?? (next.route ? undefined : 'Not found');
      document.title = title && baseTitle ? `${title} · ${baseTitle}` : (title ?? baseTitle);
    }
    if (options.scrollToTop !== false && typeof window.scrollTo === 'function') {
      try {
        window.scrollTo({ top: 0 });
      } catch {
        // happy-dom and older engines may not implement scrollTo options.
      }
    }
  };

  const loaded = new Map<RouteDefinition, Promise<AnyComponent>>();
  const off = typeof window !== 'undefined' ? on(window, 'hashchange', update) : () => {};

  return {
    get current() {
      return current;
    },
    routes,
    notFound: options.notFound,
    isActive(path, exact = false) {
      const target = parseHash(toHref(path)).path;
      if (exact || target === '/') return current.path === target;
      return current.path === target || current.path.startsWith(`${target}/`);
    },
    href: (path, params) => toHref(fillParams(path, params)),
    match,
    resolve(route) {
      if (route.component) return route.component;
      let pending = loaded.get(route);
      if (!pending) {
        pending = (route.load as NonNullable<RouteDefinition['load']>)().then((m) => m.default);
        // A failed chunk (offline, redeploy) may be retried on the next visit.
        pending.catch(() => loaded.delete(route));
        loaded.set(route, pending);
      }
      return pending;
    },
    destroy: off,
  };
}
