import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthSplitLayout from '../src/layouts/AuthSplitLayout.svelte';
import DashboardGridLayout from '../src/layouts/DashboardGridLayout.svelte';
import DocsLayout from '../src/layouts/DocsLayout.svelte';
import DualSidebarLayout from '../src/layouts/DualSidebarLayout.svelte';
import LayoutHost from '../src/layouts/LayoutHost.svelte';
import { layoutStorageKey } from '../src/layouts/layout-kit.ts';
import MarketingLayout from '../src/layouts/MarketingLayout.svelte';
import MasterDetailLayout from '../src/layouts/MasterDetailLayout.svelte';
import type { NavModel } from '../src/layouts/nav-model.ts';
import RailLayout from '../src/layouts/RailLayout.svelte';
import { LAYOUT_REGISTRY } from '../src/layouts/registry.ts';
import SidebarLayout from '../src/layouts/SidebarLayout.svelte';
import TopNavLayout from '../src/layouts/TopNavLayout.svelte';
import WizardLayout from '../src/layouts/WizardLayout.svelte';

const nav: NavModel = {
  brand: { label: 'Pipeline CRM', icon: 'briefcase' },
  sections: [
    {
      id: 'work',
      label: 'Work',
      items: [
        { id: 'home', label: 'Home', href: '#/', icon: 'home' },
        {
          id: 'deals',
          label: 'Deals',
          href: '#/deals',
          icon: 'kanban',
          badge: 4,
          children: [
            { id: 'board', label: 'Board', href: '#/deals/board' },
            { id: 'forecast', label: 'Forecast', href: '#/deals/forecast' },
          ],
        },
        { id: 'contacts', label: 'Contacts', href: '#/contacts', icon: 'users' },
      ],
    },
    {
      id: 'admin',
      label: 'Admin',
      items: [
        { id: 'reports', label: 'Reports', href: '#/reports', icon: 'chart-line' },
        { id: 'settings', label: 'Settings', href: '#/settings', icon: 'settings' },
      ],
    },
  ],
  user: { name: 'Dana Reyes', detail: 'dana@example.com' },
};

const mountScreen = vi.fn<(target: HTMLElement) => void>();

beforeEach(() => {
  mountScreen.mockClear();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  window.location.hash = '';
  vi.restoreAllMocks();
});

const link = (scope: HTMLElement, name: string) => within(scope).getByRole('link', { name });

async function openDrawer(): Promise<HTMLElement> {
  await fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  return screen.findByRole('dialog');
}

describe('SidebarLayout', () => {
  it('renders the nav model in a labelled landmark with the current page marked', () => {
    render(SidebarLayout, { props: { mountScreen, nav, path: '/deals/board' } });
    const column = screen.getByRole('complementary', { name: 'Pipeline CRM' });
    const main = within(column).getByRole('navigation', { name: 'Main' });
    expect(link(main, 'Deals 4').getAttribute('aria-current')).toBe('page');
    expect(link(main, 'Home').getAttribute('aria-current')).toBeNull();
    expect(within(main).getByText('Admin')).toBeTruthy();
    expect(within(column).getByText('Dana Reyes')).toBeTruthy();
  });

  it('places the screen in <main> and the skip link focuses it', async () => {
    render(SidebarLayout, { props: { mountScreen, nav } });
    const main = screen.getByRole('main');
    await waitFor(() => expect(mountScreen).toHaveBeenCalledWith(main));
    await fireEvent.click(screen.getByRole('link', { name: 'Skip to content' }));
    expect(document.activeElement).toBe(main);
    expect(window.location.hash).toBe('');
  });

  it('follows the hash when no path is given', async () => {
    window.location.hash = '#/contacts';
    render(SidebarLayout, { props: { mountScreen, nav } });
    const column = screen.getByRole('complementary', { name: 'Pipeline CRM' });
    expect(link(column, 'Contacts').getAttribute('aria-current')).toBe('page');
    window.location.hash = '#/reports';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await waitFor(() => expect(link(column, 'Reports').getAttribute('aria-current')).toBe('page'));
  });

  it('opens the drawer from the menu button; Escape and following a link close it', async () => {
    render(SidebarLayout, { props: { mountScreen, nav, path: '/' } });
    const toggle = screen.getByRole('button', { name: 'Open navigation' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    let drawer = await openDrawer();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(within(drawer).getByRole('navigation', { name: 'Main' })).toBeTruthy();
    await fireEvent.keyDown(drawer, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    drawer = await openDrawer();
    await fireEvent.click(link(drawer, 'Contacts'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes the drawer on in-app navigation', async () => {
    render(SidebarLayout, { props: { mountScreen, nav } });
    await openDrawer();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('RailLayout', () => {
  it('starts as an icon rail with labels for assistive tech and tooltips', () => {
    render(RailLayout, { props: { mountScreen, nav, path: '/reports' } });
    const rail = screen.getByRole('navigation', { name: 'Main' });
    expect(rail.hasAttribute('data-collapsed')).toBe(true);
    expect(link(rail, 'Reports').getAttribute('aria-current')).toBe('page');
    expect(within(rail).getByRole('button', { name: 'Expand sidebar' })).toBeTruthy();
  });

  it('expands and remembers the choice per prototype', async () => {
    const view = render(RailLayout, { props: { mountScreen, nav, storageKey: 'crm-demo' } });
    const key = layoutStorageKey('rail-expanded', 'crm-demo');
    expect(key).toBe('protoyard:layout:crm-demo:rail-expanded');
    const toggle = screen.getByRole('button', { name: 'Expand sidebar' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await fireEvent.click(toggle);
    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: 'Main' }).hasAttribute('data-collapsed')).toBe(
        false
      )
    );
    expect(localStorage.getItem(key)).toBe('1');
    view.unmount();

    render(RailLayout, { props: { mountScreen, nav, storageKey: 'crm-demo' } });
    expect(screen.getByRole('navigation', { name: 'Main' }).hasAttribute('data-collapsed')).toBe(
      false
    );
    // Another prototype keeps its own state.
    cleanup();
    render(RailLayout, { props: { mountScreen, nav, storageKey: 'helpdesk-demo' } });
    expect(screen.getByRole('navigation', { name: 'Main' }).hasAttribute('data-collapsed')).toBe(
      true
    );
  });

  it('still toggles when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(RailLayout, { props: { mountScreen, nav } });
    await fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Collapse' }).getAttribute('aria-expanded')).toBe(
        'true'
      )
    );
  });

  it('has a drawer below its breakpoint', async () => {
    render(RailLayout, { props: { mountScreen, nav } });
    const drawer = await openDrawer();
    // Labels are visible in the drawer, never icon-only.
    expect(
      within(drawer).getByRole('navigation', { name: 'Main' }).hasAttribute('data-collapsed')
    ).toBe(false);
  });
});

describe('TopNavLayout', () => {
  it('shows the primary links, overflow in a More menu and the section tabs', async () => {
    render(TopNavLayout, {
      props: { mountScreen, nav, path: '/deals/forecast', options: { visibleItems: 3 } },
    });
    const primary = screen.getByRole('navigation', { name: 'Main' });
    expect(
      within(primary)
        .getAllByRole('link')
        .map((a) => a.textContent?.trim())
    ).toEqual(['Home', 'Deals 4', 'Contacts']);
    // The trail item is tinted, but only the exact page is aria-current.
    expect(link(primary, 'Deals 4').hasAttribute('data-trail')).toBe(true);
    expect(link(primary, 'Deals 4').getAttribute('aria-current')).toBeNull();

    const tabs = screen.getByRole('navigation', { name: 'Deals sections' });
    expect(link(tabs, 'Forecast').getAttribute('aria-current')).toBe('page');
    expect(link(tabs, 'Board').getAttribute('aria-current')).toBeNull();

    const more = within(primary).getByRole('button', { name: /More/ });
    await fireEvent.pointerDown(more, { button: 0, pointerType: 'mouse' });
    await fireEvent.click(more);
    const menu = await screen.findByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent?.trim())
    ).toEqual(['Reports', 'Settings']);
  });

  it('marks the More menu when it holds the current page', () => {
    render(TopNavLayout, {
      props: { mountScreen, nav, path: '/settings', options: { visibleItems: 3 } },
    });
    const more = screen.getByRole('button', { name: /More/ });
    expect(more.hasAttribute('data-trail')).toBe(true);
    expect(more.textContent).toContain('contains the current page');
    expect(screen.queryByRole('navigation', { name: /sections$/ })).toBeNull();
  });

  it('shows every link without a More menu by default when they fit in five', () => {
    render(TopNavLayout, { props: { mountScreen, nav, path: '/' } });
    expect(screen.queryByRole('button', { name: /More/ })).toBeNull();
    expect(
      within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link')
    ).toHaveLength(5);
  });

  it('moves the links into a drawer below its breakpoint', async () => {
    render(TopNavLayout, { props: { mountScreen, nav, path: '/' } });
    const drawer = await openDrawer();
    expect(link(drawer, 'Settings')).toBeTruthy();
    await fireEvent.keyDown(drawer, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps an action pending while its promise runs', async () => {
    let finish: (() => void) | undefined;
    const onSelect = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    render(TopNavLayout, {
      props: {
        mountScreen,
        nav: { ...nav, actions: [{ id: 'new', label: 'New deal', onSelect }] },
      },
    });
    const button = screen.getAllByRole('button', { name: 'New deal' })[0] as HTMLElement;
    await fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('true'));
    finish?.();
    await waitFor(() => expect(button.getAttribute('aria-busy')).not.toBe('true'));
  });
});

describe('DualSidebarLayout', () => {
  const aside = createRawSnippet(() => ({
    render: () => '<p>Deal context</p>',
  }));

  it('selects the section of the current page and lists its pages and children', () => {
    render(DualSidebarLayout, { props: { mountScreen, nav, path: '/deals/board', aside } });
    const switcher = screen.getByRole('list', { name: 'Sections' });
    const work = within(switcher).getByRole('button', { name: 'Work' });
    expect(work.getAttribute('aria-pressed')).toBe('true');
    expect(work.getAttribute('aria-current')).toBe('true');
    const section = screen.getByRole('navigation', { name: 'Work' });
    expect(link(section, 'Board').getAttribute('aria-current')).toBe('page');
    expect(link(section, 'Deals 4').getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Context' }).textContent).toContain(
      'Deal context'
    );
  });

  it('switches sections from the switcher column, with arrow keys between them', async () => {
    render(DualSidebarLayout, { props: { mountScreen, nav, path: '/' } });
    const switcher = screen.getByRole('list', { name: 'Sections' });
    const work = within(switcher).getByRole('button', { name: 'Work' });
    const admin = within(switcher).getByRole('button', { name: 'Admin' });
    await fireEvent.click(admin);
    const section = await screen.findByRole('navigation', { name: 'Admin' });
    expect(link(section, 'Settings')).toBeTruthy();
    expect(admin.getAttribute('aria-pressed')).toBe('true');
    expect(work.getAttribute('aria-current')).toBe('true');

    work.focus();
    await fireEvent.keyDown(work, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(admin);
    await fireEvent.keyDown(admin, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(work);
    await fireEvent.keyDown(work, { key: 'End' });
    expect(document.activeElement).toBe(admin);
  });

  it('has no context panel unless one is given, and a drawer for narrow widths', async () => {
    render(DualSidebarLayout, { props: { mountScreen, nav } });
    expect(screen.queryByRole('complementary', { name: 'Context' })).toBeNull();
    const drawer = await openDrawer();
    expect(link(drawer, 'Reports')).toBeTruthy();
  });
});

describe('registry and host', () => {
  it('registers each shipped host layout as its own lazy module', async () => {
    const expected = {
      sidebar: SidebarLayout,
      rail: RailLayout,
      'top-nav': TopNavLayout,
      'dual-sidebar': DualSidebarLayout,
      'master-detail': MasterDetailLayout,
      'dashboard-grid': DashboardGridLayout,
      docs: DocsLayout,
      marketing: MarketingLayout,
      wizard: WizardLayout,
      'auth-split': AuthSplitLayout,
    } as const;
    for (const [id, component] of Object.entries(expected)) {
      const entry = LAYOUT_REGISTRY[id as keyof typeof expected];
      expect(entry, id).toBeDefined();
      expect((await entry?.load())?.default, id).toBe(component);
    }
  });

  it('passes the nav model through LayoutHost and keeps the screen in <main>', async () => {
    const children = createRawSnippet(() => ({ render: () => '<p>Deals screen</p>' }));
    const priorWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    render(LayoutHost, { props: { layout: 'top-nav', nav, path: '/deals', children } });
    const primary = await screen.findByRole('navigation', { name: 'Main' });
    expect(link(primary, 'Deals 4').getAttribute('aria-current')).toBe('page');
    await waitFor(() => expect(screen.getByRole('main').textContent).toContain('Deals screen'));
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: priorWidth });
  });
});
