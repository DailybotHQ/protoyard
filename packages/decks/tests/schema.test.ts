import { describe, expect, it } from 'vitest';
import { DECK_LIMITS, DeckSchema, DeckStyleSchema, safeParseDeck } from '../src/schema/index.ts';

const catalogSlide = {
  id: 'intro',
  title: 'Introduction',
  layout: 'title-hero',
  props: { title: 'A bounded deck', subtitle: 'Typed slide props' },
};

const validDeck = {
  style: { aspect: '16:9', motion: 'subtle', slideNumbers: true, progress: 'bottom' },
  slides: [catalogSlide],
  outline: {
    title: 'Overview',
    sections: [{ id: 'start', title: 'Start here', slideIds: ['intro'] }],
  },
};

describe('DeckSchema', () => {
  it('accepts catalog and free slides, shared blocks, style and outline grouping', () => {
    const deck = {
      ...validDeck,
      slides: [
        catalogSlide,
        {
          id: 'details',
          layout: 'free',
          blocks: [
            { type: 'heading', text: 'Details', level: 2 },
            { type: 'flow', nodes: [{ id: 'start', label: 'Start' }] },
          ],
          steps: ['First point'],
          notes: 'Speaker notes stay plain text.',
        },
      ],
      outline: {
        title: 'Overview',
        sections: [{ id: 'start', slideIds: ['intro', 'details'] }],
      },
    };

    expect(DeckSchema.safeParse(deck)).toMatchObject({ success: true });
    expect(safeParseDeck(deck)).toMatchObject({ success: true, issues: [] });
  });

  it('rejects duplicate and malformed slide ids with JSON paths', () => {
    const duplicate = safeParseDeck({
      style: {},
      slides: [catalogSlide, { ...catalogSlide, title: 'Duplicate' }],
    });
    expect(duplicate).toMatchObject({ success: false });
    if (duplicate.success) throw new Error('expected duplicate slide id rejection');
    expect(duplicate.issues).toContainEqual(
      expect.objectContaining({ code: 'custom', jsonPath: '$.slides[1].id' })
    );

    const malformed = safeParseDeck({
      style: {},
      slides: [{ ...catalogSlide, id: 'Bad_ID' }],
    });
    expect(malformed).toMatchObject({ success: false });
    if (malformed.success) throw new Error('expected malformed slide id rejection');
    expect(malformed.issues.some((item) => item.jsonPath === '$.slides[0].id')).toBe(true);
  });

  it('rejects unknown keys and invalid style or slide forms', () => {
    expect(
      safeParseDeck({
        ...validDeck,
        extra: true,
      })
    ).toMatchObject({ success: false });
    expect(DeckStyleSchema.safeParse({ color: '#fff' }).success).toBe(false);
    expect(
      DeckSchema.safeParse({
        style: { aspect: 'square' },
        slides: [catalogSlide],
      }).success
    ).toBe(false);
    expect(
      DeckSchema.safeParse({
        style: {},
        slides: [{ id: 'free-slide', layout: 'free', props: {} }],
      }).success
    ).toBe(false);
    expect(
      DeckSchema.safeParse({
        style: {},
        slides: [{ id: 'intro', layout: 'title-hero', props: {}, unknown: 1 }],
      }).success
    ).toBe(false);
    expect(
      safeParseDeck(
        JSON.parse(
          '{"style":{},"slides":[{"id":"intro","layout":"title-hero","props":{"__proto__":{"polluted":true}}}]}'
        )
      )
    ).toMatchObject({ success: false });
  });

  it('caps slides, notes, steps, sections and nested props', () => {
    expect(
      DeckSchema.safeParse({
        style: {},
        slides: Array.from({ length: DECK_LIMITS.slides + 1 }, (_, index) => ({
          ...catalogSlide,
          id: `slide-${index}`,
        })),
      }).success
    ).toBe(false);
    expect(
      DeckSchema.safeParse({
        style: {},
        slides: [{ ...catalogSlide, notes: 'n'.repeat(DECK_LIMITS.slideNotes + 1) }],
      }).success
    ).toBe(false);
    expect(
      DeckSchema.safeParse({
        style: {},
        slides: [
          { ...catalogSlide, steps: Array.from({ length: DECK_LIMITS.steps + 1 }, () => 'step') },
        ],
      }).success
    ).toBe(false);
    expect(
      DeckSchema.safeParse({
        style: {},
        slides: [catalogSlide],
        outline: {
          sections: [{ id: 'missing', slideIds: ['unknown-slide'] }],
        },
      }).success
    ).toBe(false);
    expect(
      DeckSchema.safeParse({
        style: {},
        slides: [
          {
            ...catalogSlide,
            props: { nested: { tooDeep: { no: { yes: { value: { text: 'x' } } } } } },
          },
        ],
      }).success
    ).toBe(false);
    expect(
      DeckSchema.safeParse({
        style: {},
        slides: [
          {
            ...catalogSlide,
            props: Object.fromEntries(
              Array.from({ length: DECK_LIMITS.propsKeys + 1 }, (_, i) => [`key-${i}`, i])
            ),
          },
        ],
      }).success
    ).toBe(false);
  });

  it('rejects duplicate section ids and duplicate or unknown section slide references', () => {
    const result = safeParseDeck({
      style: {},
      slides: [catalogSlide],
      outline: {
        sections: [
          { id: 'part', slideIds: ['intro', 'intro', 'unknown'] },
          { id: 'part', slideIds: ['intro'] },
        ],
      },
    });
    expect(result).toMatchObject({ success: false });
    if (result.success) throw new Error('expected invalid outline rejection');
    expect(result.issues.map((item) => item.jsonPath)).toEqual(
      expect.arrayContaining([
        '$.outline.sections[0].slideIds[1]',
        '$.outline.sections[0].slideIds[2]',
        '$.outline.sections[1].id',
      ])
    );
  });
});
