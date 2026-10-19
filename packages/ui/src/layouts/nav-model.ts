import type { SidebarItem, SidebarSection } from '../components/sidebar/types.ts';
import type { IconComponent } from '../lib/types.ts';

/*
 * The navigation every layout renders (PLAN_003, ADR-021): data, not markup,
 * so one prototype definition works in a sidebar, a rail, a top bar, a tab
 * bar or a drawer, and switching layouts never changes what the app offers.
 * Pure and framework-free: the active item comes from the hash path, the
 * same rule as the renderer's `router.isActive`.
 */

/**
 * Lucide icons a nav model can name. The map from name to component lives in
 * `NavIcon.svelte`, so only layouts (lazy chunks) pay for the icons.
 */
export type NavIconName =
  | 'activity'
  | 'archive'
  | 'bell'
  | 'book-open'
  | 'bot'
  | 'briefcase'
  | 'building'
  | 'calendar'
  | 'chart-column'
  | 'chart-line'
  | 'chart-pie'
  | 'check-square'
  | 'clock'
  | 'code'
  | 'credit-card'
  | 'database'
  | 'file-text'
  | 'folder'
  | 'folder-kanban'
  | 'globe'
  | 'graduation-cap'
  | 'heart'
  | 'help'
  | 'home'
  | 'inbox'
  | 'kanban'
  | 'key'
  | 'layers'
  | 'layout-dashboard'
  | 'life-buoy'
  | 'list-todo'
  | 'mail'
  | 'map'
  | 'map-pin'
  | 'megaphone'
  | 'message-square'
  | 'package'
  | 'plug'
  | 'plus'
  | 'receipt'
  | 'search'
  | 'settings'
  | 'shield'
  | 'shopping-cart'
  | 'sparkles'
  | 'star'
  | 'store'
  | 'tag'
  | 'truck'
  | 'user'
  | 'users'
  | 'wallet'
  | 'workflow';

/** An icon by name (data-friendly) or any Lucide-compatible component. */
export type NavIconRef = NavIconName | IconComponent;

/** A badge value, or a getter so a `$state`/`$derived` count stays live when read in markup. */
export type NavBadge = string | number | (() => string | number | undefined);

export interface NavModelItem {
  /** Stable id (keys, tests, comment anchors). */
  id: string;
  label: string;
  /** Hash href, e.g. `#/deals`. */
  href: string;
  icon?: NavIconRef;
  badge?: NavBadge;
  /** Only the exact path counts as active (`#/` always behaves this way). */
  exact?: boolean;
  /** One level of sub-navigation (a section's pages). */
  children?: readonly NavModelItem[];
}

export interface NavSection {
  id: string;
  /** Optional heading; layouts hide it where there is no room. */
  label?: string;
  items: readonly NavModelItem[];
}

/**
 * A primary action ("New deal"). It either navigates (`href`) or runs
 * `onSelect`; a returned promise drives the layout's pending state.
 */
export interface NavAction {
  id: string;
  label: string;
  icon?: NavIconRef;
  href?: string;
  onSelect?: () => unknown;
}

export interface NavUser {
  name: string;
  /** Role, email or workspace shown under the name. */
  detail?: string;
  href?: string;
  /** The persona's photo, resolved by the renderer (`avatarImage(persona.avatar)`); initials when absent. */
  image?: { src?: string | null; srcset?: string | null };
}

export interface NavModel {
  brand?: { label: string; href?: string; icon?: NavIconRef };
  sections: readonly NavSection[];
  actions?: readonly NavAction[];
  user?: NavUser;
}

/** An item with its state for the current path. */
export interface ResolvedNavItem extends Omit<NavModelItem, 'children'> {
  /** The one item that represents the current page (`aria-current="page"`). */
  active: boolean;
  /** This item or one of its children is the current page (expand it, tint it). */
  inTrail: boolean;
  children: readonly ResolvedNavItem[];
}

export interface ResolvedNavSection extends Omit<NavSection, 'items'> {
  items: readonly ResolvedNavItem[];
}

/** Same normalization as the renderer's router: leading `/`, no trailing `/`, no `#` or query. */
export function navPath(hrefOrHash: string): string {
  let path = hrefOrHash.trim();
  if (path.startsWith('#')) path = path.slice(1);
  const query = path.indexOf('?');
  if (query !== -1) path = path.slice(0, query);
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/{2,}/g, '/');
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/** The renderer's `router.isActive` rule: the path itself or a descendant; `/` and `exact` match only exactly. */
export function isNavPathActive(href: string, currentPath: string, exact = false): boolean {
  const target = navPath(href);
  const current = navPath(currentPath);
  if (exact || target === '/') return current === target;
  return current === target || current.startsWith(`${target}/`);
}

/** Reads a badge, calling it when it is a getter. */
export function navBadge(badge: NavBadge | undefined): string | number | undefined {
  return typeof badge === 'function' ? badge() : badge;
}

function flatten(items: readonly NavModelItem[]): NavModelItem[] {
  return items.flatMap((item) => [item, ...flatten(item.children ?? [])]);
}

/**
 * Marks the current page for `currentPath` (a hash or a path). When several
 * items match (`/deals` and `/deals/pipeline`), the deepest path wins, so
 * exactly one item is `active`; its parents are `inTrail`.
 */
export function resolveNav(model: NavModel, currentPath: string): ResolvedNavSection[] {
  let best: NavModelItem | undefined;
  let bestLength = -1;
  for (const item of model.sections.flatMap((section) => flatten(section.items))) {
    if (!isNavPathActive(item.href, currentPath, item.exact)) continue;
    const length = navPath(item.href).length;
    if (length > bestLength) {
      best = item;
      bestLength = length;
    }
  }
  const resolve = (item: NavModelItem): ResolvedNavItem => {
    const children = (item.children ?? []).map(resolve);
    const active = item === best;
    return {
      ...item,
      active,
      inTrail: active || children.some((child) => child.inTrail),
      children,
    };
  };
  return model.sections.map((section) => ({ ...section, items: section.items.map(resolve) }));
}

function idFromHref(href: string, used: Set<string>): string {
  const base =
    navPath(href)
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'home';
  let id = base;
  for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
  used.add(id);
  return id;
}

/**
 * The existing `<Sidebar items>` / `sections` shape as a nav model, so a
 * template migrates with one line: `const model = navFromSidebar(nav)`.
 * The items' `active` flags are dropped: layouts derive them from the path.
 */
export function navFromSidebar(
  nav: readonly SidebarItem[] | readonly SidebarSection[],
  extras: Omit<NavModel, 'sections'> = {}
): NavModel {
  const used = new Set<string>();
  const sections: SidebarSection[] =
    nav.length && 'items' in (nav[0] as object)
      ? [...(nav as readonly SidebarSection[])]
      : [{ items: [...(nav as readonly SidebarItem[])] }];
  return {
    ...extras,
    sections: sections.map((section, index) => ({
      id: section.label ? idFromHref(section.label, used) : `section-${index + 1}`,
      ...(section.label ? { label: section.label } : {}),
      items: section.items.map((item) => ({
        id: idFromHref(item.href, used),
        label: item.label,
        href: item.href,
        ...(item.icon ? { icon: item.icon } : {}),
        ...(item.badge !== undefined ? { badge: item.badge } : {}),
      })),
    })),
  };
}
