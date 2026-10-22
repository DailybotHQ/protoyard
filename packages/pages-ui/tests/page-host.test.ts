import type { PageDocument } from '@protoyard/pages';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PageHost from '../src/page/PageHost.svelte';

vi.mock('../src/block-host/index.ts', async () => {
  const Mock = (await import('./fixtures/MockBlockHost.svelte')).default;
  return { BlockHost: Mock };
});

vi.mock('@protoyard/blocks-ui', () => ({
  setBlockHost: vi.fn(),
  getBlockHost: () => ({ density: 'comfortable', canvasMode: 'flow' }),
}));

afterEach(cleanup);

function fixturePage(): PageDocument {
  return {
    id: 'test-landing',
    title: 'Test Landing',
    description: 'A fixture landing page for unit tests.',
    style: 'soft-violet',
    sections: [
      {
        id: 'hero',
        role: 'hero',
        title: 'Hero',
        blocks: [
          { type: 'heading', text: 'Welcome aboard', level: 1 },
          { type: 'text', markdown: 'Hero body copy.' },
        ],
      },
      {
        id: 'features',
        anchor: 'features',
        role: 'features',
        title: 'Features',
        blocks: [{ type: 'text', markdown: 'Feature details.' }],
      },
      {
        id: 'pricing',
        role: 'pricing',
        title: 'Pricing',
        blocks: [{ type: 'text', markdown: 'Pricing details.' }],
      },
      {
        id: 'footer',
        role: 'footer',
        title: 'Footer',
        blocks: [{ type: 'text', markdown: 'Footer note at example.com' }],
      },
    ],
    nav: [
      { id: 'nav-hero', label: 'Top', href: '#hero' },
      { id: 'nav-features', label: 'Features', href: '#features' },
      { id: 'nav-pricing', label: 'Pricing', href: '#pricing' },
    ],
  };
}

describe('PageHost', () => {
  it('renders hero, body sections, footer and nav anchors', async () => {
    const page = fixturePage();
    const view = render(PageHost, { props: { page } });

    const host = view.container.querySelector('[data-py-page-host]');
    expect(host).toBeTruthy();
    expect(host?.getAttribute('data-page-id')).toBe('test-landing');
    expect(host?.getAttribute('data-style')).toBe('soft-violet');

    expect(view.container.querySelector('[data-py-marketing-layout]')).toBeTruthy();
    expect(view.getByText('Test Landing')).toBeTruthy();

    const hero = view.container.querySelector('[data-py-page-section="hero"]');
    expect(hero?.getAttribute('id')).toBe('hero');
    expect(hero?.getAttribute('data-section-role')).toBe('hero');

    const features = view.container.querySelector('[data-py-page-section="features"]');
    expect(features?.getAttribute('id')).toBe('features');

    const pricing = view.container.querySelector('[data-py-page-section="pricing"]');
    expect(pricing?.getAttribute('id')).toBe('pricing');

    const footer = view.container.querySelector('[data-py-page-section="footer"]');
    expect(footer?.getAttribute('data-section-role')).toBe('footer');

    const featureLink = view.container.querySelector(
      '[data-py-page-nav-link="#features"]'
    ) as HTMLAnchorElement | null;
    expect(featureLink).toBeTruthy();
    expect(featureLink?.getAttribute('href')).toBe('#features');

    // The page draws the hero title and lead itself; other blocks go through BlockHost.
    expect(view.getByRole('heading', { level: 1, name: 'Welcome aboard' })).toBeTruthy();
    expect(view.getByText('Hero body copy.')).toBeTruthy();
    await waitFor(() => {
      expect(
        view.container.querySelectorAll('[data-py-mock-block-host]').length
      ).toBeGreaterThanOrEqual(3);
    });
  });

  it('scrolls to a section when a nav hash link is activated', async () => {
    const page = fixturePage();
    const view = render(PageHost, { props: { page } });
    const target = view.container.querySelector('#features') as HTMLElement;
    const scroll = vi.fn();
    target.scrollIntoView = scroll;

    const link = view.getByRole('link', { name: 'Features' });
    await fireEvent.click(link);
    expect(scroll).toHaveBeenCalled();
  });

  it('uses section titles for default nav when page.nav is omitted', () => {
    const page = fixturePage();
    const { nav: _nav, ...rest } = page;
    void _nav;
    const view = render(PageHost, {
      props: { page: { ...rest, sections: page.sections } },
    });
    expect(view.container.querySelector('[data-py-page-nav-link="#features"]')).toBeTruthy();
    expect(view.getByRole('link', { name: 'Features' })).toBeTruthy();
  });
});
