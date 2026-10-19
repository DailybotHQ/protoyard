import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LayoutHost from '../src/layouts/LayoutHost.svelte';
import MobileDrawerLayout from '../src/layouts/MobileDrawerLayout.svelte';
import MobileTabsLayout from '../src/layouts/MobileTabsLayout.svelte';
import type { NavModel, NavModelItem } from '../src/layouts/nav-model.ts';
import { LAYOUT_REGISTRY } from '../src/layouts/registry.ts';

const item = (id: string, label: string, extra: Partial<NavModelItem> = {}): NavModelItem => ({
  id,
  label,
  href: `#/${id}`,
  ...extra,
});

const small: NavModel = {
  brand: { label: 'Relay Chat', icon: 'message-square' },
  sections: [
    {
      id: 'main',
      items: [
        item('chats', 'Chats', { icon: 'message-square', badge: 3 }),
        item('calls', 'Calls', { icon: 'clock' }),
        item('people', 'People', { icon: 'users' }),
      ],
    },
  ],
};

const large: NavModel = {
  brand: { label: 'Field Ops', icon: 'truck' },
  sections: [
    {
      id: 'work',
      label: 'Work',
      items: [
        item('jobs', 'Jobs', { icon: 'briefcase' }),
        item('map', 'Map', { icon: 'map' }),
        item('inbox', 'Inbox', { icon: 'inbox', badge: 2 }),
      ],
    },
    {
      id: 'more',
      label: 'More',
      items: [
        item('fleet', 'Fleet', { icon: 'truck' }),
        item('reports', 'Reports', { icon: 'chart-line' }),
        item('settings', 'Settings', { icon: 'settings' }),
      ],
    },
  ],
  user: { name: 'Sam Okafor', detail: 'sam@example.com' },
};

const mountScreen = vi.fn<(target: HTMLElement) => void>();

beforeEach(() => mountScreen.mockClear());
afterEach(() => {
  cleanup();
  window.location.hash = '';
});

const link = (scope: HTMLElement, name: string | RegExp) =>
  within(scope).getByRole('link', { name });

describe('MobileTabsLayout', () => {
  it('shows every top-level item as a tab when five or fewer, with the current one marked', async () => {
    render(MobileTabsLayout, { props: { mountScreen, nav: small, path: '/calls' } });
    const tabs = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(tabs).getAllByRole('link')).toHaveLength(3);
    expect(link(tabs, /Calls/).getAttribute('aria-current')).toBe('page');
    expect(link(tabs, /Chats/).textContent).toContain('3');
    expect(screen.queryByRole('button', { name: /More/ })).toBeNull();
    // The header names the current page; the screen goes in the scroll region.
    expect(screen.getByRole('banner').textContent).toContain('Calls');
    await waitFor(() => expect(mountScreen).toHaveBeenCalled());
    const target = mountScreen.mock.calls[0]?.[0] as HTMLElement;
    expect(screen.getByRole('main').contains(target)).toBe(true);
  });

  it('keeps four tabs and moves the rest into a More sheet', async () => {
    render(MobileTabsLayout, { props: { mountScreen, nav: large, path: '/jobs' } });
    const tabs = screen.getByRole('navigation', { name: 'Primary' });
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((a) => a.textContent?.replace(/\d/g, '').trim())
    ).toEqual(['Jobs', 'Map', 'Inbox', 'Fleet']);
    const more = screen.getByRole('button', { name: 'More' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    await fireEvent.click(more);
    const sheet = await screen.findByRole('dialog', { name: 'More' });
    const list = within(sheet).getByRole('navigation', { name: 'More' });
    expect(
      within(list)
        .getAllByRole('link')
        .map((a) => a.textContent?.trim())
    ).toEqual(['Reports', 'Settings']);
    expect(within(sheet).getByText('Sam Okafor')).toBeTruthy();
    await fireEvent.click(link(list, 'Settings'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('marks More when it holds the current page, and Escape closes the sheet', async () => {
    render(MobileTabsLayout, { props: { mountScreen, nav: large, path: '/settings' } });
    const more = screen.getByRole('button', { name: /More/ });
    expect(more.textContent).toContain('contains the current page');
    await fireEvent.click(more);
    const sheet = await screen.findByRole('dialog', { name: 'More' });
    expect(link(sheet, 'Settings').getAttribute('aria-current')).toBe('page');
    await fireEvent.keyDown(sheet, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes the More sheet on in-app navigation and follows the hash', async () => {
    window.location.hash = '#/jobs';
    render(MobileTabsLayout, { props: { mountScreen, nav: large } });
    await fireEvent.click(screen.getByRole('button', { name: 'More' }));
    await screen.findByRole('dialog', { name: 'More' });
    window.location.hash = '#/map';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const tabs = screen.getByRole('navigation', { name: 'Primary' });
    expect(link(tabs, 'Map').getAttribute('aria-current')).toBe('page');
  });

  it('puts the tab bar in normal flow below the scroll region, padded for the safe area', () => {
    render(MobileTabsLayout, { props: { mountScreen, nav: small } });
    const bar = document.querySelector('[data-py-tab-bar]') as HTMLElement;
    expect(bar.className).toContain('pb-safe');
    expect(bar.className).not.toContain('fixed');
    const main = screen.getByRole('main');
    // The bar follows <main>, so a composer at the bottom of the screen stays above it.
    expect(main.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('banner').className).toContain('pt-safe');
  });

  it('renders no tab bar without a nav model, and the skip link focuses the screen', async () => {
    render(MobileTabsLayout, { props: { mountScreen } });
    expect(document.querySelector('[data-py-tab-bar]')).toBeNull();
    await fireEvent.click(screen.getByRole('link', { name: 'Skip to content' }));
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });
});

describe('MobileDrawerLayout', () => {
  it('opens the whole nav in a drawer from the header menu button', async () => {
    render(MobileDrawerLayout, { props: { mountScreen, nav: large, path: '/reports' } });
    expect(screen.getByRole('banner').textContent).toContain('Reports');
    expect(screen.queryByRole('navigation')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Open navigation' });
    await fireEvent.click(toggle);
    const drawer = await screen.findByRole('dialog', { name: 'Field Ops' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const main = within(drawer).getByRole('navigation', { name: 'Main' });
    expect(link(main, 'Reports').getAttribute('aria-current')).toBe('page');
    expect(within(main).getByText('Work')).toBeTruthy();
    expect(within(drawer).getByText('Sam Okafor')).toBeTruthy();
  });

  it('closes the drawer with Escape, a link or in-app navigation', async () => {
    render(MobileDrawerLayout, { props: { mountScreen, nav: large, path: '/jobs' } });
    const open = async () => {
      await fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
      return screen.findByRole('dialog');
    };
    let drawer = await open();
    await fireEvent.keyDown(drawer, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    drawer = await open();
    await fireEvent.click(link(drawer, 'Fleet'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await open();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
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
    render(MobileDrawerLayout, {
      props: {
        mountScreen,
        nav: { ...small, actions: [{ id: 'new', label: 'New chat', icon: 'plus', onSelect }] },
      },
    });
    const button = within(screen.getByRole('banner')).getByRole('button', { name: 'New chat' });
    await fireEvent.click(button);
    await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('true'));
    finish?.();
    await waitFor(() => expect(button.getAttribute('aria-busy')).not.toBe('true'));
  });
});

describe('registry and host', () => {
  it('registers both mobile layouts as lazy modules', async () => {
    expect((await LAYOUT_REGISTRY['mobile-tabs']?.load())?.default).toBe(MobileTabsLayout);
    expect((await LAYOUT_REGISTRY['mobile-drawer']?.load())?.default).toBe(MobileDrawerLayout);
  });

  it('is what the host renders when a sidebar layout is narrower than its breakpoint', async () => {
    const children = createRawSnippet(() => ({ render: () => '<p>Chats screen</p>' }));
    const priorWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const view = render(LayoutHost, {
      props: { layout: 'sidebar', nav: small, path: '/chats', children },
    });
    await waitFor(() =>
      expect(view.container.querySelector('[data-py-layout="mobile-drawer"]')).toBeTruthy()
    );
    await waitFor(() => expect(screen.getByRole('main').textContent).toContain('Chats screen'));
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: priorWidth });
  });
});
