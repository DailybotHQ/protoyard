import { createDeckNavigator, slidePositionCount, slideStepCount } from '@protoyard/decks';
import type { Deck, DeckSlide } from '@protoyard/decks/schema';
import { cleanup, configure, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeckApp } from '../src/app/index.ts';
import DeckSlidePreview from '../src/canvas/DeckSlidePreview.svelte';
import { blockFragment, codeHighlightIndex, slideStepModel } from '../src/layouts/steps.ts';
import { DeckOverview } from '../src/overview/index.ts';
import { DeckPrint } from '../src/print/index.ts';

// Block families load lazily; the first transform of a family chunk is slow.
configure({ asyncUtilTimeout: 15_000 });
vi.setConfig({ testTimeout: 30_000 });

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

const plan: DeckSlide = {
  id: 'plan',
  title: 'Plan',
  layout: 'free',
  blocks: [
    { type: 'heading', text: 'The plan', level: 2 },
    { type: 'text', markdown: 'First point', step: 1, reveal: 'fade-up' },
    { type: 'text', markdown: 'Second point', step: 2 },
    { type: 'text', markdown: 'Third point', step: 3, reveal: 'fade' },
  ],
};

const walk: DeckSlide = {
  id: 'walk',
  title: 'Walkthrough',
  layout: 'free',
  blocks: [
    { type: 'heading', text: 'Walkthrough', level: 2 },
    { type: 'code', lang: 'text', code: 'one\ntwo\nthree\nfour', highlights: ['1', '2-3', '4'] },
  ],
};

const callout: DeckSlide = {
  id: 'callout',
  title: 'Callout',
  layout: 'code-with-callout',
  props: {
    title: 'A slide is data',
    code: { lang: 'text', source: 'alpha\nbeta\ngamma', highlights: ['1', '2-3'] },
    bullets: ['A bullet'],
  },
};

const cards: DeckSlide = {
  id: 'cards',
  title: 'Cards',
  layout: 'three-column-cards',
  props: {
    title: 'Three ideas',
    cards: [
      { heading: 'First', body: 'Always shown.' },
      { heading: 'Second', body: 'Shown on step 1.', step: 1 },
      { heading: 'Third', body: 'Shown on step 2.', step: 2, fragment: 'fade-up' },
    ],
  },
} as DeckSlide;

const timeline: DeckSlide = {
  id: 'timeline',
  title: 'Timeline',
  layout: 'timeline',
  props: {
    events: [
      { time: 'Jan', text: 'One' },
      { time: 'Feb', text: 'Two' },
      { time: 'Mar', text: 'Three' },
      { time: 'Apr', text: 'Four' },
      { time: 'May', text: 'Five', step: 1 },
      { time: 'Jun', text: 'Six' },
    ],
  },
} as DeckSlide;

const end: DeckSlide = {
  id: 'end',
  title: 'End',
  layout: 'free',
  blocks: [{ type: 'heading', text: 'The end', level: 2 }],
};

function deck(motion?: 'none' | 'subtle'): Deck {
  return {
    version: 1,
    outline: { title: 'Fragments', sections: [] },
    ...(motion ? { style: { motion } } : {}),
    slides: [plan, walk, callout, cards, timeline, end],
  } as Deck;
}

// Warm the lazy chunks once so the first test does not pay the cold transform.
beforeAll(async () => {
  await Promise.all([
    import('../../blocks-ui/src/text/index.ts'),
    import('../../blocks-ui/src/code/index.ts'),
    import('../../blocks-ui/src/structure/index.ts'),
    import('../src/layouts/diagram/index.ts'),
    import('../src/layouts/text/index.ts'),
  ]);
}, 60_000);

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
  ResizeObserverMock.instances = [];
  vi.unstubAllGlobals();
  window.location.hash = '';
});

function mount(input: Deck = deck()) {
  const view = render(DeckApp, { props: { deck: input, autofocus: true } });
  for (const observer of ResizeObserverMock.instances) observer.resize(1280, 720);
  return view;
}

const root = (c: HTMLElement) => c.querySelector('[data-py-deck-app]') as HTMLElement;
const slideEl = (c: HTMLElement, id: string) =>
  c.querySelector(`[data-py-deck-slide="${id}"]`) as HTMLElement;

function fragments(scope: Element) {
  return [...scope.querySelectorAll<HTMLElement>('[data-py-fragment]')].map((el) => ({
    text: el.textContent?.trim(),
    state: el.dataset.pyFragment,
    hidden: el.getAttribute('aria-hidden'),
    inert: el.hasAttribute('inert'),
  }));
}

const highlightedLines = (scope: Element) =>
  [...scope.querySelectorAll<HTMLElement>('[data-highlighted]')].map((el) => el.dataset.line);

describe('step positions (regression: the last step was unreachable)', () => {
  it('counts the initial state plus one position per advance', () => {
    expect(slideStepCount(plan)).toBe(3);
    expect(slidePositionCount(plan)).toBe(4);
    expect(slidePositionCount(end)).toBe(1);
    expect(slidePositionCount(callout)).toBe(2);
  });

  it('navigates to the last step with keys and keeps a deep link to it', async () => {
    const nav = createDeckNavigator(deck(), { stepCount: slidePositionCount });
    expect(nav.applyHash('#/plan/3')).toMatchObject({ slideId: 'plan', step: 3 });

    window.location.hash = '#/plan/3';
    const { container } = mount();
    await waitFor(() => expect(root(container).dataset.slideStep).toBe('3'));
    expect(window.location.hash).toBe('#/plan/3');

    await fireEvent.keyDown(root(container), { key: 'ArrowLeft' });
    await waitFor(() => expect(root(container).dataset.slideStep).toBe('2'));
    await fireEvent.keyDown(root(container), { key: 'ArrowRight' });
    await fireEvent.keyDown(root(container), { key: 'ArrowRight' });
    await waitFor(() => expect(root(container).dataset.slideId).toBe('walk'));
    await fireEvent.keyDown(root(container), { key: 'ArrowLeft' });
    await waitFor(() => expect(window.location.hash).toBe('#/plan/3'));
  });
});

describe('block reveals', () => {
  it('keeps stepped blocks laid out but hidden, inert and silent until their step', async () => {
    window.location.hash = '#/plan/0';
    const { container } = mount();
    await waitFor(() => expect(fragments(slideEl(container, 'plan'))).toHaveLength(3));
    const at0 = fragments(slideEl(container, 'plan'));
    expect(at0.every((f) => f.state === 'hidden' && f.hidden === 'true' && f.inert)).toBe(true);
    // Hidden, not removed: the text is in the DOM (it keeps its space), styled invisible.
    const first = slideEl(container, 'plan').querySelector('[data-py-fragment]') as HTMLElement;
    expect(first.textContent).toContain('First point');
    expect(first.className).toContain('invisible');
    expect(first.className).toContain('translate-y-');
    expect(first.dataset.pyFragmentReveal).toBe('fade-up');
    // The unstepped heading is part of the initial state.
    expect(slideEl(container, 'plan').textContent).toContain('The plan');

    await fireEvent.keyDown(root(container), { key: 'ArrowRight' });
    await waitFor(() =>
      expect(fragments(slideEl(container, 'plan')).map((f) => f.state)).toEqual([
        'shown',
        'hidden',
        'hidden',
      ])
    );
    const shown = fragments(slideEl(container, 'plan'))[0];
    expect(shown?.hidden).toBeNull();
    expect(shown?.inert).toBe(false);

    await fireEvent.keyDown(root(container), { key: 'ArrowRight' });
    await fireEvent.keyDown(root(container), { key: 'ArrowRight' });
    await waitFor(() =>
      expect(fragments(slideEl(container, 'plan')).every((f) => f.state === 'shown')).toBe(true)
    );

    // Stepping back hides them again.
    await fireEvent.keyDown(root(container), { key: 'ArrowLeft' });
    await waitFor(() =>
      expect(fragments(slideEl(container, 'plan')).map((f) => f.state)).toEqual([
        'shown',
        'shown',
        'hidden',
      ])
    );
  });

  it('drops the motion under reduced motion and motion: none', async () => {
    window.location.hash = '#/plan/0';
    const { container } = mount(deck('none'));
    expect(root(container).dataset.pyDeckMotion).toBe('none');
    await waitFor(() => expect(fragments(slideEl(container, 'plan'))).toHaveLength(3));
    const el = slideEl(container, 'plan').querySelector('[data-py-fragment]') as HTMLElement;
    expect(el.className).toContain('motion-reduce:transition-none');
    expect(el.className).toContain('[[data-py-deck-motion=none]_&]:transition-none');
  });
});

describe('code highlights per step', () => {
  it('moves a code block highlight on each step', async () => {
    window.location.hash = '#/walk/0';
    const { container } = mount();
    await waitFor(() => expect(highlightedLines(slideEl(container, 'walk'))).toEqual(['1']));
    await fireEvent.keyDown(root(container), { key: 'ArrowRight' });
    await waitFor(() => expect(highlightedLines(slideEl(container, 'walk'))).toEqual(['2', '3']));
    await fireEvent.keyDown(root(container), { key: 'ArrowRight' });
    await waitFor(() => expect(highlightedLines(slideEl(container, 'walk'))).toEqual(['4']));
    await fireEvent.keyDown(root(container), { key: 'ArrowLeft' });
    await waitFor(() => expect(highlightedLines(slideEl(container, 'walk'))).toEqual(['2', '3']));
  });

  it('steps the highlights of a catalog code-with-callout slide', async () => {
    window.location.hash = '#/callout/0';
    const { container } = mount();
    await waitFor(() => expect(highlightedLines(slideEl(container, 'callout'))).toEqual(['1']));
    await fireEvent.keyDown(root(container), { key: 'ArrowRight' });
    await waitFor(() =>
      expect(highlightedLines(slideEl(container, 'callout'))).toEqual(['2', '3'])
    );
    expect(window.location.hash).toBe('#/callout/1');
    await fireEvent.keyDown(root(container), { key: 'ArrowRight' });
    await waitFor(() => expect(root(container).dataset.slideId).toBe('cards'));
  });
});

describe('catalog layout items', () => {
  const items = (scope: Element) =>
    [...scope.querySelectorAll<HTMLElement>('[data-py-fragment-kind="prop"]')].map((el) => ({
      text: el.querySelector('h3, p:last-child')?.textContent?.trim(),
      state: el.dataset.pyFragment,
      hidden: el.getAttribute('aria-hidden'),
      reveal: el.dataset.pyFragmentReveal,
    }));

  it('render with step markers and reveal stepped cards in order', async () => {
    window.location.hash = '#/cards/0';
    const { container } = mount();
    const at = () => slideEl(container, 'cards');
    await waitFor(() => expect(items(at())).toHaveLength(2));
    expect(at().querySelector('[data-py-deck-layout="three-column-cards"]')).not.toBeNull();
    expect(at().textContent).not.toContain('invalid content');
    expect(items(at())).toEqual([
      { text: 'Second', state: 'hidden', hidden: 'true', reveal: 'in' },
      { text: 'Third', state: 'hidden', hidden: 'true', reveal: 'fade-up' },
    ]);
    // The unstepped card is plain content.
    expect(at().querySelectorAll('[data-slot="card"]')).toHaveLength(3);

    await fireEvent.keyDown(root(container), { key: 'ArrowRight' });
    await waitFor(() => expect(items(at()).map((i) => i.state)).toEqual(['shown', 'hidden']));
    await fireEvent.keyDown(root(container), { key: 'ArrowRight' });
    await waitFor(() => expect(items(at()).map((i) => i.state)).toEqual(['shown', 'shown']));
    expect(window.location.hash).toBe('#/cards/2');
    await fireEvent.keyDown(root(container), { key: 'ArrowLeft' });
    await waitFor(() => expect(items(at()).map((i) => i.state)).toEqual(['shown', 'hidden']));
  });

  it('finds a stepped event on the second timeline row by its index', async () => {
    window.location.hash = '#/timeline/0';
    const { container } = mount();
    const at = () => slideEl(container, 'timeline');
    await waitFor(() => expect(items(at())).toHaveLength(1));
    expect(items(at())[0]).toMatchObject({ text: 'Five', state: 'hidden' });
    await fireEvent.keyDown(root(container), { key: 'ArrowRight' });
    await waitFor(() => expect(items(at())[0]?.state).toBe('shown'));
  });
});

describe('views that show a whole slide', () => {
  it('print shows every step', async () => {
    const { container } = render(DeckPrint, { props: { deck: deck() } });
    await waitFor(() => expect(fragments(container)).toHaveLength(3));
    expect(fragments(container).every((f) => f.state === 'shown')).toBe(true);
    await waitFor(() => expect(highlightedLines(container)).toContain('4'));
  });

  it('overview thumbnails and the presenter preview show the final step', async () => {
    const overview = render(DeckOverview, {
      props: { slides: deck().slides, activeSlideId: 'plan', onSelect: () => {} },
    });
    await waitFor(() => expect(fragments(overview.container)).toHaveLength(3));
    expect(fragments(overview.container).every((f) => f.state === 'shown')).toBe(true);
    overview.unmount();

    const preview = render(DeckSlidePreview, { props: { slide: plan } });
    await waitFor(() => expect(fragments(preview.container)).toHaveLength(3));
    expect(fragments(preview.container).every((f) => f.state === 'shown')).toBe(true);
  });

  it('the neighbour before the active slide is mounted at its last step', async () => {
    window.location.hash = '#/walk/0';
    const { container } = mount();
    await waitFor(() => expect(fragments(slideEl(container, 'plan'))).toHaveLength(3));
    expect(slideEl(container, 'plan').dataset.step).toBe('3');
    expect(fragments(slideEl(container, 'plan')).every((f) => f.state === 'shown')).toBe(true);
  });
});

describe('step model', () => {
  it('plays sparse authored steps densely', () => {
    const sparse: DeckSlide = {
      id: 'sparse',
      layout: 'free',
      blocks: [
        { type: 'text', markdown: 'a', step: 5 },
        { type: 'text', markdown: 'b', step: 20 },
      ],
    } as DeckSlide;
    const model = slideStepModel(sparse);
    expect(model.count).toBe(2);
    expect(model.dense(5)).toBe(1);
    expect(model.dense(20)).toBe(2);
    expect(blockFragment(model, { step: 20 }, 1)).toEqual({ visible: false, active: false });
    expect(blockFragment(model, { step: 20 }, 2)).toEqual({ visible: true, active: true });
    expect(blockFragment(model, {}, 0)).toBeNull();
    expect(blockFragment(model, { step: 5, reveal: 'highlight' }, 0)).toEqual({
      visible: true,
      active: false,
    });
  });

  it('maps highlights from the block step', () => {
    const model = slideStepModel(walk);
    expect(codeHighlightIndex(model, { highlights: ['1', '2', '3'] }, 0)).toBe(0);
    expect(codeHighlightIndex(model, { highlights: ['1', '2', '3'] }, 2)).toBe(2);
    expect(codeHighlightIndex(model, { highlights: ['1', '2', '3'] }, 9)).toBe(2);
  });
});
