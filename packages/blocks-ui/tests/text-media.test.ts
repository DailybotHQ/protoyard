import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MediaFamilyRenderer from '../src/media/MediaFamilyRenderer.svelte';
import MdRenderer from '../src/text/MdRenderer.svelte';
import TextFamilyRenderer from '../src/text/TextFamilyRenderer.svelte';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('text block family', () => {
  it('renders markdown as inert text and drops unsafe link targets', () => {
    const { container } = render(TextFamilyRenderer, {
      props: {
        block: {
          type: 'text',
          markdown: '<script>alert(1)</script> [unsafe](javascript:alert(1)) and **safe emphasis**',
        },
      },
    });

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(screen.getByText('safe emphasis').tagName).toBe('STRONG');
  });

  it('keeps markdown images out of Texuli RichText (use MdRenderer for media policy)', () => {
    const { container } = render(TextFamilyRenderer, {
      props: { block: { type: 'text', markdown: '![Cover](assets/cover.webp)' } },
    });
    // Texuli closed Markdown subset does not emit <img>; media blocks own images.
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toMatch(/Cover|assets\/cover|!\[/);
  });

  it('renders accessible heading, list, quote, callout and divider variants', () => {
    const { container, rerender } = render(TextFamilyRenderer, {
      props: {
        block: {
          type: 'heading',
          level: 3,
          eyebrow: 'Update',
          text: 'Quarterly report',
          subtitle: 'Q3',
        },
      },
    });
    expect(screen.getByRole('heading', { level: 3, name: 'Quarterly report' })).toBeTruthy();

    rerender({ block: { type: 'list', style: 'check', items: [{ text: 'Ship it', done: true }] } });
    expect(screen.getByText('Ship it')).toBeTruthy();
    // Texuli list is ordered/unordered text; check style is a Protoyard field mapped away.
    expect(screen.queryByText('✓')).toBeNull();

    rerender({
      block: { type: 'quote', quote: 'A clear quote', cite: 'Ada Example', role: 'Engineer' },
    });
    expect(screen.getByText('A clear quote')).toBeTruthy();
    expect(screen.getByText('Ada Example')).toBeTruthy();

    rerender({ block: { type: 'callout', title: 'Note', body: 'Useful details' } });
    expect(screen.getByText('Useful details')).toBeTruthy();

    rerender({ block: { type: 'divider', label: 'Next section' } });
    // Texuli divider is a plain <hr>; label is a Protoyard field dropped in the map.
    expect(container.querySelector('hr, [data-tx-block="divider"]')).toBeTruthy();
  });
});

describe('markdown images follow the block media policy', () => {
  it('renders a relative image path without a referrer', () => {
    const { container } = render(MdRenderer, { source: '![Cover](assets/cover.webp)' });
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('assets/cover.webp');
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('shows the alt text instead of requesting non-media or escaping paths', () => {
    for (const [source, alt] of [
      ['![Api](/api/comments/slug?x=1)', 'Api'],
      ['![Up](../secrets.png)', 'Up'],
      ['![Remote](https://evil.example/pixel.png)', 'Remote'],
      ['![Svg](assets/logo.svg)', 'Svg'],
    ] as const) {
      const { container } = render(MdRenderer, { source });
      expect(container.querySelector('img'), source).toBeNull();
      expect(container.textContent).toContain(alt);
      cleanup();
    }
  });
});

describe('media block family', () => {
  it('resolves packaged avatar URLs and notifies the host after image load', async () => {
    const ready = vi.fn();
    document.addEventListener('blocks:media-ready', ready);
    const { container } = render(MediaFamilyRenderer, {
      props: {
        block: {
          type: 'image',
          src: 'avatar:av-007',
          alt: 'A fictional person',
          width: 640,
          height: 480,
        },
      },
    });
    const image = container.querySelector('img');
    expect(image?.getAttribute('src')).toMatch(/\/(?:64|128)\/av-007\.webp$/);
    expect(image?.getAttribute('alt')).toBe('A fictional person');
    expect(image?.getAttribute('width')).toBe('640');
    expect(image?.getAttribute('height')).toBe('480');
    image?.dispatchEvent(new Event('load', { bubbles: true }));
    await waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
    document.removeEventListener('blocks:media-ready', ready);
  });

  it('does not request a remote image even when an invalid block bypasses schema validation', () => {
    const { container } = render(MediaFamilyRenderer, {
      props: {
        block: {
          type: 'image',
          src: 'https://tracker.example/pixel.png',
          alt: 'remote',
          width: 1,
          height: 1,
        },
      },
    });
    expect(container.querySelector('img')).toBeNull();
  });

  it('keeps video muted, inline and controlled, and disables autoplay for reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const { container } = render(MediaFamilyRenderer, {
      props: {
        block: {
          type: 'video',
          src: 'assets/intro.mp4',
          label: 'Product introduction',
          poster: 'assets/poster.webp',
          width: 640,
          height: 360,
          autoplay: true,
          muted: true,
        },
      },
    });
    const video = container.querySelector('video');
    expect(video?.hasAttribute('muted')).toBe(true);
    expect(video?.hasAttribute('playsinline')).toBe(true);
    expect(video?.hasAttribute('controls')).toBe(true);
    expect(video?.hasAttribute('autoplay')).toBe(false);
    expect(video?.getAttribute('poster')).toBe('assets/poster.webp');
    expect(video?.getAttribute('aria-label')).toBe('Product introduction');
  });

  it('renders people with names and avatar URL helpers', () => {
    render(MediaFamilyRenderer, {
      props: {
        block: {
          type: 'people',
          title: 'Team',
          people: [{ name: 'Ari Example', role: 'Designer', avatar: 'av-008' }],
        },
      },
    });
    expect(screen.getByRole('region', { name: 'Team' })).toBeTruthy();
    expect(screen.getByText('Ari Example')).toBeTruthy();
    expect(document.querySelector('img[src*="/128/av-008.webp"]')).toBeTruthy();
  });
});
