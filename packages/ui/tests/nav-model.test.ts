import { LayoutDashboard, Users } from '@lucide/svelte';
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { SidebarItem } from '../src/components/sidebar/types.ts';
import NavIcon, { NAV_ICONS, navIconComponent } from '../src/layouts/NavIcon.svelte';
import {
  isNavPathActive,
  type NavIconName,
  type NavModel,
  navBadge,
  navFromSidebar,
  navPath,
  type ResolvedNavItem,
  resolveNav,
} from '../src/layouts/nav-model.ts';

afterEach(() => cleanup());

const MODEL: NavModel = {
  brand: { label: 'Pipeline CRM', icon: 'briefcase' },
  sections: [
    {
      id: 'main',
      items: [
        { id: 'home', label: 'Home', href: '#/', icon: 'home' },
        {
          id: 'deals',
          label: 'Deals',
          href: '#/deals',
          icon: 'kanban',
          children: [
            { id: 'pipeline', label: 'Pipeline', href: '#/deals/pipeline' },
            { id: 'won', label: 'Won', href: '#/deals/won', exact: true },
          ],
        },
        { id: 'contacts', label: 'Contacts', href: '#/contacts', icon: 'users' },
      ],
    },
    {
      id: 'admin',
      label: 'Admin',
      items: [{ id: 'settings', label: 'Settings', href: '#/settings', icon: 'settings' }],
    },
  ],
  actions: [{ id: 'new-deal', label: 'New deal', icon: 'plus', href: '#/deals/new' }],
  user: { name: 'Avery Lane', detail: 'Sales lead' },
};

function flat(items: readonly ResolvedNavItem[]): ResolvedNavItem[] {
  return items.flatMap((item) => [item, ...flat(item.children)]);
}

function state(path: string): { active: string[]; trail: string[] } {
  const items = resolveNav(MODEL, path).flatMap((section) => flat(section.items));
  return {
    active: items.filter((item) => item.active).map((item) => item.id),
    trail: items.filter((item) => item.inTrail).map((item) => item.id),
  };
}

describe('nav paths', () => {
  it('normalizes hashes and paths like the hash router', () => {
    expect(navPath('#/deals/42?tab=notes')).toBe('/deals/42');
    expect(navPath('deals/')).toBe('/deals');
    expect(navPath('#//deals//42/')).toBe('/deals/42');
    expect(navPath('#')).toBe('/');
    expect(navPath('')).toBe('/');
  });

  it("follows the router's isActive rule: the path or a descendant; / and exact only exactly", () => {
    expect(isNavPathActive('#/deals', '#/deals')).toBe(true);
    expect(isNavPathActive('#/deals', '#/deals/42')).toBe(true);
    expect(isNavPathActive('#/deals', '#/dealsroom')).toBe(false);
    expect(isNavPathActive('#/deals', '#/deals/42', true)).toBe(false);
    expect(isNavPathActive('#/', '#/deals')).toBe(false);
    expect(isNavPathActive('#/', '#/')).toBe(true);
    expect(isNavPathActive('#/deals?view=board', '#/deals/1?tab=a')).toBe(true);
  });
});

describe('resolveNav', () => {
  it('marks exactly one current item, the deepest match, and its parents as the trail', () => {
    expect(state('#/deals/pipeline')).toEqual({
      active: ['pipeline'],
      trail: ['deals', 'pipeline'],
    });
    expect(state('#/deals/pipeline/q3')).toEqual({
      active: ['pipeline'],
      trail: ['deals', 'pipeline'],
    });
    expect(state('#/deals/42')).toEqual({ active: ['deals'], trail: ['deals'] });
    expect(state('#/')).toEqual({ active: ['home'], trail: ['home'] });
    expect(state('#/settings')).toEqual({ active: ['settings'], trail: ['settings'] });
  });

  it('respects exact items and leaves unknown paths with no current item', () => {
    expect(state('#/deals/won/2026')).toEqual({ active: ['deals'], trail: ['deals'] });
    expect(state('#/reports')).toEqual({ active: [], trail: [] });
  });

  it('keeps sections, labels and item data, and never mutates the model', () => {
    const before = JSON.stringify(MODEL);
    const sections = resolveNav(MODEL, '#/contacts');
    expect(sections.map((section) => [section.id, section.label])).toEqual([
      ['main', undefined],
      ['admin', 'Admin'],
    ]);
    expect(sections[0]?.items[2]).toMatchObject({ label: 'Contacts', icon: 'users', active: true });
    expect(JSON.stringify(MODEL)).toBe(before);
  });
});

describe('badges', () => {
  it('reads static badges and getters, so a live count updates on the next read', () => {
    let unread = 3;
    const badge = () => (unread > 0 ? unread : undefined);
    expect(navBadge(badge)).toBe(3);
    unread = 0;
    expect(navBadge(badge)).toBeUndefined();
    expect(navBadge('new')).toBe('new');
    expect(navBadge(undefined)).toBeUndefined();
  });
});

describe('navFromSidebar', () => {
  // The exact shape templates/crud-app/src/App.svelte builds today.
  const sidebar: SidebarItem[] = [
    { href: '#/', label: 'Home', icon: LayoutDashboard, active: true },
    { href: '#/projects', label: 'Projects', active: false, badge: 4 },
    { href: '#/members', label: 'Members', icon: Users, active: false },
  ];

  it('migrates a flat Sidebar item list in one call and derives active state from the path', () => {
    const model = navFromSidebar(sidebar, { brand: { label: 'Crud app' } });
    expect(model.brand).toEqual({ label: 'Crud app' });
    expect(model.sections).toHaveLength(1);
    const items = model.sections[0]?.items ?? [];
    expect(items.map((item) => [item.id, item.label, item.href])).toEqual([
      ['home', 'Home', '#/'],
      ['projects', 'Projects', '#/projects'],
      ['members', 'Members', '#/members'],
    ]);
    expect(items[0]?.icon).toBe(LayoutDashboard);
    expect(items[1]?.badge).toBe(4);
    expect(items.some((item) => 'active' in item)).toBe(false);
    const resolved = resolveNav(model, '#/projects/7')[0]?.items ?? [];
    expect(resolved.map((item) => item.active)).toEqual([false, true, false]);
  });

  it('keeps Sidebar sections and their labels, with unique ids', () => {
    const model = navFromSidebar([
      { label: 'Work', items: [{ href: '#/tasks', label: 'Tasks' }] },
      { items: [{ href: '#/tasks', label: 'Tasks again' }] },
    ]);
    expect(model.sections.map((section) => [section.id, section.label])).toEqual([
      ['work', 'Work'],
      ['section-2', undefined],
    ]);
    expect(model.sections.flatMap((section) => section.items.map((item) => item.id))).toEqual([
      'tasks',
      'tasks-2',
    ]);
    expect(navFromSidebar([]).sections).toEqual([{ id: 'section-1', items: [] }]);
  });
});

describe('NavIcon', () => {
  it('maps every name to a Lucide component and passes components through', () => {
    const names = Object.keys(NAV_ICONS) as NavIconName[];
    expect(names.length).toBeGreaterThanOrEqual(50);
    for (const name of names) expect(typeof navIconComponent(name)).toBe('function');
    expect(navIconComponent(Users)).toBe(Users);
    expect(navIconComponent('no-such-icon' as NavIconName)).toBeUndefined();
    expect(navIconComponent('toString' as NavIconName)).toBeUndefined();
    expect(navIconComponent(undefined)).toBeUndefined();
  });

  it('renders a decorative svg for a name or a component, and nothing for an unknown name', () => {
    const named = render(NavIcon, { icon: 'kanban', class: 'size-4' });
    const svg = named.container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('class')).toContain('size-4');
    cleanup();
    expect(render(NavIcon, { icon: Users }).container.querySelector('svg')).not.toBeNull();
    cleanup();
    expect(
      render(NavIcon, { icon: 'unknown' as NavIconName }).container.querySelector('svg')
    ).toBeNull();
  });
});
