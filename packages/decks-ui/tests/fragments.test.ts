import type { Deck, DeckSlide } from '@protoyard/decks/schema';
import { cleanup, configure, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeckApp } from '../src/app/index.ts';

/**
 * Steps on Protoyard slides presented by the `@texuli/slides` stage: stepped
 * blocks of a free slide (painted by `@protoyard/blocks-ui`) reveal through
 * the stage's step context, keep their place while hidden, and code
 * highlights move per step. The stage's own fragment rules (catalog layouts,
 * print, overview) are tested in `@texuli/slides`.
 */
configure({ asyncUtilTimeout: 15_000 });
vi.setConfig({ testTimeout: 30_000 });

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

const end: DeckSlide = {
  id: 'end',
  title: 'End',
  layout: 'free',
  blocks: [{ type: 'heading', text: 'The end', level: 2 }],
};

function deck(): Deck {
  return {
    style: {},
    outline: {
      title: 'Fragments',
      sections: [{ id: 'all', slideIds: ['plan', 'walk', 'cards', 'end'] }],
    },
    slides: [plan, walk, cards, end],
  };
}

beforeAll(async () => {
  await Promise.all([
    import('../../blocks-ui/src/text/index.ts'),
    import('../../blocks-ui/src/code/index.ts'),
  ]);
}, 60_000);

beforeEach(() => {
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

function mount(hash = '') {
  window.location.hash = hash;
  const view = render(DeckApp, { props: { deck: deck(), autofocus: true } });
  const app = () => view.container.querySelector('[data-py-deck-app]') as HTMLElement;
  const stage = () => view.container.querySelector('.tx-deck-stage') as HTMLElement;
  const slide = (id: string) =>
    view.container.querySelector(`[data-tx-deck-slide="${id}"]`) as HTMLElement;
  return { view, app, stage, slide };
}

/** The phase of each stepped block on a free slide, in order. */
const phases = (scope: Element) =>
  [...scope.querySelectorAll<HTMLElement>('[data-tx-deck-item][data-tx-deck-fragment]')].map(
    (el) => el.dataset.txDeckFragment
  );

const highlightedLines = (scope: Element) =>
  [...scope.querySelectorAll<HTMLElement>('[data-highlighted]')].map((el) => el.dataset.line);

describe('free slide reveals', () => {
  it('keeps stepped blocks hidden, inert and silent until their step, then shows them in order', async () => {
    const { app, stage, slide } = mount('#/plan/0');
    await waitFor(() => expect(slide('plan')?.querySelector('[data-py-deck-free]')).toBeTruthy());
    await waitFor(() => expect(phases(slide('plan'))).toEqual(['hidden', 'hidden', 'hidden']));
    const first = slide('plan').querySelector('[data-tx-deck-item="1"]') as HTMLElement;
    expect(first.getAttribute('aria-hidden')).toBe('true');
    expect(first.hasAttribute('inert')).toBe(true);
    expect(first.dataset.txDeckEffect).toBe('fade-up');
    // Hidden blocks stay in the layout: their content is rendered, only invisible.
    await waitFor(() => expect(first.textContent).toContain('First point'));

    await fireEvent.keyDown(stage(), { key: 'ArrowRight' });
    await waitFor(() => expect(app().dataset.slideStep).toBe('1'));
    await waitFor(() => expect(phases(slide('plan'))).toEqual(['visible', 'hidden', 'hidden']));
    expect(first.getAttribute('aria-hidden')).toBeNull();
    expect(first.hasAttribute('inert')).toBe(false);

    await fireEvent.keyDown(stage(), { key: 'ArrowRight' });
    await fireEvent.keyDown(stage(), { key: 'ArrowRight' });
    await waitFor(() => expect(phases(slide('plan'))).toEqual(['visible', 'visible', 'visible']));

    // Going back hides the last one again.
    await fireEvent.keyDown(stage(), { key: 'ArrowLeft' });
    await waitFor(() => expect(phases(slide('plan'))).toEqual(['visible', 'visible', 'hidden']));
  });

  it('opens a deep link at the exact step, including the last', async () => {
    const { app, slide } = mount('#/plan/3');
    await waitFor(() => expect(app().dataset.slideStep).toBe('3'));
    await waitFor(() => expect(phases(slide('plan'))).toEqual(['visible', 'visible', 'visible']));
  });
});

describe('code highlights per step', () => {
  it('moves a free-slide code block highlight on each step', async () => {
    const { app, stage, slide } = mount('#/walk/0');
    await waitFor(() => expect(highlightedLines(slide('walk'))).toEqual(['1']));
    await fireEvent.keyDown(stage(), { key: 'ArrowRight' });
    await waitFor(() => expect(app().dataset.slideStep).toBe('1'));
    await waitFor(() => expect(highlightedLines(slide('walk'))).toEqual(['2', '3']));
    await fireEvent.keyDown(stage(), { key: 'ArrowRight' });
    await waitFor(() => expect(highlightedLines(slide('walk'))).toEqual(['4']));
    await fireEvent.keyDown(stage(), { key: 'ArrowLeft' });
    await waitFor(() => expect(highlightedLines(slide('walk'))).toEqual(['2', '3']));
  });
});

describe('catalog layout items', () => {
  it('reveal stepped cards in order on the stage', async () => {
    const { stage, slide } = mount('#/cards/0');
    const stepped = () =>
      [...(slide('cards')?.querySelectorAll<HTMLElement>('[data-tx-deck-fragment]') ?? [])].map(
        (el) => el.dataset.txDeckFragment
      );
    await waitFor(() => expect(stepped()).toEqual(['hidden', 'hidden']));
    await fireEvent.keyDown(stage(), { key: 'ArrowRight' });
    await waitFor(() => expect(stepped()).toEqual(['visible', 'hidden']));
    await fireEvent.keyDown(stage(), { key: 'ArrowRight' });
    await waitFor(() => expect(stepped()).toEqual(['visible', 'visible']));
  });
});
