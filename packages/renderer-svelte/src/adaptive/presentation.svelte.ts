import type { PrototypeRuntime, ResolvedShell, ViewportPreset } from '@protoyard/core';

export type PresentationView = 'phone' | 'desktop';
export type PresentationPreference = 'auto' | PresentationView;

export interface AdaptivePresentationOptions {
  /** Query key read from either the page query or the query on the hash route. */
  queryKey?: string;
  /** Defaults to a per-prototype key when a runtime is supplied. */
  storageKey?: string;
  /** Storage is injectable for hosts that provide their own preference store. */
  storage?: Storage;
  /** The frame root whose `data-py-shell` attribute reports the active shell. */
  root?: HTMLElement;
  /** Width at and above which automatic presentation is desktop. */
  desktopMinWidth?: number;
  /** Shell and viewport overrides used when a person chooses a presentation. */
  mapping?: Record<PresentationView, { shell: ResolvedShell; viewport: ViewportPreset }>;
  /** Width used before an observed container reports its first measurement. */
  initialWidth?: number;
}

export interface AdaptivePresentationStore {
  readonly view: PresentationView;
  readonly preference: PresentationPreference;
  readonly width: number;
  setPreference(next: PresentationPreference): Promise<void>;
  toggle(): Promise<void>;
  /** Applies the resolved view to the runtime, when a runtime was supplied. */
  syncShell(): Promise<void>;
  /** Observe the actual app host, which may be narrower than the browser window. */
  observe(node: Element): () => void;
  /** Remove listeners and subscriptions owned by this store. */
  destroy(): void;
}

const DEFAULT_MAPPING: Record<
  PresentationView,
  { shell: ResolvedShell; viewport: ViewportPreset }
> = {
  phone: { shell: 'phone', viewport: 'iphone' },
  desktop: { shell: 'none', viewport: 'desktop' },
};

const DEFAULT_QUERY_KEY = 'view';
const DEFAULT_DESKTOP_MIN_WIDTH = 1024;

function viewValue(value: string | null): PresentationView | null {
  return value === 'phone' || value === 'desktop' ? value : null;
}

/** Reads a view override from `?view=` or a query attached to a hash route. */
export function parsePresentationView(
  href: string,
  queryKey = DEFAULT_QUERY_KEY
): PresentationView | null {
  try {
    const url = new URL(href, 'http://protoyard.example');
    const hashQuery = url.hash.includes('?')
      ? new URLSearchParams(url.hash.slice(url.hash.indexOf('?') + 1)).get(queryKey)
      : null;
    return viewValue(url.searchParams.get(queryKey)) ?? viewValue(hashQuery);
  } catch {
    return null;
  }
}

/** Resolves explicit link, active phone frame, saved choice, then host width. */
export function resolvePresentationView(input: {
  link: PresentationView | null;
  phoneFrame: boolean;
  preference: PresentationPreference;
  width: number;
  desktopMinWidth?: number;
}): PresentationView {
  if (input.link) return input.link;
  if (input.phoneFrame) return 'phone';
  if (input.preference !== 'auto') return input.preference;
  return input.width >= (input.desktopMinWidth ?? DEFAULT_DESKTOP_MIN_WIDTH) ? 'desktop' : 'phone';
}

/** Removes this store's view override while preserving all other URL state. */
export function presentationUrlWithoutOverride(href: string, queryKey = DEFAULT_QUERY_KEY): string {
  const url = new URL(href, 'http://protoyard.example');
  url.searchParams.delete(queryKey);

  const hashIndex = url.hash.indexOf('?');
  if (hashIndex >= 0) {
    const path = url.hash.slice(0, hashIndex);
    const params = new URLSearchParams(url.hash.slice(hashIndex + 1));
    params.delete(queryKey);
    const query = params.toString();
    url.hash = query ? `${path}?${query}` : path;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function readPreference(storage: Storage | undefined, key: string): PresentationPreference {
  try {
    const stored = storage?.getItem(key);
    return stored === 'phone' || stored === 'desktop' ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

function writePreference(
  storage: Storage | undefined,
  key: string,
  preference: PresentationPreference
): void {
  try {
    if (preference === 'auto') storage?.removeItem(key);
    else storage?.setItem(key, preference);
  } catch {
    // The preference remains active for this page when browser storage is unavailable.
  }
}

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Opt-in phone/desktop presentation state for a prototype. The runtime is
 * optional so the same policy can drive a UI-only preview without shell writes.
 */
export function createAdaptivePresentation(
  runtime?: Pick<PrototypeRuntime, 'overrides' | 'manifest'>,
  options: AdaptivePresentationOptions = {}
): AdaptivePresentationStore {
  const queryKey = options.queryKey ?? DEFAULT_QUERY_KEY;
  const desktopMinWidth = options.desktopMinWidth ?? DEFAULT_DESKTOP_MIN_WIDTH;
  const mapping = { ...DEFAULT_MAPPING, ...options.mapping };
  const storageKey =
    options.storageKey ??
    (runtime
      ? `protoyard.${runtime.manifest.storage.namespace}.presentation`
      : 'protoyard.presentation');
  const storage = options.storage ?? browserStorage();
  const root =
    options.root ?? (typeof document === 'undefined' ? undefined : document.documentElement);
  const initialWidth = options.initialWidth ?? root?.getBoundingClientRect().width;

  let preference = $state<PresentationPreference>(readPreference(storage, storageKey));
  let width = $state(
    initialWidth && initialWidth > 0
      ? initialWidth
      : typeof window === 'undefined'
        ? desktopMinWidth
        : window.innerWidth
  );
  let href = $state(typeof location === 'undefined' ? 'http://protoyard.example/' : location.href);
  let phoneFrame = $state(root?.dataset.pyShell === mapping.phone.shell);
  let destroyed = false;
  let observedHost: Element | undefined;

  const view = $derived(
    resolvePresentationView({
      link: parsePresentationView(href, queryKey),
      phoneFrame,
      preference,
      width,
      desktopMinWidth,
    })
  );

  const refreshLocation = () => {
    if (typeof location !== 'undefined') href = location.href;
  };
  const refreshShell = () => {
    phoneFrame = root?.dataset.pyShell === mapping.phone.shell;
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', refreshLocation);
    window.addEventListener('popstate', refreshLocation);
    window.addEventListener('resize', refreshWidth);
  }

  function refreshWidth(): void {
    const measured = observedHost?.getBoundingClientRect().width;
    width = measured || root?.getBoundingClientRect().width || window.innerWidth;
  }

  const shellObserver =
    root && typeof MutationObserver !== 'undefined'
      ? new MutationObserver(refreshShell)
      : undefined;
  shellObserver?.observe(root as HTMLElement, {
    attributes: true,
    attributeFilter: ['data-py-shell'],
  });

  let lastShell = runtime?.overrides.get().shell;
  const unsubscribe = runtime?.overrides.subscribe((overrides) => {
    const shell = overrides.shell;
    if (shell === lastShell) return;
    lastShell = shell;
    if (shell === undefined) {
      preference = 'auto';
      writePreference(storage, storageKey, preference);
      return;
    }
    const selected =
      shell === mapping.phone.shell ? 'phone' : shell === mapping.desktop.shell ? 'desktop' : null;
    if (selected) {
      preference = selected;
      writePreference(storage, storageKey, selected);
    }
  });

  async function syncShell(): Promise<void> {
    if (!runtime || destroyed) return;
    const target = mapping[view];
    const current = runtime.overrides.get();
    if (current.shell === target.shell && current.viewport === target.viewport) return;
    lastShell = target.shell;
    await runtime.overrides.set({ shell: target.shell, viewport: target.viewport });
  }

  async function setPreference(next: PresentationPreference): Promise<void> {
    preference = next;
    writePreference(storage, storageKey, next);

    if (typeof location !== 'undefined' && parsePresentationView(location.href, queryKey)) {
      const nextUrl = presentationUrlWithoutOverride(location.href, queryKey);
      history.replaceState(history.state, '', nextUrl);
      href = location.href;
    }

    if (!runtime) return;
    if (next === 'auto') {
      lastShell = undefined;
      await runtime.overrides.clear(['shell', 'viewport']);
      return;
    }
    await syncShell();
  }

  return {
    get view() {
      return view;
    },
    get preference() {
      return preference;
    },
    get width() {
      return width;
    },
    setPreference,
    toggle: () => setPreference(view === 'desktop' ? 'phone' : 'desktop'),
    syncShell,
    observe(node: Element) {
      if (destroyed) return () => {};
      observedHost = node;
      refreshWidthFrom(node);
      if (typeof ResizeObserver === 'undefined') {
        return () => {
          if (observedHost === node) observedHost = undefined;
        };
      }
      const observer = new ResizeObserver((entries) => {
        const measured = entries[0]?.contentRect.width;
        if (measured !== undefined && measured > 0) width = measured;
      });
      observer.observe(node);
      return () => {
        observer.disconnect();
        if (observedHost === node) observedHost = undefined;
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      shellObserver?.disconnect();
      unsubscribe?.();
      if (typeof window !== 'undefined') {
        window.removeEventListener('hashchange', refreshLocation);
        window.removeEventListener('popstate', refreshLocation);
        window.removeEventListener('resize', refreshWidth);
      }
    },
  };

  function refreshWidthFrom(node: Element): void {
    const measured = node.getBoundingClientRect().width;
    if (measured > 0) width = measured;
  }
}
