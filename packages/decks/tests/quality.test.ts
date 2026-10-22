import { describe, expect, it } from 'vitest';
import { DECK_TEXT_MINIMUMS } from '../src/canvas.ts';
import { DECK_LAYOUTS } from '../src/layouts/index.ts';
import {
  checkDeckStatic,
  DECK_QUALITY,
  DECK_QUALITY_RULES,
  type DeckQualityIssue,
  type DeckQualityRuleId,
  deckJsonPath,
} from '../src/quality/index.ts';
import { type Deck, safeParseDeck } from '../src/schema/index.ts';

/** Parses a fixture with the real deck schema, so every test deck is valid input. */
function deck(slides: unknown[]): Deck {
  const result = safeParseDeck({ style: {}, slides });
  expect(result.issues).toEqual([]);
  return result.deck as Deck;
}

/**
 * A structurally invalid fixture the deck schema now refuses (catalog layout ids and props are
 * enforced by DeckSchema). Lint still checks unvalidated input as a second line of defense, so these
 * fixtures bypass the schema; each test also proves the schema rejects them at the same path.
 */
function rawDeck(slides: unknown[]): Deck {
  return { style: {}, slides } as unknown as Deck;
}

function schemaRejectsAt(slides: unknown[], jsonPath: string): void {
  const result = safeParseDeck({ style: {}, slides });
  expect(result.issues.map((issue) => issue.jsonPath)).toContain(jsonPath);
}

const notes = (topic: string) =>
  `Talk through ${topic}: say why it matters and give one concrete example.`;

/** Every catalog layout's own sample, in catalog order: the good fixture. */
function goodSlides() {
  return DECK_LAYOUTS.map((layout, i) =>
    layout.id === 'free'
      ? {
          id: `s-${i}`,
          layout: 'free',
          blocks: (layout.sample as { blocks: unknown[] }).blocks,
          notes: notes(`the ${layout.id} slide`),
        }
      : {
          id: `s-${i}`,
          layout: layout.id,
          props: layout.sample,
          notes: notes(`the ${layout.id} slide`),
        }
  );
}

const only = (issues: DeckQualityIssue[], rule: DeckQualityRuleId) =>
  issues.filter((issue) => issue.rule === rule);

function slide(id: string, layout: string, props: unknown, extra: Record<string, unknown> = {}) {
  return { id, layout, props, notes: notes(id), ...extra };
}

function free(id: string, blocks: unknown[], extra: Record<string, unknown> = {}) {
  return { id, layout: 'free', blocks, notes: notes(id), ...extra };
}

const TITLE = { title: 'Quarterly review', subtitle: 'Fictional data' };
const STAT = { number: '87%', label: 'of teams kept the habit' };
const SPLIT = {
  left: { heading: 'Before', body: 'Manual updates.' },
  right: { heading: 'After', body: 'Async check-ins.' },
};

describe('deck quality: thresholds as data', () => {
  it('shares the canvas text minimums and the documented limits', () => {
    expect(DECK_QUALITY.minBodyPx).toBe(24);
    expect(DECK_QUALITY.minLabelPx).toBe(18);
    expect(DECK_QUALITY.minBodyPx).toBe(DECK_TEXT_MINIMUMS.bodyPx);
    expect(DECK_QUALITY.minLabelPx).toBe(DECK_TEXT_MINIMUMS.labelPx);
    expect(DECK_QUALITY.minNotesLength).toBe(40);
    expect(DECK_QUALITY.maxLayoutRun).toBe(2);
    expect(Object.keys(DECK_QUALITY.maxWords).sort()).toEqual([
      'diagram',
      'idea',
      'punch',
      'story',
    ]);
    expect(DECK_QUALITY.maxWords.punch).toBeLessThan(DECK_QUALITY.maxWords.idea);
  });

  it('lists every rule once with a severity and where it is checked', () => {
    const ids = DECK_QUALITY_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of DECK_QUALITY_RULES) {
      expect(['error', 'warning']).toContain(rule.severity);
      expect(['static', 'rendered']).toContain(rule.check);
      expect(rule.description.length).toBeGreaterThan(10);
    }
    expect(
      DECK_QUALITY_RULES.filter((rule) => rule.check === 'rendered')
        .map((rule) => rule.id)
        .sort()
    ).toEqual(['font-too-small', 'image-failed', 'low-contrast', 'overflow']);
  });

  it('formats JSONPaths like the deck schema', () => {
    expect(deckJsonPath(['slides', 2, 'props', 'image', 'alt'])).toBe(
      '$.slides[2].props.image.alt'
    );
    expect(deckJsonPath(['slides', 0, 'props', 'two words'])).toBe(
      '$.slides[0].props["two words"]'
    );
  });
});

describe('deck quality: the good fixture passes', () => {
  it('a deck of every catalog layout sample has no issues', () => {
    const report = checkDeckStatic(deck(goodSlides()));
    expect(report.issues).toEqual([]);
    expect(report).toMatchObject({ ok: true, errors: 0, warnings: 0 });
  });

  it('is deterministic and does not mutate the deck', () => {
    const input = deck([
      slide('a', 'two-column-split', SPLIT),
      slide('b', 'two-column-split', SPLIT),
      slide('c', 'two-column-split', SPLIT, { notes: 'short' }),
    ]);
    const frozen = structuredClone(input);
    const first = checkDeckStatic(input);
    expect(checkDeckStatic(input)).toEqual(first);
    expect(input).toEqual(frozen);
  });
});

describe('deck quality: each rule flags its bad fixture at the right path', () => {
  it('unknown-layout (error)', () => {
    schemaRejectsAt([slide('a', 'mystery-layout', {})], '$.slides[0].layout');
    const report = checkDeckStatic(rawDeck([slide('a', 'mystery-layout', {})]));
    expect(only(report.issues, 'unknown-layout')).toMatchObject([
      { severity: 'error', slideId: 'a', jsonPath: '$.slides[0].layout' },
    ]);
    expect(report.ok).toBe(false);
  });

  it('custom-slide (warning): runs only in a generated deck, and its data is never read as props', () => {
    const deck = rawDeck([
      {
        id: 'pricing',
        layout: 'custom',
        props: { component: 'pricing-configurator', data: { seats: 10, plan: { step: 'x' } } },
        notes: 'Walk through the configurator: change the seats and watch the total.',
      },
    ]);
    const report = checkDeckStatic(deck);
    expect(only(report.issues, 'custom-slide')).toMatchObject([
      { severity: 'warning', slideId: 'pricing', jsonPath: '$.slides[0].props.component' },
    ]);
    // Not an unknown catalog layout, and its data is the component's own.
    expect(only(report.issues, 'unknown-layout')).toEqual([]);
    expect(only(report.issues, 'layout-props')).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('layout-props (error): missing fields and over-limit arrays', () => {
    schemaRejectsAt(
      [slide('stat', 'big-stat', { label: 'no number' })],
      '$.slides[0].props.number'
    );
    const report = checkDeckStatic(
      rawDeck([
        slide('stat', 'big-stat', { label: 'no number' }),
        slide('steps', 'process-steps', {
          steps: Array.from({ length: 6 }, (_, i) => ({ title: `Step ${i + 1}` })),
        }),
      ])
    );
    const paths = only(report.issues, 'layout-props').map((issue) => issue.jsonPath);
    expect(paths).toContain('$.slides[0].props.number');
    expect(paths).toContain('$.slides[1].props.steps');
    expect(only(report.issues, 'layout-props').every((issue) => issue.severity === 'error')).toBe(
      true
    );
  });

  it('image-alt and image-size (errors) in layout props', () => {
    const image = (over: Record<string, unknown>, drop: string[] = []) => {
      const img: Record<string, unknown> = {
        src: 'assets/a.webp',
        alt: 'A chart',
        width: 640,
        height: 480,
        ...over,
      };
      for (const key of drop) delete img[key];
      return { image: img, body: 'Body text.' };
    };
    const report = checkDeckStatic(
      deck([
        slide('no-alt', 'image-left', image({ alt: '  ' })),
        slide('no-size', 'image-right', image({}, ['width', 'height'])),
        slide('ok', 'image-centered', {
          image: { src: 'assets/b.webp', alt: 'Fine', width: 10, height: 10 },
        }),
      ])
    );
    expect(only(report.issues, 'image-alt')).toMatchObject([
      { severity: 'error', jsonPath: '$.slides[0].props.image.alt' },
    ]);
    expect(only(report.issues, 'image-size')).toMatchObject([
      { severity: 'error', jsonPath: '$.slides[1].props.image' },
    ]);
  });

  it('step-order (error): a fragment revealing before content above it', () => {
    const report = checkDeckStatic(
      deck([
        free('flat', [
          { type: 'text', markdown: 'First', step: 2 },
          { type: 'text', markdown: 'Second', step: 1 },
        ]),
        free('nested', [
          {
            type: 'columns',
            columns: [
              [{ type: 'text', markdown: 'Left', step: 3 }],
              [{ type: 'text', markdown: 'Right', step: 1 }],
            ],
          },
        ]),
        free('ordered', [
          { type: 'text', markdown: 'One', step: 1 },
          { type: 'text', markdown: 'Same', step: 1 },
          { type: 'text', markdown: 'Two', step: 2 },
        ]),
      ])
    );
    expect(only(report.issues, 'step-order')).toMatchObject([
      { severity: 'error', slideId: 'flat', jsonPath: '$.slides[0].blocks[1].step' },
      {
        severity: 'error',
        slideId: 'nested',
        jsonPath: '$.slides[1].blocks[0].columns[1][0].step',
      },
    ]);
    expect(only(report.issues, 'step-order')[0]?.message).toMatch(
      /\$\.slides\[0\]\.blocks\[0\]\.step \(step 2\)/
    );
  });

  it('empty-steps (warning): more step labels than fragments', () => {
    const report = checkDeckStatic(
      deck([
        free('labels', [{ type: 'text', markdown: 'One', step: 1 }], {
          steps: ['First', 'Second', 'Third'],
        }),
      ])
    );
    expect(only(report.issues, 'empty-steps')).toMatchObject([
      { severity: 'warning', jsonPath: '$.slides[0].steps[1]' },
    ]);
  });

  it('notes-missing (warning): absent or under 40 characters', () => {
    const report = checkDeckStatic(
      deck([
        { id: 'none', layout: 'big-stat', props: STAT },
        slide('short', 'title-hero', TITLE, { notes: 'Too short.' }),
      ])
    );
    expect(only(report.issues, 'notes-missing')).toMatchObject([
      {
        severity: 'warning',
        jsonPath: '$.slides[0].notes',
        message: expect.stringMatching(/Add speaker notes/),
      },
      {
        severity: 'warning',
        jsonPath: '$.slides[1].notes',
        message: expect.stringMatching(/10 characters/),
      },
    ]);
  });

  it('notes-duplicate and notes-boilerplate (warnings)', () => {
    const repeated = 'Explain the metric, where it comes from, and why it moved this quarter.';
    const report = checkDeckStatic(
      deck([
        slide('a', 'big-stat', STAT, { notes: repeated }),
        slide('b', 'title-hero', TITLE, { notes: repeated.toUpperCase().replace(/,/g, ';') }),
        slide('c', 'two-column-split', SPLIT, {
          notes: "Don't read the slide, the audience can read it themselves.",
        }),
      ])
    );
    expect(only(report.issues, 'notes-duplicate')).toMatchObject([
      {
        severity: 'warning',
        jsonPath: '$.slides[1].notes',
        message: expect.stringMatching(/slide "a"/),
      },
    ]);
    expect(only(report.issues, 'notes-boilerplate')).toMatchObject([
      { severity: 'warning', jsonPath: '$.slides[2].notes' },
    ]);
  });

  it('layout-repetition (warning): a third identical layout in a row, ignoring hidden slides', () => {
    const report = checkDeckStatic(
      deck([
        slide('a', 'two-column-split', SPLIT),
        slide('b', 'two-column-split', SPLIT),
        slide('c', 'two-column-split', SPLIT),
        slide('d', 'two-column-split', SPLIT),
        slide('e', 'big-stat', STAT),
        slide('f', 'big-stat', STAT),
        slide('hidden', 'big-stat', STAT, { hidden: true }),
        slide('g', 'title-hero', TITLE),
      ])
    );
    expect(only(report.issues, 'layout-repetition')).toMatchObject([
      {
        severity: 'warning',
        jsonPath: '$.slides[2].layout',
        message: expect.stringMatching(/^3 slides in a row/),
      },
      {
        severity: 'warning',
        jsonPath: '$.slides[3].layout',
        message: expect.stringMatching(/^4 slides in a row/),
      },
    ]);
  });

  it('too-many-words (warning): by the layout pacing, not counting code or alt text', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
    const report = checkDeckStatic(
      deck([
        slide('punch', 'big-stat', { number: '87%', label: many(20) }),
        free('free', [{ type: 'text', markdown: many(70) }]),
        free('code', [
          { type: 'heading', text: 'Code' },
          { type: 'code', lang: 'ts', code: many(200) },
          {
            type: 'image',
            src: 'assets/a.webp',
            alt: many(30),
            width: 10,
            height: 10,
            caption: 'A caption',
          },
        ]),
        slide('idea', 'two-column-split', {
          left: { body: many(20) },
          right: { body: many(20) },
        }),
      ])
    );
    expect(only(report.issues, 'too-many-words')).toMatchObject([
      {
        severity: 'warning',
        jsonPath: '$.slides[0].props',
        message: expect.stringMatching(/21 words; a punch slide holds at most 15/),
      },
      {
        severity: 'warning',
        jsonPath: '$.slides[1].blocks',
        message: expect.stringMatching(/70 words; a diagram slide holds at most 60/),
      },
    ]);
  });

  it('checks hidden slides for structure but not for notes, words or repetition', () => {
    const report = checkDeckStatic(
      rawDeck([
        { id: 'h1', layout: 'mystery', props: {}, hidden: true },
        {
          id: 'h2',
          layout: 'free',
          blocks: [
            {
              type: 'text',
              markdown: 'a b c d e f g h i j k l m n o p q r s t u v w x y z '.repeat(4),
            },
          ],
          hidden: true,
        },
      ])
    );
    expect(report.issues.map((issue) => issue.rule)).toEqual(['unknown-layout']);
  });

  it('every static rule has a bad fixture above', () => {
    const covered = new Set<DeckQualityRuleId>([
      'unknown-layout',
      'layout-props',
      'custom-slide',
      'image-alt',
      'image-size',
      'step-order',
      'empty-steps',
      'notes-missing',
      'notes-duplicate',
      'notes-boilerplate',
      'layout-repetition',
      'too-many-words',
    ]);
    const statics = DECK_QUALITY_RULES.filter((rule) => rule.check === 'static').map(
      (rule) => rule.id
    );
    expect([...covered].sort()).toEqual([...statics].sort());
  });

  it('counts errors and warnings and keeps ok true with warnings only', () => {
    const report = checkDeckStatic(deck([slide('a', 'big-stat', STAT, { notes: 'short' })]));
    expect(report).toMatchObject({ ok: true, errors: 0, warnings: 1 });
    const failing = checkDeckStatic(rawDeck([slide('a', 'nope', {}, { notes: 'short' })]));
    expect(failing).toMatchObject({ ok: false, errors: 1, warnings: 1 });
  });
});
