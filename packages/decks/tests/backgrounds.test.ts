/*
 * Protoyard's background schema, offline media policy and lint. The resolver
 * and its contrast guarantee (a scrim keeps text at 4.5:1 on every preset and
 * media spec, for every library theme in light and dark) are the deck model's
 * (`resolveDeckBackground` in `@texuli/deck/model`) and are tested there.
 */
import { describe, expect, it } from 'vitest';
import type { DeckBackground } from '../src/index.ts';
import {
  checkDeckMediaSrc,
  DECK_BACKGROUND_PRESET_IDS,
  DeckBackgroundSchema,
  toTexuliDeck,
} from '../src/index.ts';
import { checkDeckStatic } from '../src/quality/index.ts';
import { safeParseDeck } from '../src/schema/index.ts';

const MEDIA_SPECS: DeckBackground[] = [
  { kind: 'image', src: 'assets/cover.webp' },
  { kind: 'image-full', src: 'assets/cover.webp', tone: 'light' },
  { kind: 'video', src: 'clips/intro.mp4' },
  { kind: 'video-full', src: 'clips/intro.webm', tone: 'light', overlay: 0.8 },
];

describe('media URL policy', () => {
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  it.each([
    ['assets/cover.webp', 'image'],
    ['./assets/cover.jpg', 'image'],
    ['clips/intro.mp4', 'video'],
    [PNG, 'image'],
    [
      'data:video/webm;base64,GkXfo0AgQoaBAUL3gQFC8oEEQvOBCEKCQAR3ZWJtQoeBAkKFgQIYU4BnQI0VSalmQCgq17FAAw9CQE2AQAZ3aGFtbXlXQUAGd2hhbW15RIlACECPQAAAAAAAFlSua0AxrkAu14EBY8WBAZyBACK1nEADdW5khkAFVl9WUDglhohAA1ZQOIOBAeBABrCBCLqBCB9DtnVAIueBAKNAHIEAAIAwAQCdASoIAAgAAUAmJaQAA3AA/vz0AAA=',
      'video',
    ],
    ['avatar:av-012', 'image'],
  ] as const)('accepts %s as %s', (src, kind) => {
    expect(checkDeckMediaSrc(src, kind)).toMatchObject({ ok: true, src });
  });

  it.each([
    ['https://example.com/a.png', 'image'],
    ['http://example.com/a.png', 'image'],
    ['//cdn.example.com/a.png', 'image'],
    ['javascript:alert(1)', 'image'],
    ['JaVaScRiPt:alert(1)', 'image'],
    [' javascript:alert(1)', 'image'],
    ['vbscript:msgbox(1)', 'image'],
    ['blob:https://example.com/123', 'image'],
    ['file:///etc/passwd', 'image'],
    ['data:text/html;base64,PHNjcmlwdD4=', 'image'],
    ['data:image/svg+xml;base64,PHN2Zz4=', 'image'],
    ['data:image/png,notbase64', 'image'],
    ['data:image/png;base64,iVBOR', 'video'],
    ['data:video/mp4;base64,AAAA', 'image'],
    ['../secrets.png', 'image'],
    ['assets/../../x.png', 'image'],
    ['assets//x.png', 'image'],
    ['/absolute.png', 'image'],
    ['assets\\x.png', 'image'],
    ['assets/logo.svg', 'image'],
    [`assets/x.png${String.fromCharCode(0)}`, 'image'],
    [`assets/${String.fromCharCode(0x202e)}gnp.exe`, 'image'],
    ['avatar:av-012', 'video'],
    ['avatar:../etc', 'image'],
    ['', 'image'],
  ] as const)('rejects %j as %s', (src, kind) => {
    expect(checkDeckMediaSrc(src, kind).ok).toBe(false);
  });

  it('bounds data: URIs and paths', () => {
    expect(checkDeckMediaSrc(`data:image/png;base64,${'A'.repeat(1_500_001)}`, 'image').ok).toBe(
      false
    );
    expect(checkDeckMediaSrc(`assets/${'a'.repeat(600)}.png`, 'image').ok).toBe(false);
    expect(checkDeckMediaSrc(42, 'image').ok).toBe(false);
  });
});

describe('DeckBackgroundSchema', () => {
  it('accepts preset ids and specs', () => {
    for (const id of DECK_BACKGROUND_PRESET_IDS) expect(DeckBackgroundSchema.parse(id)).toBe(id);
    for (const spec of MEDIA_SPECS) expect(DeckBackgroundSchema.safeParse(spec).success).toBe(true);
    expect(
      DeckBackgroundSchema.safeParse({ kind: 'gradient', gradient: 'dusk', angle: 90 }).success
    ).toBe(true);
    expect(DeckBackgroundSchema.safeParse({ kind: 'pattern', pattern: 'grid' }).success).toBe(true);
  });

  it('rejects iframes, unsafe media, unknown keys and an over-strong scrim', () => {
    const bad: unknown[] = [
      'iframe',
      { kind: 'iframe', src: 'https://example.com' },
      { kind: 'image', src: 'https://example.com/a.png' },
      { kind: 'video', src: 'javascript:alert(1)' },
      { kind: 'video', src: 'clips/a.mp4', poster: '//cdn.example.com/p.png' },
      { kind: 'image', src: 'assets/a.png', style: 'background:url(x)' },
      { kind: 'image', src: 'assets/a.png', overlay: 1 },
      { kind: 'solid', token: 'chart1' },
      { kind: 'gradient', gradient: 'rainbow' },
    ];
    for (const value of bad) {
      expect(DeckBackgroundSchema.safeParse(value).success, JSON.stringify(value)).toBe(false);
    }
  });
});

describe('slide backgrounds from older decks', () => {
  // Before media backgrounds, `slide.background` took any slug and an unknown one
  // rendered solid-color with a warning. Such decks (share links, Deck Studio
  // storage, user blueprints) must still open.
  const oldDeck = {
    style: {},
    slides: [
      {
        id: 'intro',
        layout: 'title-hero',
        background: 'gradient-rainbow',
        props: { title: 'Fictional launch' },
      },
      { id: 'known', layout: 'title-hero', background: 'solid-color', props: { title: 'Next' } },
    ],
  };

  it('parses, renders the default and warns in lint', () => {
    const parsed = safeParseDeck(oldDeck);
    expect(parsed.success).toBe(true);
    const deck = parsed.deck as NonNullable<typeof parsed.deck>;
    expect(deck.slides[0]?.background).toBe('gradient-rainbow');

    // The stage paints the deck model's default for it: migration maps it to solid-color.
    expect(toTexuliDeck(deck).slides[0]?.background).toBe('solid-color');

    const unknown = checkDeckStatic(deck).issues.filter(
      (issue) => issue.rule === 'unknown-background'
    );
    expect(unknown).toEqual([
      expect.objectContaining({
        severity: 'warning',
        slideId: 'intro',
        jsonPath: '$.slides[0].background',
      }),
    ]);
  });

  it('still refuses a background that is not a slug', () => {
    expect(
      safeParseDeck({
        ...oldDeck,
        slides: [{ ...oldDeck.slides[0], background: 'url(https://example.com/x.png)' }],
      }).success
    ).toBe(false);
  });
});
