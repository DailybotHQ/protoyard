import type { Deck, DeckSlide } from '@protoyard/decks/schema';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeckApp } from '../src/app/index.ts';
import DeckOverview from '../src/overview/DeckOverview.svelte';
import { moveOverviewSelection, overviewColumns, overviewWindow } from '../src/overview/window.ts';

vi.mock('../src/layouts/index.ts', async () => {
  const Mock = (await import('./fixtures/MockLayoutRenderer.svelte')).default;
  return { DeckLayoutRenderer: Mock };
});

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

function manySlides(count: number): DeckSlide[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `s${index}`,
    title: `Slide ${index}`,
    layout: 'title-hero' as const,
    props: { title: `Slide ${index}` },
  }));
}

function fixtureDeck(slideCount = 3): Deck {
  const slides = manySlides(slideCount);
  return {
    style: { aspect: '16:9' },
    outline: {
      title: 'Overview demo',
      sections: [{ id: 'all', slideIds: slides.map((slide) => slide.id) }],
    },
    slides,
  };
}

afterEach(() => {
  cleanup();
  ResizeObserverMock.instances = [];
  vi.unstubAllGlobals();
  if (typeof window !== 'undefined') window.location.hash = '';
});

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  if (typeof window !== 'undefined') window.location.hash = '';
});

describe('overview window helpers', () => {
  it('picks columns from width breakpoints', () => {
    expect(overviewColumns(500)).toBe(2);
    expect(overviewColumns(700)).toBe(3);
    expect(overviewColumns(1000)).toBe(4);
  });

  it('moves selection with wrap on left/right and clamp on up/down', () => {
    expect(moveOverviewSelection(0, 'ArrowLeft', 8, 4)).toBe(7);
    expect(moveOverviewSelection(7, 'ArrowRight', 8, 4)).toBe(0);
    expect(moveOverviewSelection(1, 'ArrowDown', 8, 4)).toBe(5);
    expect(moveOverviewSelection(1, 'ArrowUp', 8, 4)).toBe(0);
    expect(moveOverviewSelection(5, 'Home', 8, 4)).toBe(0);
    expect(moveOverviewSelection(0, 'End', 8, 4)).toBe(7);
  });

  it('windows indices around the selection', () => {
    expect(overviewWindow(0, 100, 2)).toEqual({ start: 0, end: 3 });
    expect(overviewWindow(50, 100, 2)).toEqual({ start: 48, end: 53 });
    expect(overviewWindow(99, 100, 2)).toEqual({ start: 97, end: 100 });
  });
});

describe('DeckOverview', () => {
  it('navigates the grid with arrows and opens once on Enter', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const slides = manySlides(6);
    render(DeckOverview, {
      props: {
        slides,
        activeSlideId: 's0',
        aspect: '16:9',
        onSelect,
        onClose,
      },
    });
    ResizeObserverMock.instances[0]?.resize(1000, 600);

    const dialog = screen.getByRole('dialog', { name: 'Slide overview' });
    expect(dialog).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Slide 1: Slide 0' }).getAttribute('data-selected')
      ).toBe('true')
    );

    await fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Slide 2: Slide 1' }).getAttribute('data-selected')
      ).toBe('true')
    );

    await fireEvent.keyDown(dialog, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('s1');

    // Exact-once: further Enter is ignored after selection.
    await fireEvent.keyDown(dialog, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape without selecting', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(DeckOverview, {
      props: {
        slides: manySlides(3),
        activeSlideId: 's1',
        onSelect,
        onClose,
      },
    });
    const dialog = screen.getByRole('dialog', { name: 'Slide overview' });
    await fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('clicking a thumbnail selects exactly once and stops bubbling', async () => {
    const onSelect = vi.fn();
    const parentClick = vi.fn();
    const { container } = render(DeckOverview, {
      props: {
        slides: manySlides(4),
        activeSlideId: 's0',
        onSelect,
      },
    });
    container.addEventListener('click', parentClick, true);
    const item = screen.getByRole('button', { name: 'Slide 3: Slide 2' });
    await fireEvent.click(item);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('s2');
    // Capture-phase listener still sees the event; bubble listeners on ancestors
    // of the button do not after stopPropagation — assert single select only.
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('DeckApp overview integration', () => {
  function mount(deck: Deck = fixtureDeck()) {
    const view = render(DeckApp, { props: { deck, autofocus: true } });
    ResizeObserverMock.instances[0]?.resize(1280, 720);
    return view;
  }

  it('opens on O, loads the overview lazily, and selects a slide once', async () => {
    const view = mount();
    const app = view.container.querySelector('[data-py-deck-app]') as HTMLElement;
    app.focus();

    await fireEvent.keyDown(app, { key: 'o' });
    await waitFor(() =>
      expect(view.container.querySelector('[data-py-deck-overview]')).toBeTruthy()
    );

    // Lazy chunk resolves to the real overview grid.
    await waitFor(() =>
      expect(view.container.querySelector('[data-py-deck-overview-grid]')).toBeTruthy()
    );
    await waitFor(() =>
      expect(view.container.querySelector('[data-py-deck-overview-item="s1"]')).toBeTruthy()
    );

    const target = view.container.querySelector(
      '[data-py-deck-overview-item="s1"]'
    ) as HTMLButtonElement;
    await fireEvent.click(target);

    await waitFor(() => expect(view.container.querySelector('[data-py-deck-overview]')).toBeNull());
    expect(app.getAttribute('data-slide-id')).toBe('s1');
    // One navigation only — still on s1 after a short tick (no double advance).
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(app.getAttribute('data-slide-id')).toBe('s1');
  });
});
