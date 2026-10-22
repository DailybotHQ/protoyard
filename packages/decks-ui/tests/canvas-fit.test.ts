import { DECK_ASPECTS, deckCanvasSize } from '@protoyard/decks';
import type { Deck } from '@protoyard/decks/schema';
import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeckApp } from '../src/app/index.ts';
import { fitDeckCanvas } from '../src/canvas/fit.ts';
import PresenterView from '../src/presenter/PresenterView.svelte';
import DeckCanvasHarness from './fixtures/DeckCanvasHarness.svelte';

/**
 * AC-deck-canvas-fit: the stage is centered and fully visible in the space
 * the chrome leaves, at every aspect and viewport; the chrome is its own row
 * and never overlaps the stage; the presenter previews the next slide.
 */

vi.mock('../src/layouts/index.ts', async () => {
  const Mock = (await import('./fixtures/MockLayoutRenderer.svelte')).default;
  return { DeckLayoutRenderer: Mock };
});

/** Reports a fixed size to every observer as soon as it observes. */
function stubResizeObserver(size: { width: number; height: number }) {
  class FixedResizeObserver {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      this.callback(
        [
          {
            target,
            contentRect: {
              ...size,
              x: 0,
              y: 0,
              top: 0,
              left: 0,
              right: size.width,
              bottom: size.height,
            },
          } as unknown as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver
      );
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', FixedResizeObserver);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Chrome row height left out of the stage at the desktop sizes below. */
const CHROME = 52;
const VIEWPORTS = [
  { name: 'desktop 1440×900', width: 1440, height: 900 - CHROME },
  { name: 'laptop 1280×800', width: 1280, height: 800 - CHROME },
  { name: 'tablet 1024×768', width: 1024, height: 768 - CHROME },
  { name: 'tablet portrait 768×1024', width: 768, height: 1024 - CHROME },
  { name: 'phone portrait 390×844', width: 390, height: 844 - CHROME },
  { name: 'phone landscape 844×390', width: 844, height: 390 - CHROME },
  { name: 'fullscreen 1920×1080 (no chrome)', width: 1920, height: 1080 },
  { name: 'presenter split 860×848', width: 860, height: 848 - CHROME },
];

describe('the stage fits and centers at every aspect and viewport', () => {
  for (const aspect of DECK_ASPECTS) {
    for (const viewport of VIEWPORTS) {
      it(`${aspect} in ${viewport.name}`, () => {
        const canvas = deckCanvasSize(aspect);
        const fit = fitDeckCanvas(viewport, canvas);
        const w = canvas.width * fit.scale;
        const h = canvas.height * fit.scale;
        // Fully visible…
        expect(fit.offsetX).toBeGreaterThanOrEqual(0);
        expect(fit.offsetY).toBeGreaterThanOrEqual(0);
        expect(fit.offsetX + w).toBeLessThanOrEqual(viewport.width + 1e-6);
        expect(fit.offsetY + h).toBeLessThanOrEqual(viewport.height + 1e-6);
        // …centered (equal letterbox on both sides)…
        expect(fit.offsetX * 2 + w).toBeCloseTo(viewport.width, 6);
        expect(fit.offsetY * 2 + h).toBeCloseTo(viewport.height, 6);
        // …and as large as possible: one pair of edges touches.
        expect(Math.min(fit.offsetX, fit.offsetY)).toBeCloseTo(0, 6);
      });
    }
  }
});

const slides = Array.from({ length: 3 }, (_, index) => ({
  id: `slide-${index + 1}`,
  title: `Slide ${index + 1}`,
  layout: 'free' as const,
  blocks: [],
}));

describe('DeckCanvas places the stage from the space it is given', () => {
  it('positions the canvas out of the flow at the fitted offsets', async () => {
    stubResizeObserver({ width: 1440, height: 848 });
    const { container } = render(DeckCanvasHarness, { props: { slides, activeIndex: 0 } });
    const stage = container.querySelector('[data-py-deck-stage]') as HTMLElement;
    const canvas = screen.getByTestId('deck-canvas');
    const fit = fitDeckCanvas({ width: 1440, height: 848 }, deckCanvasSize('16:9'));
    await waitFor(() =>
      expect(Number(canvas.getAttribute('data-scale'))).toBeCloseTo(fit.scale, 6)
    );
    // The stage fills its positioned parent and letterboxes in a theme token.
    expect(stage.className).toContain('absolute');
    expect(stage.className).toContain('inset-0');
    expect(stage.className).toContain('bg-muted');
    // The 1280-px canvas box never takes part in layout, so it cannot grow the stage.
    expect(canvas.className).toContain('absolute');
    expect(canvas.className).toContain('origin-top-left');
    expect(canvas.getAttribute('data-offset-x')).toBe(String(Math.round(fit.offsetX)));
    expect(canvas.getAttribute('data-offset-y')).toBe(String(Math.round(fit.offsetY)));
    expect(canvas.getAttribute('style')).toContain(`translate(${fit.offsetX}px, ${fit.offsetY}px)`);
    expect(canvas.getAttribute('style')).toContain(`scale(${fit.scale})`);
  });

  it('refits when the space changes (resize, orientation)', async () => {
    let report: ((size: { width: number; height: number }) => void) | undefined;
    class LiveResizeObserver {
      private readonly callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe(target: Element) {
        report = (size) =>
          this.callback(
            [{ target, contentRect: size } as unknown as ResizeObserverEntry],
            this as unknown as ResizeObserver
          );
        report({ width: 1440, height: 848 });
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', LiveResizeObserver);
    render(DeckCanvasHarness, { props: { slides, activeIndex: 0 } });
    const canvas = screen.getByTestId('deck-canvas');
    await waitFor(() =>
      expect(canvas.getAttribute('data-offset-x')).toBe(
        String(
          Math.round(fitDeckCanvas({ width: 1440, height: 848 }, deckCanvasSize('16:9')).offsetX)
        )
      )
    );
    report?.({ width: 390, height: 792 });
    const portrait = fitDeckCanvas({ width: 390, height: 792 }, deckCanvasSize('16:9'));
    await waitFor(() =>
      expect(Number(canvas.getAttribute('data-scale'))).toBeCloseTo(portrait.scale, 6)
    );
    expect(canvas.getAttribute('data-offset-x')).toBe('0');
    expect(canvas.getAttribute('data-offset-y')).toBe(String(Math.round(portrait.offsetY)));
  });
});

function deck(): Deck {
  return {
    style: { aspect: '16:9' },
    outline: { title: 'Fit deck', sections: [{ id: 'all', slideIds: slides.map((s) => s.id) }] },
    slides: slides.map((slide, i) => ({ ...slide, notes: `Notes ${i + 1}` })),
  } as unknown as Deck;
}

describe('DeckApp keeps the chrome off the stage', () => {
  it('lays out a column: the stage takes the space, the chrome is its own row below it', () => {
    stubResizeObserver({ width: 1440, height: 848 });
    const { container } = render(DeckApp, { deck: deck(), syncHash: false, autofocus: false });
    const surface = container.querySelector('[data-py-deck-surface]') as HTMLElement;
    const area = container.querySelector('[data-py-deck-stage-area]') as HTMLElement;
    const chrome = container.querySelector('[data-py-deck-chrome-root]') as HTMLElement;
    expect(surface.className).toContain('flex-col');
    expect(area.className).toContain('flex-1');
    expect(area.className).toContain('min-h-0');
    // Not an overlay: no absolute positioning, and it comes after the stage in the flow.
    expect(chrome.className).not.toMatch(/\babsolute\b/);
    expect(chrome.className).toContain('shrink-0');
    expect(area.compareDocumentPosition(chrome) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(area.contains(chrome)).toBe(false);
    // The progress bar, slide counter and tools all live in that row.
    expect(within(chrome).getByRole('progressbar', { name: 'Deck progress' })).toBeTruthy();
    expect(chrome.querySelector('[data-py-deck-slide-number]')).not.toBeNull();
  });

  it('takes the app height by default and fills a sized container on request', () => {
    stubResizeObserver({ width: 800, height: 600 });
    const own = render(DeckApp, { deck: deck(), syncHash: false, autofocus: false });
    const root = own.container.querySelector('[data-py-deck-app]') as HTMLElement;
    expect(root.className).toContain('h-app');
    expect(root.getAttribute('data-py-deck-fit')).toBe('viewport');
    own.unmount();
    const hosted = render(DeckApp, {
      deck: deck(),
      syncHash: false,
      autofocus: false,
      fit: 'container',
    });
    const hostedRoot = hosted.container.querySelector('[data-py-deck-app]') as HTMLElement;
    expect(hostedRoot.className).toContain('h-full');
    expect(hostedRoot.className).not.toContain('h-app');
  });
});

describe('host chrome stays off the deck chrome', () => {
  it('lifts the DevTools launcher above the chrome row while the deck owns the viewport', () => {
    stubResizeObserver({ width: 1440, height: 848 });
    const { unmount } = render(DeckApp, { deck: deck(), syncHash: false, autofocus: false });
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--py-devtools-offset')).toMatch(/^\d+px$/);
    unmount();
    expect(root.style.getPropertyValue('--py-devtools-offset')).toBe('');
  });

  it('leaves the host alone when the deck is embedded in a sized container', () => {
    stubResizeObserver({ width: 800, height: 600 });
    render(DeckApp, { deck: deck(), syncHash: false, autofocus: false, fit: 'container' });
    expect(document.documentElement.style.getPropertyValue('--py-devtools-offset')).toBe('');
  });
});

describe('the presenter previews the next slide', () => {
  it('renders the next slide with the same renderer, scaled and inert', async () => {
    stubResizeObserver({ width: 320, height: 180 });
    const { container } = render(PresenterView, { deck: deck(), slideId: 'slide-1' });
    const preview = container.querySelector('[data-py-deck-preview="slide-2"]') as HTMLElement;
    expect(preview).not.toBeNull();
    expect(preview.getAttribute('aria-label')).toBe('Preview of the next slide: Slide 2');
    await waitFor(() => expect(Number(preview.getAttribute('data-scale'))).toBeCloseTo(0.25, 6));
    const inner = preview.querySelector('[inert]') as HTMLElement;
    expect(inner.getAttribute('aria-hidden')).toBe('true');
    expect(inner.getAttribute('style')).toContain('scale(0.25)');
    // The mocked layout renderer stands for the real one: the preview renders the slide.
    expect(inner.querySelector('[data-py-mock-layout="free"]')).not.toBeNull();
    expect(
      screen.getByText('Slide 2', { selector: '[data-py-presenter-next-title]' })
    ).toBeTruthy();
  });

  it('shows no preview at the end of the deck', () => {
    stubResizeObserver({ width: 320, height: 180 });
    const { container } = render(PresenterView, { deck: deck(), slideId: 'slide-3' });
    expect(container.querySelector('[data-py-deck-preview]')).toBeNull();
    expect(screen.getByText('End of deck')).toBeTruthy();
  });
});
