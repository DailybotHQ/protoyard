import type { SidebarSection } from '../components/sidebar/types.ts';
import { navIconComponent } from './NavIcon.svelte';
import { navBadge, navPath, type ResolvedNavItem, type ResolvedNavSection } from './nav-model.ts';

/*
 * Small helpers the desktop layouts share (PLAN_003 Task 73). Imported only
 * by lazy layout modules, so the bundler puts them in a shared layout chunk,
 * never in the boot path.
 */

/** The hash path now (`#/deals?x=1` → `/deals`); `/` outside a browser. */
export function currentHashPath(): string {
  return typeof location === 'undefined' ? '/' : navPath(location.hash || '/');
}

/**
 * Subscribes to in-app navigation (hash routers and history). Returns the
 * unsubscribe function, so it fits straight into an `$effect`.
 */
export function onNavigate(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('hashchange', listener);
  window.addEventListener('popstate', listener);
  return () => {
    window.removeEventListener('hashchange', listener);
    window.removeEventListener('popstate', listener);
  };
}

/** The resolved nav as `<Sidebar sections>`: icon names become components, badge getters values. */
export function sidebarSections(sections: readonly ResolvedNavSection[]): SidebarSection[] {
  return sections.map((section) => ({
    ...(section.label ? { label: section.label } : {}),
    items: section.items.map((item) => {
      const icon = navIconComponent(item.icon);
      const badge = navBadge(item.badge);
      return {
        label: item.label,
        href: item.href,
        active: item.inTrail,
        ...(icon ? { icon } : {}),
        ...(badge !== undefined ? { badge } : {}),
      };
    }),
  }));
}

/** Every top-level item, in section order. */
export function topLevelItems(sections: readonly ResolvedNavSection[]): ResolvedNavItem[] {
  return sections.flatMap((section) => [...section.items]);
}

/**
 * localStorage key for a layout's persisted UI state, per prototype: the
 * host's `storageKey` (the prototype's namespace) or, without one, the page
 * path, which differs per published prototype.
 */
export function layoutStorageKey(name: string, storageKey?: string): string {
  const scope = storageKey ?? (typeof location === 'undefined' ? '' : location.pathname);
  return `protoyard:layout:${scope}:${name}`;
}

/** Reads a stored boolean; private windows and blocked storage fall back to `fallback`. */
export function readFlag(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === '1';
  } catch {
    return fallback;
  }
}

/** Stores a boolean; failures (quota, blocked storage) are ignored: the state stays in memory. */
export function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Storage is a convenience here, never required.
  }
}

/**
 * Calls `close` once `element` is at least `minWidth` px wide: the drawer
 * only exists below the breakpoint, and a modal left open on a wide layout
 * would trap focus behind invisible chrome. Returns the cleanup.
 */
export function closeWhenWide(
  element: HTMLElement | undefined,
  minWidth: number,
  close: () => void
): () => void {
  if (!element || typeof ResizeObserver === 'undefined') return () => {};
  const observer = new ResizeObserver(([entry]) => {
    if (entry && entry.contentRect.width >= minWidth) close();
  });
  observer.observe(element);
  return () => observer.disconnect();
}
