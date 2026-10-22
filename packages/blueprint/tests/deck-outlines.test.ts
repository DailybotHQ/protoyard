import { afterEach, describe, expect, it, vi } from 'vitest';
// The blueprint does not depend on blocks yet; the test reads the real block schema from source.
import { BlockListSchema } from '../../blocks/src/index.ts';
import {
  chooseDeckOutline,
  DECK_OUTLINE_IDS,
  DECK_OUTLINE_LIMITS,
  DECK_OUTLINES,
  type DeckOutlineResult,
  deckOutlineRange,
  deckTitleFromBrief,
  requestedSlideCount,
  synthesizeDeckOutline,
} from '../src/brief/deck-outlines.ts';
import { safeParseAnyBlueprint } from '../src/kinds/envelope.ts';

function parseAsDeck(result: DeckOutlineResult) {
  return safeParseAnyBlueprint({
    formatVersion: 1,
    name: result.deck.title,
    kind: 'deck',
    deck: { style: { aspect: result.deck.aspect }, slides: result.deck.slides },
  });
}

const allBlocks = (result: DeckOutlineResult) =>
  result.deck.slides.flatMap((slide) => slide.blocks);

afterEach(() => vi.restoreAllMocks());

describe('deck outlines: every template parses as a deck', () => {
  it('ships the eight templates', () => {
    expect([...DECK_OUTLINE_IDS].sort()).toEqual(
      ['launch', 'lesson', 'pitch', 'qbr', 'report', 'status', 'talk', 'training'].sort()
    );
    expect(DECK_OUTLINES.map((t) => t.id)).toEqual([...DECK_OUTLINE_IDS]);
  });

  it.each(DECK_OUTLINE_IDS)('%s parses as a deck at its minimum and maximum size', async (id) => {
    const { min, max } = deckOutlineRange(id);
    expect(min).toBeGreaterThanOrEqual(5);
    expect(max).toBeLessThanOrEqual(DECK_OUTLINE_LIMITS.maxSlides);
    for (const slides of [min, max]) {
      const result = synthesizeDeckOutline('A deck about the Example Harbor rollout.', {
        outline: id,
        slides,
      });
      const parsed = await parseAsDeck(result);
      expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 3))).toBe(true);
      expect(result.deck.slides).toHaveLength(slides);
      // Block ids stay unique across the whole deck, not only per slide.
      expect(BlockListSchema.safeParse(allBlocks(result)).success).toBe(true);
    }
  });

  it('pairs every slide with a plan entry carrying its role and pacing', () => {
    for (const id of DECK_OUTLINE_IDS) {
      const result = synthesizeDeckOutline('', { outline: id, slides: 99 });
      expect(result.plan.map((p) => p.id)).toEqual(result.deck.slides.map((s) => s.id));
      for (const [i, plan] of result.plan.entries()) {
        expect(['punch', 'idea', 'diagram', 'story']).toContain(plan.pacing);
        expect(plan.role.length).toBeGreaterThan(0);
        expect(result.deck.slides[i]?.notes).toContain(plan.purpose);
      }
      expect(result.plan[0]?.role).toBe('title');
    }
  });
});

describe('deck outlines: deterministic', () => {
  it('gives identical slide ids, order, blocks and rationale on repeated runs', () => {
    const briefs = [
      'A pitch deck of twelve slides for investors about Example Harbor.',
      'Quarterly business review for the fictional Northwind team.',
      'A 15-minute talk about async standups at a meetup.',
      'Lesson for students on fractions.',
      '',
    ];
    for (const brief of briefs) {
      const first = synthesizeDeckOutline(brief);
      const second = synthesizeDeckOutline(brief);
      expect(second).toEqual(first);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    }
  });

  it('never reads the clock or a random source', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('no Math.random');
    });
    vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('no Date.now');
    });
    for (const id of DECK_OUTLINE_IDS)
      expect(() => synthesizeDeckOutline('x', { outline: id })).not.toThrow();
  });

  it('keeps core slide ids and template order at every size', () => {
    for (const id of DECK_OUTLINE_IDS) {
      const { min, max } = deckOutlineRange(id);
      const full = synthesizeDeckOutline('', { outline: id, slides: max }).deck.slides.map(
        (s) => s.id
      );
      const core = synthesizeDeckOutline('', { outline: id, slides: min }).deck.slides.map(
        (s) => s.id
      );
      for (let n = min; n <= max; n += 1) {
        const ids = synthesizeDeckOutline('', { outline: id, slides: n }).deck.slides.map(
          (s) => s.id
        );
        for (const coreId of core) expect(ids).toContain(coreId);
        expect(ids).toEqual(full.filter((slideId) => ids.includes(slideId)));
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });
});

describe('deck outlines: choosing a template and a size', () => {
  it.each([
    ['A pitch deck for our seed round investors.', 'pitch'],
    ['QBR for the support team, Q3.', 'qbr'],
    ['Slides for the product launch of the new planner.', 'launch'],
    ['Weekly status update slides for the migration project.', 'status'],
    ['An onboarding workshop for new support agents.', 'training'],
    ['A lesson for students about photosynthesis.', 'lesson'],
    ['Report on the survey results from the fictional pilot.', 'report'],
    ['A keynote for a design conference.', 'talk'],
    ['Slides about gardening.', 'talk'],
  ] as const)('reads %j as %s', (brief, outline) => {
    expect(chooseDeckOutline(brief).id).toBe(outline);
  });

  it('prefers longer cue phrases and falls back to the talk outline', () => {
    expect(chooseDeckOutline('status update deck').id).toBe('status');
    expect(chooseDeckOutline('pitch deck').cues).toContain('pitch deck');
    expect(chooseDeckOutline('purple elephants')).toEqual({ id: 'talk', cues: [] });
    expect(synthesizeDeckOutline('purple elephants').rationale[0]).toMatch(/no outline cue/);
    expect(synthesizeDeckOutline('A pitch deck.', { outline: 'lesson' }).outline).toBe('lesson');
  });

  it.each([
    ['A deck of 12 slides', 12],
    ['twelve slides about tea', 12],
    ['a ten-slide pitch', 10],
    ['a 15-minute talk', 15],
    ['a five min lightning talk', 5],
    ['slides about tea', null],
    ['the slides for Q3', null],
  ] as const)('reads the slide count in %j', (brief, count) => {
    expect(requestedSlideCount(brief)).toBe(count);
  });

  it('clamps the slide count to the template and says so', () => {
    const { min, max } = deckOutlineRange('pitch');
    const many = synthesizeDeckOutline('A pitch deck of 40 slides.');
    expect(many.deck.slides).toHaveLength(max);
    expect(many.requestedSlides).toBe(40);
    expect(many.rationale[1]).toMatch(
      new RegExp(`asked for 40, and this outline supports ${min}–${max}`)
    );
    const few = synthesizeDeckOutline('A pitch deck of 3 slides.');
    expect(few.deck.slides).toHaveLength(min);
    const exact = synthesizeDeckOutline('A pitch deck of 9 slides.');
    expect(exact.deck.slides).toHaveLength(9);
    expect(exact.rationale[1]).toBe('Slides: 9, as asked.');
    const none = synthesizeDeckOutline('A pitch deck.');
    expect(none.deck.slides).toHaveLength(min);
    expect(none.requestedSlides).toBeNull();
    expect(
      synthesizeDeckOutline('A pitch deck of 40 slides.', { slides: 8 }).deck.slides
    ).toHaveLength(8);
  });
});

describe('deck outlines: honest scaffolding', () => {
  const decks = DECK_OUTLINE_IDS.map((id) =>
    synthesizeDeckOutline('A deck about Example Harbor.', { outline: id, slides: 99 })
  );

  it('marks every slide but the agenda as draft content', () => {
    for (const result of decks) {
      for (const slide of result.deck.slides) {
        if (slide.id === 'slide-agenda') continue;
        expect(JSON.stringify(slide.blocks), `${result.outline}/${slide.id}`).toMatch(/Draft/);
      }
      expect(result.rationale.join(' ')).toMatch(
        /No facts, numbers, quotes, names or chart data were invented/
      );
    }
  });

  it('invents no numbers, chart data, links or real-looking names', () => {
    for (const result of decks) {
      for (const block of allBlocks(result)) {
        expect([
          'chart',
          'chart-controls',
          'cta',
          'image',
          'video',
          'calculator',
          'embed-app',
        ]).not.toContain(block.type);
        if (block.type === 'stat') {
          for (const item of block.items as { value: string }[]) expect(item.value).toBe('—');
        }
        if (block.type === 'people') {
          for (const person of block.people as { name: string }[])
            expect(person.name).toMatch(/^Person \d$/);
        }
      }
      // In slide content, digits appear only in structural labels (Step 1, Metric 2, Milestone 3…).
      // Speaker notes may say "about 8 seconds"; that is pacing guidance, not a claim.
      const text = JSON.stringify(allBlocks(result)).replace(
        /\b(?:Step|Metric|Phase|Milestone|Person|Item|Criterion|point|question|choice) ?-?\d\b/gi,
        ''
      );
      expect(text.replace(/"(?:level|columns)":\d/g, '')).not.toMatch(/\d/);
    }
  });

  it('adds interactive checks to lessons and training, and a poll to longer talks', () => {
    const types = (result: DeckOutlineResult) => allBlocks(result).map((block) => block.type);
    expect(types(decks[DECK_OUTLINE_IDS.indexOf('lesson')] as DeckOutlineResult)).toEqual(
      expect.arrayContaining(['quiz', 'poll'])
    );
    expect(types(decks[DECK_OUTLINE_IDS.indexOf('training')] as DeckOutlineResult)).toContain(
      'quiz'
    );
    expect(types(decks[DECK_OUTLINE_IDS.indexOf('talk')] as DeckOutlineResult)).toContain('poll');
  });

  it('builds the agenda from the deck’s own sections', () => {
    const qbr = synthesizeDeckOutline('', { outline: 'qbr' });
    const agenda = qbr.deck.slides.find((slide) => slide.id === 'slide-agenda');
    expect(agenda).toBeDefined();
    const items = (
      (agenda as { blocks: unknown[] }).blocks[1] as { items: { text: string }[] }
    ).items.map((item) => item.text);
    const later = qbr.deck.slides.map((slide) => slide.title);
    for (const item of items) expect(later).toContain(item);
    expect(items.length).toBeLessThanOrEqual(6);
  });
});

describe('deck outlines: titles from the brief', () => {
  it('takes the topic after about/on/for, else the first sentence', () => {
    expect(
      deckTitleFromBrief(
        'A pitch deck of twelve slides about our fictional launch plan for Example Harbor.'
      )
    ).toBe('Our fictional launch plan for Example Harbor');
    expect(deckTitleFromBrief('Lesson on fractions. Keep it short.')).toBe('Fractions');
    expect(deckTitleFromBrief('Team offsite recap')).toBe('Team offsite recap');
    expect(deckTitleFromBrief('', 'Fallback')).toBe('Fallback');
    expect(synthesizeDeckOutline('', { outline: 'qbr' }).deck.title).toBe(
      'Quarterly business review deck'
    );
    expect(synthesizeDeckOutline('x', { title: 'Given title' }).deck.title).toBe('Given title');
  });

  it('bounds titles and strips control and bidi characters', async () => {
    const long = deckTitleFromBrief(`A talk about ${'very '.repeat(40)}long topics.`);
    expect(long.length).toBeLessThanOrEqual(DECK_OUTLINE_LIMITS.titleLength);
    expect(long.endsWith('…')).toBe(true);
    const spoofed = deckTitleFromBrief('A talk about admin\u202eexe\u0007 safety.');
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting they are gone.
    expect(spoofed).not.toMatch(/[\u0000-\u001f\u202a-\u202e]/);
    const result = synthesizeDeckOutline(`A talk about ${'x'.repeat(10_000)}`);
    expect(result.deck.title.length).toBeLessThanOrEqual(80);
    expect((await parseAsDeck(result)).success).toBe(true);
  });
});
