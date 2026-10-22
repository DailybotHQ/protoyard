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
  /** Human-readable screen name for statically declared route metadata. */
  name?: string;
  /** Short screen summary for generated prototype specs. */
  description?: string;
  /** Optional simulated capability associated with the screen. */
  capability?: string;
  /**
   * Runs before the screen renders: `true` lets it through, a path redirects
   * (`'/sign-in?next=…'`, see {@link redirectWithNext}). The URL is replaced,
   * so Back never returns to the blocked screen. Guards must be synchronous;
   * gating on the simulated session is UX, not security.
   */
  guard?: RouteGuard;
  /**
   * Opens the screen as an overlay over the last full-screen route instead of
   * replacing it: a bottom sheet on phones and narrow hosts, a dialog (or a
   * side panel) on wider ones. Closing returns to the screen underneath; Back,
   * Forward and deep links keep working. `true` uses the defaults.
   */
  overlay?: boolean | RouteOverlayOptions;
}

export interface RouteOverlayOptions {
  /** The wide-host presentation (default `dialog`); narrow hosts always get a sheet. */
  desktop?: 'dialog' | 'side-panel';
  /** Dialog or side-panel size (default `md`). */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * The full-screen path shown underneath when the overlay is opened from a
   * deep link (no earlier screen in this session). `:params` are filled from
   * the overlay's params. Default: the nearest ancestor path that matches a
   * full-screen route, else `/`.
   */
  base?: string;
}

/** The overlay options of a route, or null when it renders full screen. */
export function routeOverlay(
  route: RouteDefinition | null | undefined
): RouteOverlayOptions | null {
  if (!route?.overlay) return null;
  return route.overlay === true ? {} : route.overlay;
}

/**
 * A statically importable screen declaration. Keep this data-only: screen
 * modules are loaded lazily so tools can inspect the table without compiling
 * Svelte components.
 */
export interface RouteMeta extends RouteDefinition {
  name: string;
  description: string;
  load: NonNullable<RouteDefinition['load']>;
}

/** Preserves literal route metadata while checking its lazy screen loaders. */
export function defineRoutes<const TRoutes extends readonly RouteMeta[]>(routes: TRoutes): TRoutes {
  return routes;
}

export type RouteGuard = (match: RouteMatch) => true | string;

/** A guard chain longer than this is treated as a loop. */
export const MAX_REDIRECTS = 5;

export interface RouteMatch {
  route: RouteDefinition | null;
  params: RouteParams;
  path: string;
  query: URLSearchParams;
  /** The originally requested path when guards redirected here. */
  redirectedFrom?: string;
  /** Set when guards looped: the router renders not-found with this message. */
  error?: string;
}

export interface RouterOptions {
  // biome-ignore lint/suspicious/noExplicitAny: same as RouteDefinition.component.
  notFound?: Component<any>;
  /** Suffix for document titles (defaults to the existing title). */
  titleSuffix?: string;
  /** Scroll to top after navigating (default true). */
  scrollToTop?: boolean;
  /**
   * Re-runs guards when something they read changes, e.g. the simulated
   * session: `revalidateOn: (refresh) => runtime.session.subscribe(refresh)`.
   * Returns an unsubscribe function, called by `destroy()`.
   */
  revalidateOn?: (refresh: () => void) => () => void;
}

export interface Router {
  /** The matched location (an overlay route while one is open). */
  readonly current: RouteMatch;
  /**
   * The full-screen route rendered underneath: equal to `current` unless an
   * overlay route is open, then the last full-screen match (or the overlay's
   * `base` / nearest ancestor for a deep link).
   */
  readonly background: RouteMatch;
  /** The open overlay route's match, or null. */
  readonly overlay: RouteMatch | null;
  /**
   * Closes the open overlay: Back when it was opened from the screen
   * underneath in this session (so history stays linear), otherwise replaces
   * the address with the screen underneath. No-op without an overlay.
   */
  closeOverlay(): void;
  readonly routes: readonly RouteDefinition[];
  readonly notFound: RouterOptions['notFound'];
  /** True when `path` is the current route or one of its ancestors. */
  isActive(path: string, exact?: boolean): boolean;
  /** Builds a `#/…` href, filling `:params`. */
  href(path: string, params?: RouteParams): string;
  match(path: string): RouteMatch;
  /** Resolves a route's component, loading (and caching) lazy routes. */
  resolve(route: RouteDefinition): AnyComponent | Promise<AnyComponent>;
  /**
   * Drops a cached lazy module so the next `resolve` calls `load` again
   * (used by `<Router>` retry after a failed chunk).
   */
  invalidate(route: RouteDefinition): void;
  /** Re-evaluates the current location and its guards (e.g. after sign-in or sign-out). */
  refresh(): void;
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

/**
 * A redirect target that remembers where the person was going:
 * `redirectWithNext('/sign-in', match)` → `/sign-in?next=%2Fsettings%3Ftab%3Dteam`.
 */
export function redirectWithNext(target: string, match: RouteMatch): string {
  const query = match.query.toString();
  const next = `${match.path}${query ? `?${query}` : ''}`;
  const separator = target.includes('?') ? '&' : '?';
  return `${target}${separator}next=${encodeURIComponent(next)}`;
}

/**
 * The in-app path to continue to after a redirect (`?next=`), or `fallback`.
 * Only same-app paths are accepted, so a crafted link can't send anyone away.
 */
export function nextPath(query: URLSearchParams, fallback = '/'): string {
  const next = query.get('next');
  if (!next?.startsWith('/') || next.startsWith('//') || /[\\\s]/.test(next)) {
    return fallback;
  }
  return next;
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
    .sort((a, b) => b.pattern.score - a.pattern.score || a.pattern.optionals - b.pattern.optionals);
  const baseTitle = options.titleSuffix ?? (typeof document !== 'undefined' ? document.title : '');

  const match = (hashOrPath: string): RouteMatch => {
    const { path, query } = parseHash(hashOrPath);
    for (const { route, pattern } of compiled) {
      const params = pattern.match(path);
      if (params) return { route, params, path, query };
    }
    return { route: null, params: {}, path, query };
  };

  /** Follows guard redirects from `hash`; stops at MAX_REDIRECTS. */
  const resolveGuards = (hash: string): RouteMatch => {
    const requested = match(hash);
    let result = requested;
    for (let hops = 0; result.route?.guard; hops++) {
      const verdict = result.route.guard(result);
      if (verdict === true) break;
      if (hops >= MAX_REDIRECTS) {
        return {
          route: null,
          params: {},
          path: requested.path,
          query: requested.query,
          error: `Too many redirects starting at ${requested.path}. Check the route guards.`,
        };
      }
      result = { ...match(verdict), redirectedFrom: requested.path };
    }
    return result;
  };

  /** What a deep-linked overlay shows underneath: its `base`, else the nearest full-screen ancestor, else `/`. */
  const fallbackBackground = (overlay: RouteMatch): RouteMatch => {
    const base = routeOverlay(overlay.route)?.base;
    const candidates: string[] = [];
    if (base) candidates.push(fillParams(base, overlay.params));
    const parts = overlay.path.split('/').filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) candidates.push(`/${parts.slice(0, i).join('/')}`);
    for (const candidate of candidates) {
      const resolved = resolveGuards(candidate);
      if (resolved.route && !routeOverlay(resolved.route)) return resolved;
    }
    return { route: null, params: {}, path: '/', query: new URLSearchParams() };
  };

  const hrefOf = (m: RouteMatch) => {
    const query = m.query.toString();
    return toHref(`${m.path}${query ? `?${query}` : ''}`);
  };
  /** `current` is a `$state` proxy, so compare by value, never by identity. */
  const sameOutcome = (a: RouteMatch, b: RouteMatch) =>
    a.route?.path === b.route?.path && hrefOf(a) === hrefOf(b) && a.error === b.error;

  /** Rewrites the address bar to the final match without adding a history entry. */
  const replaceUrl = (resolved: RouteMatch) => {
    if (resolved.redirectedFrom === undefined || typeof location === 'undefined') return;
    const href = hrefOf(resolved);
    if (location.hash !== href) {
      history.replaceState(history.state, '', `${location.pathname}${location.search}${href}`);
    }
  };

  const initial = resolveGuards(typeof location !== 'undefined' ? location.hash : '');
  replaceUrl(initial);
  let current = $state<RouteMatch>(initial);
  let background = $state<RouteMatch>(
    routeOverlay(initial.route) ? fallbackBackground(initial) : initial
  );
  /** Whether the open overlay was entered from `background` in this session (Back returns there). */
  let enteredFromBackground = false;

  const update = () => {
    const next = resolveGuards(location.hash);
    replaceUrl(next);
    const wasOverlay = routeOverlay(current.route) !== null;
    const isOverlay = routeOverlay(next.route) !== null;
    // Opening, moving between or closing overlays keeps the screen underneath (and its scroll).
    const keepsBackground = isOverlay || (wasOverlay && hrefOf(next) === hrefOf(background));
    if (isOverlay) {
      // From the full screen underneath, Back returns to it. After a move between
      // overlays Back would land on the previous overlay, so closing replaces instead.
      enteredFromBackground = !wasOverlay && sameOutcome(current, background);
    } else {
      background = next;
      enteredFromBackground = false;
    }
    current = next;
    if (typeof document !== 'undefined') {
      const title =
        next.route?.title ??
        next.route?.name ??
        (next.route ? undefined : next.error ? 'Redirect loop' : 'Not found');
      document.title = title && baseTitle ? `${title} · ${baseTitle}` : (title ?? baseTitle);
    }
    if (
      !keepsBackground &&
      options.scrollToTop !== false &&
      typeof window.scrollTo === 'function'
    ) {
      try {
        window.scrollTo({ top: 0 });
      } catch {
        // happy-dom and older engines may not implement scrollTo options.
      }
      // Under viewport presets the app scrolls inside the renderer's scroll root, not the window.
      const scrollRoot = document.querySelector<HTMLElement>('[data-py-scroll-root]');
      if (scrollRoot) scrollRoot.scrollTop = 0;
    }
  };

  const loaded = new Map<RouteDefinition, Promise<AnyComponent>>();
  const onHashChange = () => {
    // Some engines fire hashchange for our own replaceState; the redirect is already shown.
    if (current.redirectedFrom !== undefined && location.hash === hrefOf(current)) return;
    update();
  };
  const offHash = typeof window !== 'undefined' ? on(window, 'hashchange', onHashChange) : () => {};
  const refresh = () => {
    if (typeof location === 'undefined') return;
    const next = resolveGuards(location.hash);
    // Only a changed outcome re-renders; a session event on an allowed screen is a no-op.
    if (sameOutcome(next, current)) return;
    update();
  };
  const offRevalidate = options.revalidateOn?.(refresh) ?? (() => {});

  return {
    get current() {
      return current;
    },
    get background() {
      return background;
    },
    get overlay() {
      return routeOverlay(current.route) ? current : null;
    },
    closeOverlay() {
      if (!routeOverlay(current.route)) return;
      if (enteredFromBackground && typeof history !== 'undefined' && history.length > 1) {
        history.back();
        return;
      }
      const query = background.query.toString();
      navigate(`${background.path}${query ? `?${query}` : ''}`, { replace: true });
    },
    routes,
    notFound: options.notFound,
    isActive(path, exact = false) {
      const target = parseHash(toHref(path)).path;
      // Under an overlay, the screen underneath stays active too (navigation keeps its highlight).
      const paths = routeOverlay(current.route) ? [current.path, background.path] : [current.path];
      if (exact || target === '/') return paths.includes(target);
      return paths.some((p) => p === target || p.startsWith(`${target}/`));
    },
    href: (path, params) => toHref(fillParams(path, params)),
    match,
    resolve(route) {
      if (route.component) return route.component;
      let pending = loaded.get(route);
      if (!pending) {
        const load = route.load as NonNullable<RouteDefinition['load']>;
        pending = load()
          .then((m) => m.default)
          .catch((error: unknown) => {
            // Drop the rejected entry so retry / next visit can call load again.
            loaded.delete(route);
            throw error;
          });
        loaded.set(route, pending);
      }
      return pending;
    },
    invalidate(route) {
      loaded.delete(route);
    },
    refresh,
    destroy() {
      offHash();
      offRevalidate();
    },
  };
}
