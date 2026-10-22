import { describe, expect, it } from 'vitest';
import { applyJsonPatch, JsonPatchSchema } from '../../blueprint/src/patch.ts';
import { DECK_LAYOUTS } from '../src/layouts/index.ts';
import {
  applyDeckEdits,
  applyDeckPatch,
  compatibleLayouts,
  DeckPatchError,
  type DeckStudioEdits,
  deckEditsToPatch,
  deckStudioOptions,
  formatPointer,
  parsePointer,
} from '../src/patch/index.ts';
import { type Deck, DeckSchema } from '../src/schema/index.ts';

const sample = (id: string) =>
  structuredClone(DECK_LAYOUTS.find((layout) => layout.id === id)?.sample);

/** A fictional source deck: five catalog slides and a free one. */
const SOURCE: Deck = DeckSchema.parse({
  style: { theme: 'ocean', aspect: '16:9', progress: 'bottom' },
  slides: [
    { id: 'title', layout: 'title-hero', props: sample('title-hero') },
    { id: 'photo', layout: 'image-left', props: sample('image-left'), background: 'solid-surface' },
    { id: 'quote', layout: 'quote', props: sample('quote'), transition: 'zoom' },
    { id: 'stat', layout: 'big-stat', props: sample('big-stat'), hidden: true },
    { id: 'notes', layout: 'free', blocks: [{ type: 'text', markdown: 'Speaker aside.' }] },
  ],
});

const EDITS: DeckStudioEdits = {
  style: {
    theme: 'emerald',
    fontPair: 'humanist',
    aspect: '4:3',
    motion: 'subtle',
    background: 'gradient-dusk',
    slideNumbers: false,
    progress: 'top',
  },
  slides: {
    photo: { layout: 'image-right', background: null, transition: 'fade', hidden: true },
    quote: { transition: null, background: 'pattern-dots' },
    stat: { hidden: false },
    notes: { background: 'solid-inverse', layout: 'quote' },
  },
};

describe('deck studio patch', () => {
  it('applies cleanly to the source and equals the previewed deck (AC)', () => {
    const preview = applyDeckEdits(SOURCE, EDITS);
    expect(preview.ok, JSON.stringify(preview)).toBe(true);
    if (!preview.ok) return;

    // The patch is valid RFC 6902 for the blueprint tooling (`quick iterate`).
    expect(JsonPatchSchema.safeParse(preview.patch).success).toBe(true);

    // Applied to the source JSON by an independent applier, it gives the preview.
    const viaBlueprint = applyJsonPatch(JSON.parse(JSON.stringify(SOURCE)), preview.patch);
    expect(DeckSchema.parse(viaBlueprint)).toEqual(preview.deck);
    expect(DeckSchema.parse(applyDeckPatch(SOURCE, preview.patch))).toEqual(preview.deck);

    expect(preview.deck.style).toMatchObject({
      theme: 'emerald',
      fontPair: 'humanist',
      aspect: '4:3',
      motion: 'subtle',
      background: 'gradient-dusk',
      slideNumbers: false,
      progress: 'top',
    });
    const byId = Object.fromEntries(preview.deck.slides.map((slide) => [slide.id, slide]));
    expect(byId.photo).toMatchObject({ layout: 'image-right', transition: 'fade', hidden: true });
    expect(byId.photo).not.toHaveProperty('background');
    expect(byId.quote).toMatchObject({ background: 'pattern-dots' });
    expect(byId.quote).not.toHaveProperty('transition');
    expect(byId.stat).not.toHaveProperty('hidden');
    // A free slide keeps its layout; its background still changes.
    expect(byId.notes).toMatchObject({ layout: 'free', background: 'solid-inverse' });
    // The source is never mutated.
    expect(SOURCE.style.theme).toBe('ocean');
  });

  it('guards every slide edit with a test on its id', () => {
    const patch = deckEditsToPatch(SOURCE, { slides: { photo: { transition: 'none' } } });
    expect(patch).toEqual([
      { op: 'test', path: '/slides/1/id', value: 'photo' },
      { op: 'add', path: '/slides/1/transition', value: 'none' },
    ]);
    const reordered = { ...SOURCE, slides: [...SOURCE.slides].reverse() };
    expect(() => applyDeckPatch(reordered, patch)).toThrow(DeckPatchError);
    expect(() => applyJsonPatch(JSON.parse(JSON.stringify(reordered)), patch)).toThrow();
  });

  it('keeps theme and palette seed exclusive', () => {
    const seeded = applyDeckEdits(SOURCE, { style: { paletteSeed: 0x12ab34 } });
    expect(seeded.ok && seeded.deck.style).toMatchObject({ paletteSeed: 0x12ab34 });
    expect(seeded.ok && seeded.deck.style).not.toHaveProperty('theme');
    const withSeed = seeded.ok ? seeded.deck : SOURCE;
    const themed = applyDeckEdits(withSeed, { style: { theme: 'rose' } });
    expect(themed.ok && themed.deck.style).toMatchObject({ theme: 'rose' });
    expect(themed.ok && themed.deck.style).not.toHaveProperty('paletteSeed');
  });

  it('emits nothing for edits that change nothing', () => {
    expect(
      deckEditsToPatch(SOURCE, {
        style: { theme: 'ocean', progress: 'bottom', motion: null },
        slides: { title: { hidden: false, background: null }, quote: { transition: 'zoom' } },
      })
    ).toEqual([]);
  });

  it('reports edits the schema refuses instead of producing a broken deck', () => {
    const badStyle = applyDeckEdits(SOURCE, { style: { aspect: '21:9' as never } });
    expect(badStyle.ok).toBe(false);
    if (!badStyle.ok)
      expect(badStyle.issues.map((issue) => issue.jsonPath)).toEqual(['$.style.aspect']);
    // A layout whose props schema refuses the slide's content.
    const badLayout = applyDeckEdits(SOURCE, { slides: { quote: { layout: 'big-stat' } } });
    expect(badLayout.ok).toBe(false);
    if (!badLayout.ok) {
      expect(badLayout.issues.map((issue) => issue.jsonPath)).toContain('$.slides[2].props.number');
    }
    expect(() => deckEditsToPatch(SOURCE, { slides: { missing: { hidden: true } } })).toThrow(
      /No slide "missing"/
    );
  });
});

describe('compatible layouts', () => {
  it('offers only layouts whose props schema already accepts the slide', () => {
    const photo = SOURCE.slides[1] as Deck['slides'][number];
    const options = compatibleLayouts(photo);
    expect(options).toEqual(expect.arrayContaining(['image-left', 'image-right']));
    expect(options).not.toContain('big-stat');
    expect(compatibleLayouts(SOURCE.slides[3] as Deck['slides'][number])).toContain('big-stat');
    expect(compatibleLayouts(SOURCE.slides[4] as Deck['slides'][number])).toEqual(['free']);
    for (const slide of SOURCE.slides) {
      expect(compatibleLayouts(slide)).toContain(slide.layout);
    }
  });

  it('lists the choices the panel needs', () => {
    const options = deckStudioOptions();
    expect(options.themes.map((theme) => theme.id)).toEqual(
      expect.arrayContaining(['ocean', 'emerald'])
    );
    expect(options.themes.length).toBeGreaterThanOrEqual(70);
    expect(options.fontPairs.map((pair) => pair.id)).toContain('humanist');
    expect(options.aspects).toEqual(['16:9', '4:3', '9:16', '1:1']);
    expect(options.backgrounds).toContain('gradient-dusk');
  });
});

describe('applyDeckPatch', () => {
  const doc = { a: { 'b/c': 1, list: [1, 2, 3] } };

  it('round-trips RFC 6901 pointers', () => {
    expect(parsePointer('/a/b~1c/~0x')).toEqual(['a', 'b/c', '~x']);
    expect(formatPointer(['a', 'b/c', '~x'])).toBe('/a/b~1c/~0x');
    expect(parsePointer('')).toEqual([]);
    expect(() => parsePointer('a')).toThrow(TypeError);
  });

  it('adds, replaces, removes and tests on objects and arrays', () => {
    const out = applyDeckPatch(doc, [
      { op: 'test', path: '/a/b~1c', value: 1 },
      { op: 'replace', path: '/a/b~1c', value: 2 },
      { op: 'add', path: '/a/list/1', value: 9 },
      { op: 'add', path: '/a/list/-', value: 4 },
      { op: 'remove', path: '/a/list/0' },
      { op: 'add', path: '/a/new', value: { deep: true } },
    ]);
    expect(out).toEqual({ a: { 'b/c': 2, list: [9, 2, 3, 4], new: { deep: true } } });
    expect(doc.a.list).toEqual([1, 2, 3]);
  });

  it('refuses unsafe, missing and malformed targets without half-applying', () => {
    const cases: [string, Parameters<typeof applyDeckPatch>[1]][] = [
      ['unsafe key', [{ op: 'add', path: '/__proto__/polluted', value: 1 }]],
      ['unsafe leaf', [{ op: 'add', path: '/a/constructor', value: 1 }]],
      ['missing parent', [{ op: 'add', path: '/nope/x', value: 1 }]],
      ['replace missing', [{ op: 'replace', path: '/a/zzz', value: 1 }]],
      ['remove missing', [{ op: 'remove', path: '/a/list/7' }]],
      ['bad index', [{ op: 'add', path: '/a/list/01', value: 1 }]],
      ['failed test', [{ op: 'test', path: '/a/b~1c', value: 5 }]],
      ['root', [{ op: 'replace', path: '', value: {} }]],
    ];
    for (const [name, ops] of cases) {
      expect(() => applyDeckPatch(doc, ops), name).toThrow(DeckPatchError);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(() =>
      applyDeckPatch(
        doc,
        Array.from({ length: 1_001 }, () => ({ op: 'test' as const, path: '/a', value: 1 }))
      )
    ).toThrow(/at most 1000/);
  });
});
