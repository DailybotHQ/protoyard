import { type NavModel, navPath } from 'texuli/layouts/host';
import type { SidebarItem, SidebarSection } from '../components/sidebar/types.ts';

/*
 * The navigation every layout renders (ADR-021): data, not markup, so one
 * prototype definition works in a sidebar, a rail, a top bar, a tab bar or a
 * drawer. The model, its types and its pure helpers are texuli's
 * (`texuli/layouts/host`); `navFromSidebar` is Protoyard's migration helper.
 */
export {
  isNavPathActive,
  type NavAction,
  type NavBadge,
  type NavIconName,
  type NavIconRef,
  type NavModel,
  type NavModelItem,
  type NavSection,
  type NavUser,
  navBadge,
  navPath,
  type ResolvedNavItem,
  type ResolvedNavSection,
  resolveNav,
} from 'texuli/layouts/host';

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
