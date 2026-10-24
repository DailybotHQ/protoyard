import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DocsLayout from '../src/layouts/DocsLayout.svelte';
import LayoutHost from '../src/layouts/LayoutHost.svelte';
import type { NavModel } from '../src/layouts/nav-model.ts';
import { LAYOUT_REGISTRY } from '../src/layouts/registry.ts';

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

describe('registry and host', () => {
  it('registers every catalog layout as its own lazy module', async () => {
    const ids = [
      'sidebar',
      'rail',
      'top-nav',
      'dual-sidebar',
      'mobile-tabs',
      'mobile-drawer',
      'master-detail',
      'dashboard-grid',
      'docs',
      'marketing',
      'wizard',
      'auth-split',
    ] as const;
    for (const id of ids) expect(LAYOUT_REGISTRY[id]?.load, id).toBeTypeOf('function');
    // docs is still Protoyard's; every other id loads texuli's implementation.
    expect((await LAYOUT_REGISTRY.docs?.load())?.default).toBe(DocsLayout);
    for (const id of ['sidebar', 'rail', 'top-nav', 'master-detail', 'marketing'] as const) {
      expect((await LAYOUT_REGISTRY[id]?.load())?.default, id).toBeTypeOf('function');
    }
  });

  it('passes the nav model through LayoutHost and keeps the screen in <main>', async () => {
    const children = createRawSnippet(() => ({ render: () => '<p>Deals screen</p>' }));
    const priorWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    render(LayoutHost, { props: { layout: 'top-nav', nav, path: '/deals', children } });
    const primary = await screen.findByRole('navigation', { name: 'Main navigation' });
    expect(link(primary, 'Deals 4').getAttribute('aria-current')).toBe('page');
    await waitFor(() => expect(screen.getByRole('main').textContent).toContain('Deals screen'));
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: priorWidth });
  });
});
