import { describe, expect, it } from 'vitest';
import {
  activeCodeHighlight,
  FRAGMENT_EFFECTS,
  fragmentPhase,
  MAX_MOTION_MS,
  prefersReducedMotion,
  REDUCED_FADE_MS,
  resolveDeckTransitions,
  resolveFragmentMotion,
  resolveSlideTransition,
  type SlideSteps,
  slideFragments,
  slideStepCount,
  slideSteps,
} from '../src/motion/index.ts';
import { DECK_LIMITS, type DeckSlide, DeckSlideSchema } from '../src/schema/index.ts';

const slide = (input: unknown): DeckSlide => DeckSlideSchema.parse(input);

/** Every fragment's step index, in the order the deck reveals them. */
const order = (steps: SlideSteps) => slideFragments(steps).map((f) => f.index);
const isMonotonic = (values: number[]) =>
  values.every((v, i) => i === 0 || v >= (values[i - 1] as number));

describe('slideSteps: free slides', () => {
  const free = slide({
    id: 'launch',
    layout: 'free',
    blocks: [
      { type: 'heading', text: 'Launch plan' },
      { type: 'text', markdown: 'Third', step: 7, reveal: 'fade-up' },
      { type: 'text', markdown: 'First', step: 2 },
      { type: 'callout', body: 'Also first', step: 2, reveal: 'highlight' },
      { type: 'quote', quote: 'Second', step: 5, reveal: 'strike' },
      { type: 'text', markdown: 'Always there', step: 0, reveal: 'grow' },
    ],
  });

  it('renumbers authored steps densely and in order (2, 5, 7 → 1, 2, 3)', () => {
    const steps = slideSteps(free);
    expect(steps.count).toBe(3);
    expect(steps.steps.map((s) => s.fragments.map((f) => [f.authored, f.effect]))).toEqual([
      [
        [2, 'in'],
        [2, 'highlight'],
      ],
      [[5, 'strike']],
      [[7, 'fade-up']],
    ]);
    expect(isMonotonic(order(steps))).toBe(true);
    expect(slideStepCount(free)).toBe(3);
  });

  it('keeps step-0 fragments in the initial state and maps reveal "fade" to "in"', () => {
    const steps = slideSteps(free);
    expect(steps.initial).toEqual([
      { index: 0, authored: 0, effect: 'grow', source: { kind: 'block', path: [5] } },
    ]);
    const plain = slideSteps(
      slide({
        id: 'x',
        layout: 'free',
        blocks: [{ type: 'text', markdown: 'a', step: 1, reveal: 'fade' }],
      })
    );
    expect(plain.steps[0]?.fragments[0]?.effect).toBe('in');
  });

  it('keeps fragments of the same step in document order, including nested containers', () => {
    const nested = slideSteps(
      slide({
        id: 'cols',
        layout: 'free',
        blocks: [
          {
            type: 'columns',
            columns: [
              [{ type: 'text', id: 'left', markdown: 'L', step: 1 }],
              [{ type: 'text', id: 'right', markdown: 'R', step: 1 }],
            ],
          },
          { type: 'text', id: 'after', markdown: 'A', step: 1 },
        ],
      })
    );
    expect(nested.steps[0]?.fragments.map((f) => f.source)).toEqual([
      { kind: 'block', path: [0, 'columns', 0, 0], blockId: 'left' },
      { kind: 'block', path: [0, 'columns', 1, 0], blockId: 'right' },
      { kind: 'block', path: [1], blockId: 'after' },
    ]);
  });

  it('turns stepped code highlights into one step each, starting at the block step', () => {
    const code = slide({
      id: 'code',
      layout: 'free',
      blocks: [
        { type: 'heading', text: 'Setup', step: 1 },
        {
          type: 'code',
          id: 'setup',
          lang: 'ts',
          code: 'a\nb\nc\nd\ne\nf',
          step: 2,
          highlights: ['1-2', '4-6', '3'],
        },
      ],
    });
    const steps = slideSteps(code);
    // Heading at 1; the code block enters at 2 with its first highlight; then 3, 4.
    expect(steps.count).toBe(4);
    expect(
      steps.steps.map((s) =>
        s.fragments.map((f) => (f.source.kind === 'code-highlight' ? f.source.lines : f.effect))
      )
    ).toEqual([['in'], ['1-2', 'in'], ['4-6'], ['3']]);
    const all = slideFragments(steps);
    expect(activeCodeHighlight(all, [1], 0)).toBeNull();
    expect(activeCodeHighlight(all, [1], 1)).toBeNull();
    expect(activeCodeHighlight(all, [1], 2)).toBe('1-2');
    expect(activeCodeHighlight(all, [1], 3)).toBe('4-6');
    expect(activeCodeHighlight(all, [1], 9)).toBe('3');
    expect(activeCodeHighlight(all, [0], 9)).toBeNull();
  });

  it('shows the first highlight of an unstepped code block in the initial state', () => {
    const steps = slideSteps(
      slide({
        id: 'c',
        layout: 'free',
        blocks: [{ type: 'code', lang: 'ts', code: 'a\nb', highlights: ['1', '2'] }],
      })
    );
    expect(steps.initial.map((f) => f.effect)).toEqual(['highlight']);
    expect(steps.count).toBe(1);
    expect(activeCodeHighlight(slideFragments(steps), [0], 0)).toBe('1');
  });

  it('has no steps when nothing is stepped', () => {
    const steps = slideSteps(
      slide({ id: 'plain', layout: 'free', blocks: [{ type: 'text', markdown: 'x' }] })
    );
    expect(steps).toMatchObject({ count: 0, initial: [], steps: [], warnings: [] });
  });
});

describe('slideSteps: catalog slides', () => {
  it('reads { step, fragment | reveal } markers anywhere in props, every effect included', () => {
    const steps = slideSteps(
      slide({
        id: 'bullets',
        layout: 'bullets',
        props: {
          title: 'Why now',
          items: [
            { text: 'One', step: 1, fragment: 'in-then-out' },
            { text: 'Two', step: 2, fragment: 'shrink' },
            { text: 'Three', step: 3, reveal: 'fade-up' },
            { text: 'Gone', step: 3, fragment: 'out' },
            { text: 'Unknown effect', step: 4, fragment: 'explode' },
          ],
          aside: { note: { text: 'deep', step: 2 } },
          count: 5,
        },
      })
    );
    expect(steps.count).toBe(4);
    expect(
      steps.steps.map((s) => s.fragments.map((f) => [f.effect, f.source.path.join('.')]))
    ).toEqual([
      [['in-then-out', 'props.items.0']],
      [
        ['shrink', 'props.items.1'],
        ['in', 'props.aside.note'],
      ],
      [
        ['fade-up', 'props.items.2'],
        ['out', 'props.items.3'],
      ],
      [['in', 'props.items.4']],
    ]);
  });

  it('ignores non-integer or negative step values in props', () => {
    const steps = slideSteps(
      slide({
        id: 'odd',
        layout: 'bullets',
        props: { a: { step: 1.5 }, b: { step: -1 }, c: { step: '2' }, d: { step: 2 } },
      })
    );
    expect(steps.count).toBe(1);
    expect(steps.steps[0]?.fragments[0]?.source.path).toEqual(['props', 'd']);
  });

  it('labels steps from slide.steps and lets labels extend the count', () => {
    const labelled = slideSteps(
      slide({
        id: 'agenda',
        layout: 'agenda',
        props: { items: [{ text: 'A', step: 1 }] },
        steps: ['Problem', 'Solution', 'Ask'],
      })
    );
    expect(labelled.count).toBe(3);
    expect(labelled.steps.map((s) => [s.index, s.label, s.fragments.length])).toEqual([
      [1, 'Problem', 1],
      [2, 'Solution', 0],
      [3, 'Ask', 0],
    ]);
  });

  it(`caps a slide at ${DECK_LIMITS.steps} steps and warns, merging the rest into the last`, () => {
    const items = Array.from({ length: DECK_LIMITS.steps + 3 }, (_, i) => ({
      text: `${i}`,
      step: i + 1,
    }));
    const steps = slideSteps(slide({ id: 'long', layout: 'bullets', props: { items } }));
    expect(steps.count).toBe(DECK_LIMITS.steps);
    expect(steps.steps.at(-1)?.fragments).toHaveLength(4);
    expect(steps.warnings).toEqual([
      `Slide "long" has ${DECK_LIMITS.steps + 3} steps; steps after ${DECK_LIMITS.steps} play together on the last one.`,
    ]);
    expect(isMonotonic(order(steps))).toBe(true);
  });

  it('is deterministic and monotonic for any authored order', () => {
    const shuffled = [9, 3, 3, 12, 1, 7, 0, 7, 20].map((step, i) => ({ text: `${i}`, step }));
    const s = slide({ id: 'mix', layout: 'bullets', props: { items: shuffled } });
    const first = slideSteps(s);
    expect(slideSteps(s)).toEqual(first);
    expect(isMonotonic(order(first))).toBe(true);
    expect(first.steps.map((step) => step.index)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(first.steps.flatMap((step) => step.fragments.map((f) => f.authored))).toEqual([
      1, 3, 3, 7, 7, 9, 12, 20,
    ]);
  });
});

describe('fragmentPhase', () => {
  const phases = (effect: (typeof FRAGMENT_EFFECTS)[number]) =>
    [0, 1, 2, 3].map((current) => fragmentPhase({ index: 2, effect }, current));

  it.each([
    ['in', [false, false, true, true], [false, false, true, true]],
    ['fade-up', [false, false, true, true], [false, false, true, true]],
    ['out', [true, true, false, false], [false, false, true, true]],
    ['in-then-out', [false, false, true, false], [false, false, true, false]],
    ['grow', [true, true, true, true], [false, false, true, true]],
    ['shrink', [true, true, true, true], [false, false, true, true]],
    ['highlight', [true, true, true, true], [false, false, true, true]],
    ['strike', [true, true, true, true], [false, false, true, true]],
  ] as const)('%s', (effect, visible, active) => {
    expect(phases(effect).map((p) => p.visible)).toEqual(visible);
    expect(phases(effect).map((p) => p.active)).toEqual(active);
  });

  it('covers every effect and treats bad steps as the initial state', () => {
    expect(FRAGMENT_EFFECTS).toHaveLength(8);
    expect(fragmentPhase({ index: 1, effect: 'in' }, Number.NaN)).toEqual({
      visible: false,
      active: false,
    });
    expect(fragmentPhase({ index: 1, effect: 'in' }, -3)).toEqual({
      visible: false,
      active: false,
    });
    expect(fragmentPhase({ index: 1, effect: 'in' }, 1.9)).toEqual({ visible: true, active: true });
  });
});

describe('resolveSlideTransition', () => {
  it('prefers the slide override, then the deck default, then fade', () => {
    expect(resolveSlideTransition({ transition: 'zoom' }, { transition: 'slide' })).toMatchObject({
      transition: 'slide',
      reason: 'slide-override',
    });
    expect(resolveSlideTransition({ transition: 'zoom' }, {})).toMatchObject({
      transition: 'zoom',
      reason: 'deck-default',
    });
    expect(resolveSlideTransition({}, undefined)).toMatchObject({
      transition: 'fade',
      durationMs: 300,
      motion: 'full',
      reason: 'engine-default',
    });
    expect(resolveSlideTransition({ transition: 'slide' }, { transition: 'none' })).toMatchObject({
      transition: 'none',
      durationMs: 0,
      requested: 'none',
    });
  });

  it('turns everything off at motion "none", whatever the slide asks for', () => {
    for (const transition of ['fade', 'slide', 'zoom', 'morph'] as const) {
      expect(resolveSlideTransition({ motion: 'none' }, { transition })).toEqual({
        transition: 'none',
        durationMs: 0,
        motion: 'none',
        requested: transition,
        reason: 'motion-none',
      });
    }
  });

  it('keeps direction but drops zoom and shortens durations at motion "subtle"', () => {
    expect(resolveSlideTransition({ motion: 'subtle' }, { transition: 'slide' })).toMatchObject({
      transition: 'slide',
      durationMs: 240,
    });
    expect(resolveSlideTransition({ motion: 'subtle' }, { transition: 'zoom' })).toMatchObject({
      transition: 'fade',
      durationMs: 180,
    });
    expect(resolveSlideTransition({ motion: 'subtle' }, { transition: 'morph' })).toMatchObject({
      transition: 'morph',
      reason: 'subtle',
    });
  });

  it('forces none or a short fade under reduced motion, for every level and transition', () => {
    const reduced = { prefersReducedMotion: true };
    for (const motion of ['full', 'subtle', 'none', undefined] as const) {
      for (const transition of ['none', 'fade', 'slide', 'zoom', 'morph', undefined] as const) {
        const result = resolveSlideTransition(
          { motion, transition: 'zoom' },
          { transition },
          reduced
        );
        if (result.transition === 'none') {
          expect(result.durationMs).toBe(0);
        } else {
          expect(result).toMatchObject({ transition: 'fade', durationMs: REDUCED_FADE_MS });
        }
      }
    }
    // Reduced motion lowers the level but never raises "none".
    expect(resolveSlideTransition({ motion: 'none' }, {}, reduced).motion).toBe('none');
    expect(resolveSlideTransition({ motion: 'full' }, {}, reduced).motion).toBe('subtle');
  });

  it(`never exceeds ${MAX_MOTION_MS} ms`, () => {
    for (const motion of ['full', 'subtle', 'none'] as const) {
      for (const transition of ['none', 'fade', 'slide', 'zoom', 'morph'] as const) {
        for (const prefersReducedMotion of [false, true]) {
          const { durationMs } = resolveSlideTransition(
            { motion },
            { transition },
            { prefersReducedMotion }
          );
          expect(durationMs).toBeGreaterThanOrEqual(0);
          expect(durationMs).toBeLessThanOrEqual(MAX_MOTION_MS);
        }
      }
    }
  });

  it('resolves a whole deck slide by slide', () => {
    const slides = [
      slide({ id: 'a', layout: 'title', props: {} }),
      slide({ id: 'b', layout: 'title', props: {}, transition: 'none' }),
    ];
    expect(
      resolveDeckTransitions({ style: { transition: 'slide' }, slides }).map(
        (s) => `${s.slideId}:${s.transition.transition}`
      )
    ).toEqual(['a:slide', 'b:none']);
  });
});

describe('resolveFragmentMotion', () => {
  it('keeps effects and durations at full, shortens them at subtle', () => {
    expect(resolveFragmentMotion('fade-up', {})).toEqual({ effect: 'fade-up', durationMs: 300 });
    expect(resolveFragmentMotion('grow', { motion: 'subtle' })).toEqual({
      effect: 'grow',
      durationMs: 180,
    });
  });

  it('turns moving effects into plain fades under reduced motion and instant at none', () => {
    const reduced = { prefersReducedMotion: true };
    for (const effect of ['fade-up', 'grow', 'shrink'] as const) {
      expect(resolveFragmentMotion(effect, {}, reduced)).toEqual({
        effect: 'in',
        durationMs: REDUCED_FADE_MS,
      });
      expect(resolveFragmentMotion(effect, { motion: 'none' })).toEqual({
        effect: 'in',
        durationMs: 0,
      });
    }
    // State effects keep their meaning; only their motion goes.
    expect(resolveFragmentMotion('strike', { motion: 'none' })).toEqual({
      effect: 'strike',
      durationMs: 0,
    });
    expect(resolveFragmentMotion('highlight', {}, reduced)).toEqual({
      effect: 'highlight',
      durationMs: REDUCED_FADE_MS,
    });
  });
});

describe('prefersReducedMotion', () => {
  const media = (matches: boolean) => () => ({ matches });

  it('reads the OS preference and the prototype toggle, and is safe without a DOM', () => {
    expect(prefersReducedMotion({ matchMedia: media(true) })).toBe(true);
    expect(prefersReducedMotion({ matchMedia: media(false) })).toBe(false);
    expect(
      prefersReducedMotion({
        matchMedia: media(false),
        document: { documentElement: { dataset: { pyMotion: 'reduce' } } },
      })
    ).toBe(true);
    expect(prefersReducedMotion({})).toBe(false);
    expect(
      prefersReducedMotion({
        matchMedia: () => {
          throw new Error('no media queries');
        },
      })
    ).toBe(false);
  });
});
