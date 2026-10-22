import { describe, expect, it } from 'vitest';
import {
  createDeckNavigator,
  defaultSlideStepCount,
  formatDeckHash,
  parseDeckHash,
  slidePositionCount,
} from '../src/navigation/index.ts';
import type { Deck } from '../src/schema/index.ts';

function slide(
  id: string,
  options: { steps?: string[]; hidden?: boolean; title?: string } = {}
): Deck['slides'][number] {
  return {
    id,
    title: options.title ?? id,
    layout: 'title-hero',
    props: { title: options.title ?? id },
    ...(options.steps ? { steps: options.steps } : {}),
    ...(options.hidden ? { hidden: true } : {}),
  };
}

function deck(slides: Deck['slides']): Deck {
  return {
    style: { aspect: '16:9' },
    slides,
  };
}

describe('parseDeckHash / formatDeckHash', () => {
  it('round-trips #/<id>/<step>', () => {
    expect(formatDeckHash('intro', 2)).toBe('#/intro/2');
    expect(parseDeckHash('#/intro/2')).toEqual({ slideId: 'intro', step: 2 });
    expect(parseDeckHash('/intro/0')).toEqual({ slideId: 'intro', step: 0 });
    expect(parseDeckHash('intro')).toEqual({ slideId: 'intro', step: 0 });
    expect(parseDeckHash(formatDeckHash('closing-cta', 0))).toEqual({
      slideId: 'closing-cta',
      step: 0,
    });
  });

  it('rejects hostile or malformed input', () => {
    expect(parseDeckHash('')).toBeNull();
    expect(parseDeckHash(null)).toBeNull();
    expect(parseDeckHash('#/../etc/passwd')).toBeNull();
    expect(parseDeckHash('#/intro/../../x')).toBeNull();
    expect(parseDeckHash('#/intro?x=1')).toBeNull();
    expect(parseDeckHash('#/intro#frag')).toBeNull();
    expect(parseDeckHash('#/Intro/0')).toBeNull();
    expect(parseDeckHash('#/intro/-1')).toBeNull();
    expect(parseDeckHash('#/intro/1.5')).toBeNull();
    expect(parseDeckHash('#/intro/999')).toBeNull();
    expect(parseDeckHash('#//intro/0')).toBeNull();
    expect(parseDeckHash('#/intro%2f0')).toBeNull();
    expect(parseDeckHash(`#/${'a'.repeat(80)}/0`)).toBeNull();
  });

  it('clamps step in formatDeckHash and ignores bad ids', () => {
    expect(formatDeckHash('ok', -3)).toBe('#/ok/0');
    expect(formatDeckHash('ok', 100)).toBe('#/ok/32');
    expect(formatDeckHash('Bad_ID', 1)).toBe('#/');
  });
});

describe('defaultSlideStepCount', () => {
  it('is 1 without steps, and one position per labelled step plus the initial state', () => {
    expect(defaultSlideStepCount(slide('a'))).toBe(1);
    expect(defaultSlideStepCount(slide('b', { steps: [] }))).toBe(1);
    // Labels name steps 1, 2, 3; step 0 is the initial state, so the last label is reachable.
    expect(defaultSlideStepCount(slide('c', { steps: ['one', 'two', 'three'] }))).toBe(4);
    expect(slidePositionCount(slide('c', { steps: ['one', 'two', 'three'] }))).toBe(4);
  });
});

describe('createDeckNavigator', () => {
  const sample = deck([
    slide('intro', { steps: ['hook', 'promise'] }),
    slide('hidden-gap', { hidden: true, steps: ['a', 'b', 'c'] }),
    slide('body', { steps: ['point'] }),
    slide('end'),
  ]);

  it('starts on the first visible slide at step 0', () => {
    const nav = createDeckNavigator(sample);
    expect(nav.getLocation()).toEqual({
      slideIndex: 0,
      slideId: 'intro',
      step: 0,
      stepCount: 3,
    });
    expect(nav.visibleSlides().map((s) => s.id)).toEqual(['intro', 'body', 'end']);
    expect(nav.toHash()).toBe('#/intro/0');
  });

  it('next walks steps then slides and skips hidden slides', () => {
    const nav = createDeckNavigator(sample);
    // intro has steps [hook, promise] → positions 0 (initial), 1 (hook), 2 (promise)
    expect(nav.next()).toMatchObject({ slideId: 'intro', step: 1 });
    expect(nav.next()).toMatchObject({ slideId: 'intro', step: 2 });
    // past the last step → body (skips hidden-gap); one label → positions 0 and 1
    expect(nav.next()).toMatchObject({ slideId: 'body', step: 0, stepCount: 2 });
    expect(nav.next()).toMatchObject({ slideId: 'body', step: 1 });
    expect(nav.next()).toMatchObject({ slideId: 'end', step: 0 });
    expect(nav.next()).toMatchObject({ slideId: 'end', step: 0 }); // clamp at end
  });

  it('prev walks steps then previous slides last step', () => {
    const nav = createDeckNavigator(sample);
    nav.goTo('end', 0);
    // Back onto a slide lands on its last step.
    expect(nav.prev()).toMatchObject({ slideId: 'body', step: 1 });
    expect(nav.prev()).toMatchObject({ slideId: 'body', step: 0 });
    expect(nav.prev()).toMatchObject({ slideId: 'intro', step: 2 });
    expect(nav.prev()).toMatchObject({ slideId: 'intro', step: 1 });
    expect(nav.prev()).toMatchObject({ slideId: 'intro', step: 0 });
    expect(nav.prev()).toMatchObject({ slideId: 'intro', step: 0 });
  });

  it('first and last target visible ends', () => {
    const nav = createDeckNavigator(sample);
    nav.goTo('body', 0);
    expect(nav.first()).toMatchObject({ slideId: 'intro', step: 0 });
    expect(nav.last()).toMatchObject({ slideId: 'end', step: 0 });
  });

  it('goTo clamps steps and falls back for unknown or hidden ids', () => {
    const nav = createDeckNavigator(sample);
    expect(nav.goTo('intro', 99)).toMatchObject({ slideId: 'intro', step: 2 });
    expect(nav.goTo('intro', -1)).toMatchObject({ slideId: 'intro', step: 0 });
    expect(nav.goTo('nope', 0)).toMatchObject({ slideId: 'intro', step: 0 });
    expect(nav.goTo('hidden-gap', 2)).toMatchObject({ slideId: 'intro', step: 0 });
  });

  it('goToIndex uses the visible list only', () => {
    const nav = createDeckNavigator(sample);
    expect(nav.goToIndex(1)).toMatchObject({ slideId: 'body', step: 0 });
    expect(nav.goToIndex(99)).toMatchObject({ slideId: 'end', step: 0 });
    expect(nav.goToIndex(-5, 1)).toMatchObject({ slideId: 'intro', step: 1 });
  });

  it('applyHash round-trips and rejects hostile input without moving', () => {
    const nav = createDeckNavigator(sample);
    nav.goTo('body', 0);
    expect(nav.applyHash('#/intro/1')).toMatchObject({ slideId: 'intro', step: 1 });
    expect(nav.toHash()).toBe('#/intro/1');
    expect(nav.applyHash('#/../evil/0')).toBeNull();
    expect(nav.getLocation().slideId).toBe('intro');
    expect(nav.applyHash('#/hidden-gap/0')).toMatchObject({ slideId: 'intro', step: 0 });
  });

  it('accepts a custom stepCount resolver', () => {
    const nav = createDeckNavigator(sample, {
      stepCount: (s) => (s.id === 'end' ? 4 : defaultSlideStepCount(s)),
    });
    nav.goTo('end', 0);
    expect(nav.getLocation().stepCount).toBe(4);
    expect(nav.next()).toMatchObject({ slideId: 'end', step: 1 });
    expect(nav.next()).toMatchObject({ slideId: 'end', step: 2 });
  });

  it('honours initialSlideId when visible', () => {
    const nav = createDeckNavigator(sample, { initialSlideId: 'body', initialStep: 0 });
    expect(nav.getLocation().slideId).toBe('body');
    const hiddenStart = createDeckNavigator(sample, { initialSlideId: 'hidden-gap' });
    expect(hiddenStart.getLocation().slideId).toBe('intro');
  });
});
