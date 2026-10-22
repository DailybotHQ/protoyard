import { describe, expect, it } from 'vitest';
import { slideStepCount } from '../src/motion/steps.ts';
import { compatibleLayouts } from '../src/patch/edits.ts';
import { DECK_LIMITS, isCustomSlide, safeParseDeck } from '../src/schema/index.ts';

/**
 * `layout: "custom"` slides (T-custom-slides): an additive slide kind beside
 * `free`. The schema bounds the component id and data like catalog props; the
 * engine never reads the data as catalog content.
 */

const custom = (props: unknown, extra: Record<string, unknown> = {}) => ({
  style: {},
  slides: [{ id: 'live', layout: 'custom', props, ...extra }],
});

describe('the custom slide schema', () => {
  it('accepts a component id with optional bounded data', () => {
    const parsed = safeParseDeck(
      custom({ component: 'pricing-configurator', data: { seats: 10, plans: [{ id: 'team' }] } })
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(isCustomSlide(parsed.deck.slides[0] as never)).toBe(true);
    expect(safeParseDeck(custom({ component: 'pricing-configurator' })).success).toBe(true);
  });

  it('rejects a bad component id, unknown keys and props beyond the catalog caps', () => {
    for (const props of [
      { component: 'Not A Slug' },
      { component: '' },
      {},
      { component: 'ok', extra: true },
      { component: 'ok', data: 'not an object' },
      { component: 'ok', data: { text: 'x'.repeat(DECK_LIMITS.propsString + 1) } },
      {
        component: 'ok',
        data: Object.fromEntries(
          Array.from({ length: DECK_LIMITS.propsKeys + 1 }, (_, i) => [`k${i}`, i])
        ),
      },
      { component: 'ok', data: { a: { b: { c: { d: { e: { f: 1 } } } } } } },
    ]) {
      expect(safeParseDeck(custom(props)).success, JSON.stringify(props).slice(0, 80)).toBe(false);
    }
  });

  it('applies the deck link and media policies to its data', () => {
    expect(
      safeParseDeck(custom({ component: 'ok', data: { href: 'javascript:alert(1)' } })).success
    ).toBe(false);
    expect(
      safeParseDeck(custom({ component: 'ok', data: { src: 'https://cdn.example/a.png' } })).success
    ).toBe(false);
    expect(
      safeParseDeck(custom({ component: 'ok', data: { href: 'https://example.com/pricing' } }))
        .success
    ).toBe(true);
  });

  it('keeps `custom` out of the catalog layout ids, so existing decks validate as before', () => {
    // A catalog-shaped slide named `custom` is not a catalog slide.
    expect(safeParseDeck(custom({ title: 'Hello' })).success).toBe(false);
    expect(
      safeParseDeck({
        style: {},
        slides: [{ id: 'a', layout: 'title-hero', props: { title: 'Still fine' } }],
      }).success
    ).toBe(true);
  });
});

describe('the engine around custom slides', () => {
  it('takes reveal steps from the `steps` labels only, never from the data', () => {
    const parsed = safeParseDeck(
      custom(
        { component: 'ok', data: { item: { step: 3 }, other: { step: 7 } } },
        { steps: ['first', 'second'] }
      )
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(slideStepCount(parsed.deck.slides[0] as never)).toBe(2);
  });

  it('never offers to switch a custom slide to a catalog layout', () => {
    const parsed = safeParseDeck(custom({ component: 'ok' }));
    if (!parsed.success) throw new Error('fixture');
    expect(compatibleLayouts(parsed.deck.slides[0] as never)).toEqual(['custom']);
  });
});
