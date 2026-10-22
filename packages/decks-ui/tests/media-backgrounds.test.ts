import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeckApp } from '../src/app/index.ts';
import DeckMediaBackground from '../src/canvas/DeckMediaBackground.svelte';

vi.mock('../src/layouts/index.ts', async () => {
  const Mock = (await import('./fixtures/MockLayoutRenderer.svelte')).default;
  return { DeckLayoutRenderer: Mock };
});

class ResizeObserverMock {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [{ target, contentRect: { width: 1280, height: 720 } } as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }
  disconnect() {}
}

class IntersectionObserverMock {
  static instance: IntersectionObserverMock | undefined;
  callback: IntersectionObserverCallback;
  target: Element | undefined;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    IntersectionObserverMock.instance = this;
  }

  observe(target: Element) {
    this.target = target;
  }

  disconnect() {
    this.target = undefined;
  }

  enter(isIntersecting: boolean) {
    if (!this.target) return;
    this.callback(
      [
        {
          target: this.target,
          isIntersecting,
          intersectionRatio: isIntersecting ? 1 : 0,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver
    );
  }
}

afterEach(() => {
  cleanup();
  IntersectionObserverMock.instance = undefined;
  vi.unstubAllGlobals();
});

describe('DeckMediaBackground', () => {
  it('renders local images and applies the contrast scrim', () => {
    const { container } = render(DeckMediaBackground, {
      props: {
        media: {
          type: 'image',
          src: 'assets/cover.webp',
          full: false,
          fit: 'cover',
          position: 'center',
          alt: 'Cover',
        },
        overlay: { color: '#000000', alpha: 0.5 },
        preload: 'auto',
      },
    });
    expect(container.querySelector('img')?.getAttribute('src')).toBe('assets/cover.webp');
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('Cover');
    expect(container.querySelector('[data-py-deck-media-background]')).toBeTruthy();
    expect(
      container.querySelector('.deck-media-background__scrim')?.getAttribute('style')
    ).toContain('0.5');
  });

  it('loads a video only when it is the active or next slide, and pauses it off-screen', async () => {
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const { container } = render(DeckMediaBackground, {
      props: {
        media: {
          type: 'video',
          src: 'media/launch.mp4',
          poster: 'assets/poster.webp',
          full: true,
          fit: 'cover',
          position: 'center',
          muted: true,
          autoplay: true,
          loop: true,
          playsInline: true,
        },
        overlay: { color: '#000000', alpha: 0.7 },
        preload: 'auto',
      },
    });
    const video = container.querySelector('video');
    expect(video?.getAttribute('preload')).toBe('auto');
    expect(video?.muted).toBe(true);
    expect(video?.loop).toBe(true);
    expect(container.querySelector('.deck-media-background__poster')?.getAttribute('src')).toBe(
      'assets/poster.webp'
    );
    if (!video) throw new Error('expected video element');
    await waitFor(() => expect(pauseSpy).toHaveBeenCalled());
    IntersectionObserverMock.instance?.enter(false);
    expect(pauseSpy).toHaveBeenCalled();
    IntersectionObserverMock.instance?.enter(true);
    await waitFor(() => expect(playSpy).toHaveBeenCalled());
  });

  it('provides poster fallbacks for reduced motion and print', async () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const { container } = render(DeckMediaBackground, {
      props: {
        media: {
          type: 'video',
          src: 'media/launch.mp4',
          poster: 'assets/poster.webp',
          full: false,
          fit: 'cover',
          position: 'center',
          muted: true,
          autoplay: true,
          loop: true,
          playsInline: true,
        },
        overlay: null,
      },
    });
    await waitFor(() => expect(container.querySelector('video')).toBeTruthy());
    expect(container.querySelector('.deck-media-background__poster')?.getAttribute('src')).toBe(
      'assets/poster.webp'
    );
    expect(pauseSpy).toHaveBeenCalled();
    const css = readFileSync(
      join(import.meta.dirname, '../src/canvas/DeckMediaBackground.svelte'),
      'utf8'
    );
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).toMatch(/print/);
    expect(css).toMatch(/deck-media-background__poster[\s\S]*display:\s*block/);
  });

  it('preloads background video only on the active and next canvas slides', async () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const background = {
      kind: 'video' as const,
      src: 'media/slide.mp4',
      poster: 'media/slide.webp',
    };
    const deck = {
      style: {},
      slides: [
        { id: 'one', layout: 'free' as const, blocks: [], background },
        { id: 'two', layout: 'free' as const, blocks: [], background },
        { id: 'three', layout: 'free' as const, blocks: [], background },
      ],
    };
    const { container } = render(DeckApp, { props: { deck, syncHash: false, autofocus: false } });
    const root = container.querySelector('[data-py-deck-app]');
    await waitFor(() => expect(container.querySelectorAll('video')).toHaveLength(2));
    expect(container.querySelector('[data-canvas-slide="0"] video')?.getAttribute('preload')).toBe(
      'auto'
    );
    expect(container.querySelector('[data-canvas-slide="1"] video')?.getAttribute('preload')).toBe(
      'auto'
    );
    if (!root) throw new Error('expected deck root');
    await fireEvent.keyDown(root, { key: 'ArrowRight' });
    await waitFor(() => expect(container.querySelectorAll('video')).toHaveLength(3));
    expect(container.querySelector('[data-canvas-slide="0"] video')?.getAttribute('preload')).toBe(
      'none'
    );
    expect(container.querySelector('[data-canvas-slide="1"] video')?.getAttribute('preload')).toBe(
      'auto'
    );
    expect(container.querySelector('[data-canvas-slide="2"] video')?.getAttribute('preload')).toBe(
      'auto'
    );
  });

  it('preloads the next visible slide, skipping a hidden slide in between', async () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const video = (src: string) => ({ kind: 'video' as const, src, poster: 'media/slide.webp' });
    const deck = {
      style: {},
      slides: [
        { id: 'intro', layout: 'free' as const, blocks: [] },
        {
          id: 'backstage',
          layout: 'free' as const,
          blocks: [],
          hidden: true,
          background: video('media/hidden.mp4'),
        },
        { id: 'demo', layout: 'free' as const, blocks: [], background: video('media/demo.mp4') },
      ],
    };
    const { container } = render(DeckApp, { props: { deck, syncHash: false, autofocus: false } });
    // The canvas mounts what navigation reaches next: never the hidden slide.
    await waitFor(() => expect(container.querySelectorAll('video')).toHaveLength(1));
    expect(
      [...container.querySelectorAll<HTMLElement>('[data-py-deck-slide]')].map(
        (slide) => slide.dataset.pyDeckSlide
      )
    ).toEqual(['intro', 'demo']);
    const next = container.querySelector('video');
    expect(next?.getAttribute('src')).toBe('media/demo.mp4');
    expect(next?.getAttribute('preload')).toBe('auto');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
