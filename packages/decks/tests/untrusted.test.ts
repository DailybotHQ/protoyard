import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DECK_LAYOUTS,
  DEFAULT_UNTRUSTED_DECK_LIMITS,
  loadUntrustedDeck,
  slideSteps,
  stripHiddenCharacters,
} from '../src/index.ts';
import { safeParseDeck } from '../src/schema/index.ts';

/*
 * Hostile decks: everything is rejected before zod (size, depth, counts,
 * prototype keys, non-JSON data) or by the schema (layout catalog, props,
 * step markers, media and link policy), and nothing is fetched or executed.
 */

const CATALOG = DECK_LAYOUTS.filter((layout) => layout.id !== 'free');
const slide = (
  id: string,
  layout: string,
  props: unknown,
  extra: Record<string, unknown> = {}
) => ({
  id,
  layout,
  props,
  ...extra,
});
const deckOf = (...slides: unknown[]) => ({ style: {}, slides });
const sample = (id: string) =>
  structuredClone(DECK_LAYOUTS.find((l) => l.id === id)?.sample) as Record<string, unknown>;

const quote = (i: number) => slide(`q-${i}`, 'quote', sample('quote'));

const codes = (result: ReturnType<typeof loadUntrustedDeck>) => result.issues.map((i) => i.code);
const paths = (result: ReturnType<typeof loadUntrustedDeck>) =>
  result.issues.map((i) => i.jsonPath);

// Loading a deck never fetches anything: every test runs with a fetch spy.
let fetchSpy = vi.fn();
beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe('the schema enforces the layout catalog', () => {
  it('accepts every catalog layout with its sample props, and a free slide', () => {
    const slides = CATALOG.map((layout) =>
      slide(`s-${layout.id}`, layout.id, structuredClone(layout.sample))
    );
    slides.push({
      id: 'free-one',
      layout: 'free',
      blocks: [{ type: 'text', markdown: 'Hello' }],
    } as never);
    const result = loadUntrustedDeck(JSON.stringify(deckOf(...slides)));
    expect(result.issues).toEqual([]);
    expect(result.success && result.deck.slides).toHaveLength(CATALOG.length + 1);
  });

  it('rejects a layout outside the catalog with a jsonPath', () => {
    const result = loadUntrustedDeck(deckOf(slide('a', 'mystery', {})));
    expect(codes(result)).toEqual(['invalid-deck']);
    expect(paths(result)).toEqual(['$.slides[0].layout']);
    expect(result.issues[0]?.message).toMatch(/Unknown layout "mystery"/);
  });

  it('runs each layout props schema with jsonPaths', () => {
    const steps = sample('process-steps');
    steps.steps = Array.from({ length: 6 }, (_, i) => ({ title: `Step ${i + 1}`, body: 'Body.' }));
    const result = loadUntrustedDeck(
      deckOf(slide('stat', 'big-stat', { label: 'no number' }), slide('p', 'process-steps', steps))
    );
    expect(paths(result)).toEqual(
      expect.arrayContaining(['$.slides[0].props.number', '$.slides[1].props.steps'])
    );
  });

  it('accepts { step, fragment | reveal } markers, keeps them, and steps read them', () => {
    const cards = sample('three-column-cards');
    const items = cards.cards as Record<string, unknown>[];
    items[0] = { ...items[0], step: 1, fragment: 'fade-up' };
    items[1] = { ...items[1], step: 2, reveal: 'grow' };
    items[2] = { ...items[2], step: 3 };
    const result = loadUntrustedDeck(deckOf(slide('cards', 'three-column-cards', cards)));
    expect(result.issues).toEqual([]);
    if (!result.success) return;
    const parsed = result.deck.slides[0];
    expect(
      (parsed as unknown as { props: { cards: { step?: number }[] } }).props.cards.map(
        (c) => c.step
      )
    ).toEqual([1, 2, 3]);
    const counted = slideSteps(parsed as never);
    expect(counted.count).toBe(3);
    expect(counted.steps.map((s) => s.fragments[0]?.effect)).toEqual(['fade-up', 'grow', 'in']);
  });

  it('rejects malformed markers at their paths', () => {
    const bad = (marker: Record<string, unknown>) => {
      const cards = sample('three-column-cards');
      (cards.cards as Record<string, unknown>[])[0] = {
        ...(cards.cards as object[])[0],
        ...marker,
      };
      return loadUntrustedDeck(deckOf(slide('cards', 'three-column-cards', cards)));
    };
    expect(paths(bad({ step: 1.5 }))).toEqual(['$.slides[0].props.cards[0].step']);
    expect(paths(bad({ step: -1 }))).toEqual(['$.slides[0].props.cards[0].step']);
    expect(paths(bad({ step: 1, fragment: 'explode' }))).toEqual([
      '$.slides[0].props.cards[0].fragment',
    ]);
    expect(paths(bad({ step: 1, reveal: 'spin' }))).toEqual(['$.slides[0].props.cards[0].reveal']);
    // Both effects at once is reported on the marker object itself.
    expect(paths(bad({ step: 1, fragment: 'in', reveal: 'fade' }))).toEqual([
      '$.slides[0].props.cards[0]',
    ]);
    // Without a step, `fragment` is plain content, which the strict card schema refuses.
    const stepless = bad({ fragment: 'in' });
    expect(paths(stepless)).toEqual(['$.slides[0].props.cards[0]']);
    expect(stepless.issues[0]?.message).toMatch(/fragment/);
  });
});

describe('media and links in catalog props', () => {
  const imageSlide = (src: string) => {
    const props = sample('image-centered');
    (props.image as Record<string, unknown>).src = src;
    return slide('img', 'image-centered', props);
  };
  const videoSlide = (src: string) => {
    const props = sample('video-centered');
    (props.video as Record<string, unknown>).src = src;
    return slide('vid', 'video-centered', props);
  };
  const ctaSlide = (href: string) => {
    const props = sample('closing-cta');
    (props.cta as Record<string, unknown>).href = href;
    return slide('cta', 'closing-cta', props);
  };

  it.each([
    ['https://example.com/a.png'],
    ['//cdn.example.com/a.png'],
    ['javascript:alert(1)'],
    ['data:text/html;base64,PHNjcmlwdD4='],
    ['data:image/svg+xml;base64,PHN2Zz4='],
    ['../../etc/passwd'],
  ])('rejects image src %j', (src) => {
    const result = loadUntrustedDeck(deckOf(imageSlide(src)));
    expect(paths(result)).toEqual(['$.slides[0].props.image.src']);
  });

  it('checks video sources as videos', () => {
    expect(loadUntrustedDeck(deckOf(videoSlide('clips/a.mp4'))).success).toBe(true);
    expect(paths(loadUntrustedDeck(deckOf(videoSlide('javascript:alert(1)'))))).toEqual([
      '$.slides[0].props.video.src',
    ]);
    expect(paths(loadUntrustedDeck(deckOf(videoSlide('https://example.com/a.mp4'))))).toEqual([
      '$.slides[0].props.video.src',
    ]);
  });

  it.each([
    ['javascript:alert(1)'],
    [' JavaScript:alert(1)'],
    ['//evil.example.com'],
    ['data:text/html,x'],
    ['vbscript:x'],
  ])('rejects link %j', (href) => {
    expect(paths(loadUntrustedDeck(deckOf(ctaSlide(href))))).toEqual([
      '$.slides[0].props.cta.href',
    ]);
  });

  it('accepts safe links', () => {
    for (const href of [
      'https://example.com/signup',
      'mailto:team@example.com',
      '#next',
      'next/page',
    ]) {
      expect(loadUntrustedDeck(deckOf(ctaSlide(href))).success, href).toBe(true);
    }
  });

  it('applies the blocks media policy inside free slides', () => {
    const result = loadUntrustedDeck(
      deckOf({
        id: 'f',
        layout: 'free',
        blocks: [
          { type: 'image', src: 'https://example.com/x.png', alt: 'x', width: 1, height: 1 },
        ],
      })
    );
    expect(result.success).toBe(false);
    expect(paths(result)[0]).toMatch(/^\$\.slides\[0\]\.blocks\[0\]\.src/);
  });
});

describe('caps before the schema', () => {
  it('refuses a 300-slide deck as text and as data', () => {
    const big = deckOf(...Array.from({ length: 300 }, (_, i) => quote(i)));
    for (const input of [big, JSON.stringify(big)]) {
      const result = loadUntrustedDeck(input);
      expect(codes(result)).toEqual(['too-many']);
      expect(paths(result)).toEqual(['$.slides']);
    }
  });

  it('refuses deep nesting without recursing (text and data)', () => {
    const text = `${'['.repeat(100_000)}${']'.repeat(100_000)}`;
    expect(codes(loadUntrustedDeck(text))).toEqual(['too-deep']);
    let nested: unknown = { type: 'text', markdown: 'x' };
    for (let i = 0; i < 200; i++) nested = { type: 'columns', columns: [[nested]] };
    const deep = deckOf({ id: 'f', layout: 'free', blocks: [nested] });
    expect(codes(loadUntrustedDeck(deep))).toEqual(['too-deep']);
    expect(codes(loadUntrustedDeck(JSON.stringify(deep)))).toEqual(['too-deep']);
  });

  it('refuses oversized input and too many block nodes', () => {
    const huge = JSON.stringify(deckOf(quote(1))).replace(
      '"quote"',
      `"quote","pad":"${'x'.repeat(1_100_000)}"`
    );
    expect(codes(loadUntrustedDeck(huge))).toEqual(['too-large']);
    const many = deckOf({
      id: 'f',
      layout: 'free',
      blocks: Array.from({ length: 50 }, () => ({ type: 'text', markdown: 'x' })),
    });
    expect(codes(loadUntrustedDeck(many, { maxBlockNodes: 10 }))).toEqual(['too-many']);
    expect(DEFAULT_UNTRUSTED_DECK_LIMITS.maxSlides).toBe(200);
  });

  it('refuses huge notes through the schema', () => {
    const result = loadUntrustedDeck(
      deckOf(slide('q', 'quote', sample('quote'), { notes: 'n'.repeat(3_000) }))
    );
    expect(codes(result)).toEqual(['invalid-deck']);
    expect(paths(result)).toEqual(['$.slides[0].notes']);
  });
});

describe('no prototype pollution, no code', () => {
  it('rejects __proto__, constructor and prototype keys anywhere', () => {
    const inputs = [
      '{"__proto__":{"polluted":true},"style":{},"slides":[]}',
      `{"style":{},"slides":[{"id":"q","layout":"quote","props":{"quote":"x","constructor":{"prototype":{"polluted":true}}}}]}`,
      `{"style":{"prototype":1},"slides":[]}`,
    ];
    for (const input of inputs) {
      expect(codes(loadUntrustedDeck(input))).toEqual(['unsafe-key']);
      expect(codes(loadUntrustedDeck(JSON.parse(input)))).toEqual(['unsafe-key']);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('never calls getters, and refuses functions, class instances, symbols, NaN and cycles', () => {
    const getter = vi.fn(() => 'boom');
    const withGetter = deckOf(quote(1));
    Object.defineProperty(withGetter, 'evil', { get: getter, enumerable: true });
    expect(codes(loadUntrustedDeck(withGetter))).toEqual(['invalid-input']);
    expect(getter).not.toHaveBeenCalled();

    class Slide {
      id = 'x';
    }
    const cyclic: Record<string, unknown> = deckOf(quote(1));
    cyclic.self = cyclic;
    for (const input of [
      { ...deckOf(quote(1)), run: () => 1 },
      deckOf(new Slide()),
      { ...deckOf(quote(1)), [Symbol('s')]: 1 },
      { ...deckOf(quote(1)), n: Number.NaN },
      cyclic,
      [deckOf(quote(1))],
      'not json',
      42,
    ]) {
      const result = loadUntrustedDeck(input);
      expect(result.success, String(input)).toBe(false);
    }
  });

  it('keeps script-looking strings as inert text and strips hidden characters', () => {
    const rlo = String.fromCharCode(0x202e);
    const props = { ...sample('quote'), quote: `<script>alert(1)</script>${rlo}gnp.exe` };
    const result = loadUntrustedDeck(
      deckOf(slide('q', 'quote', props, { notes: 'Line one\nLine two' }))
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    const parsed = result.deck.slides[0] as unknown as { props: { quote: string }; notes?: string };
    expect(parsed.props.quote).toBe('<script>alert(1)</script>gnp.exe');
    expect(parsed.notes).toBe('Line one\nLine two');
    expect(
      stripHiddenCharacters(`a${String.fromCharCode(0)}b${String.fromCharCode(0x2066)}c\td`)
    ).toBe('abc\td');
  });

  it('agrees with safeParseDeck on valid data', () => {
    const input = deckOf(slide('q', 'quote', sample('quote')));
    const loaded = loadUntrustedDeck(input);
    const parsed = safeParseDeck(input);
    expect(loaded.success && parsed.success && loaded.deck).toEqual(parsed.success && parsed.deck);
  });
});
