import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LayoutHost from '../src/layouts/LayoutHost.svelte';
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

describe('registry and host', () => {
  it('registers both mobile layouts as lazy modules (the texuli mobile implementations)', async () => {
    expect((await LAYOUT_REGISTRY['mobile-tabs']?.load())?.default).toBeTypeOf('function');
    expect((await LAYOUT_REGISTRY['mobile-drawer']?.load())?.default).toBeTypeOf('function');
  });

  it('is what the host renders when a sidebar layout is narrower than its breakpoint', async () => {
    const children = createRawSnippet(() => ({ render: () => '<p>Chats screen</p>' }));
    const priorWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const view = render(LayoutHost, {
      props: { layout: 'sidebar', nav: small, path: '/chats', children },
    });
    await waitFor(() =>
      expect(view.container.querySelector('[data-tx-layout="mobile-drawer"]')).toBeTruthy()
    );
    await waitFor(() => expect(screen.getByRole('main').textContent).toContain('Chats screen'));
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: priorWidth });
  });
});
