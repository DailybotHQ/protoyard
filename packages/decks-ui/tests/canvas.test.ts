import { DECK_ASPECTS, deckCanvasSize } from '@protoyard/decks';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitDeckCanvas } from '../src/canvas/fit.ts';
import DeckCanvasHarness from './fixtures/DeckCanvasHarness.svelte';

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];
  private target: Element | undefined;
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverMock.instances.push(this);
  }

  observe(target: Element) {
    this.target = target;
  }

  unobserve() {}

  disconnect() {
    this.target = undefined;
  }

  resize(width: number, height: number) {
    if (!this.target) return;
    this.callback(
      [{ target: this.target, contentRect: { width, height } } as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }
}

const slides = Array.from({ length: 200 }, (_, index) => ({
  id: `slide-${index}`,
  title: `Slide ${index + 1}`,
  layout: 'free',
  blocks: [],
}));

afterEach(() => {
  cleanup();
  ResizeObserverMock.instances = [];
  vi.unstubAllGlobals();
});

describe('DeckCanvas', () => {
  it('fits each virtual aspect to a container without changing canvas dimensions', () => {
    for (const aspect of DECK_ASPECTS) {
      const canvas = deckCanvasSize(aspect);
      const fit = fitDeckCanvas({ width: canvas.width / 2, height: canvas.height / 2 }, canvas);
      expect(fit).toEqual({ scale: 0.5, offsetX: 0, offsetY: 0 });
    }

    expect(fitDeckCanvas({ width: 640, height: 800 }, deckCanvasSize('16:9'))).toEqual({
      scale: 0.5,
      offsetX: 0,
      offsetY: 220,
    });
  });

  it('scales responsively and keeps only the active slide plus its two neighbors mounted', async () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    const { container, rerender } = render(DeckCanvasHarness, {
      props: { slides, activeIndex: 100 },
    });
    const observer = ResizeObserverMock.instances[0];
    expect(observer).toBeTruthy();
    observer?.resize(640, 800);

    const canvas = screen.getByTestId('deck-canvas');
    await waitFor(() => expect(canvas.getAttribute('data-scale')).toBe('0.5'));
    expect(canvas.getAttribute('style')).toContain('width: 1280px');
    expect(canvas.getAttribute('style')).toContain('height: 720px');
    expect(container.querySelectorAll('[data-canvas-slide]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-canvas-slide="99"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-canvas-slide="100"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-canvas-slide="101"]')).toHaveLength(1);
    expect(screen.getByRole('group', { name: '101 of 200: Slide 101' })).toBeTruthy();
    expect(container.querySelector('[data-canvas-slide="99"]')?.getAttribute('aria-hidden')).toBe(
      'true'
    );

    await rerender({ slides, activeIndex: 0 });
    expect(container.querySelectorAll('[data-canvas-slide]')).toHaveLength(2);
    expect(container.querySelector('[data-canvas-slide="0"]')).toBeTruthy();
    expect(container.querySelector('[data-canvas-slide="1"]')).toBeTruthy();
    expect(container.querySelector('[data-canvas-slide="2"]')).toBeNull();
  });

  it('does not show a canvas until ResizeObserver reports a usable size', async () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    render(DeckCanvasHarness, { props: { slides: slides.slice(0, 1), activeIndex: 0 } });
    const canvas = screen.getByTestId('deck-canvas');
    expect(canvas.getAttribute('data-scale')).toBe('0');
    expect(canvas.getAttribute('style')).toContain('visibility: hidden');

    ResizeObserverMock.instances[0]?.resize(1280, 720);
    await waitFor(() => expect(canvas.getAttribute('data-scale')).toBe('1'));
  });
});
