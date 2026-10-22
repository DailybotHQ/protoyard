import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyContentPatch,
  BlueprintPatchError,
  canonicalJson,
  type DeckBlueprint,
  type DocBlueprint,
  deriveKindVariants,
  type PageBlueprint,
  parseAnyBlueprint,
  safeParseAnyBlueprint,
  VARIANT_DECK_TRANSITIONS,
  VARIANT_THEME_PRESETS,
} from '../../src/index.ts';

/**
 * Content-kind variants for `protoyard quick --variants` and content patches
 * for `quick iterate` (T-kinds-quick-kinds). Fixtures are fictional.
 */

const REPO = join(import.meta.dirname, '../../../..');
const load = async <B>(path: string) =>
  (await parseAnyBlueprint(JSON.parse(readFileSync(join(REPO, path), 'utf8')))) as B;
const deckFile = 'packages/blueprint/tests/fixtures/kinds/intro.deck.json';
const AXES = {
  themes: [...VARIANT_THEME_PRESETS, 'nord-frost'],
  fontPairs: ['humanist', 'editorial', 'geometric'],
};

/** Every JSON path whose value differs between two documents. */
function changedPaths(a: unknown, b: unknown, path = ''): string[] {
  if (a === undefined || b === undefined) return a === b ? [] : [path];
  if (canonicalJson(a) === canonicalJson(b)) return [];
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return [path];
  if (Array.isArray(a) || Array.isArray(b)) return [path];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].flatMap((key) =>
    changedPaths(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
      `${path}/${key}`
    )
  );
}

describe('deck variants', () => {
  it('change only the deck style axes, and every variant is a valid deck (AC)', async () => {
    const deck = await load<DeckBlueprint>(deckFile);
    const variants = deriveKindVariants(deck, { count: 8, seed: '7', axes: AXES });
    expect(variants.map((variant) => variant.id)).toEqual([
      'v1',
      'v2',
      'v3',
      'v4',
      'v5',
      'v6',
      'v7',
      'v8',
    ]);
    const allowed = new Set([
      '/deck/style/theme',
      '/deck/style/transition',
      '/deck/style/density',
      '/deck/style/fontPair',
      '/deck/style/paletteSeed',
    ]);
    const jsons = new Set<string>();
    for (const variant of variants) {
      const paths = changedPaths(deck, variant.blueprint);
      expect(paths.length, variant.label).toBeGreaterThan(0);
      for (const path of paths) expect(allowed.has(path), `${variant.label}: ${path}`).toBe(true);
      // Slides, outline, name and brand are untouched.
      expect(variant.blueprint.deck.slides).toEqual(deck.deck.slides);
      expect(variant.blueprint.name).toBe(deck.name);
      expect((await safeParseAnyBlueprint(variant.blueprint)).success, variant.label).toBe(true);
      jsons.add(canonicalJson(variant.blueprint));
      const style = variant.blueprint.deck.style;
      if (variant.changes.transition) {
        expect(VARIANT_DECK_TRANSITIONS).toContain(variant.changes.transition);
        expect(style.transition).toBe(variant.changes.transition);
      }
      if (variant.changes.theme) expect(style.theme).toBe(variant.changes.theme);
      if (variant.changes.fontPair) expect(style.fontPair).toBe(variant.changes.fontPair);
      if (variant.changes.density) expect(style.density).toBe(variant.changes.density);
      expect(variant.label).not.toBe('As written');
    }
    expect(jsons.size).toBe(8);
    expect(jsons.has(canonicalJson(deck))).toBe(false);
  });

  it('are deterministic: the same deck, seed and axes give byte-identical variants (AC)', async () => {
    const deck = await load<DeckBlueprint>(deckFile);
    const a = deriveKindVariants(deck, { count: 5, seed: 'gym', axes: AXES });
    const b = deriveKindVariants(structuredClone(deck), { count: 5, seed: 'gym', axes: AXES });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const other = deriveKindVariants(deck, { count: 5, seed: 'other', axes: AXES });
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(a));
  });

  it('drops a palette seed when it sets a theme, and refuses impossible counts', async () => {
    const deck = await load<DeckBlueprint>(deckFile);
    const seeded = { ...deck, deck: { ...deck.deck, style: { paletteSeed: 1234 } } };
    const [variant] = deriveKindVariants(seeded, {
      count: 1,
      axes: { themes: ['ocean'], transitions: [], densities: [] },
    });
    expect(variant?.blueprint.deck.style).toEqual({ theme: 'ocean' });
    expect(() =>
      deriveKindVariants(deck, {
        count: 3,
        axes: { themes: ['ocean'], transitions: ['fade'], densities: [] },
      })
    ).toThrow(RangeError);
    expect(() => deriveKindVariants(deck, { count: 0 })).toThrow(RangeError);
    expect(() => deriveKindVariants(deck, { count: 9 })).toThrow(RangeError);
  });
});

describe('page and doc variants', () => {
  it('vary only the brand theme and density', async () => {
    for (const path of [
      'blueprints/pages/tidewater-roasters-landing.json',
      'blueprints/docs/northwind-quarterly-report.json',
    ]) {
      const blueprint = await load<PageBlueprint | DocBlueprint>(path);
      const variants = deriveKindVariants(blueprint, { count: 4, seed: '1', axes: AXES });
      for (const variant of variants) {
        for (const changed of changedPaths(blueprint, variant.blueprint)) {
          expect(changed.startsWith('/brand'), `${path} ${changed}`).toBe(true);
        }
        expect(variant.changes.transition).toBeUndefined();
        expect(variant.changes.fontPair).toBeUndefined();
        expect((await safeParseAnyBlueprint(variant.blueprint)).success).toBe(true);
      }
    }
  });
});

describe('applyContentPatch', () => {
  it('applies a patch to a deck and validates it as a document', async () => {
    const deck = await load<DeckBlueprint>(deckFile);
    const { blueprint } = await applyContentPatch(deck, [
      { op: 'add', path: '/deck/style/transition', value: 'fade' },
      { op: 'replace', path: '/name', value: 'Renamed deck' },
    ]);
    expect(blueprint.deck.style.transition).toBe('fade');
    expect(blueprint.name).toBe('Renamed deck');
    expect(deck.deck.style.transition).toBeUndefined();
  });

  it('refuses a kind change, an invalid result and unsafe pointers without changing the input', async () => {
    const deck = await load<DeckBlueprint>(deckFile);
    const before = canonicalJson(deck);
    const fail = async (ops: unknown, code: string) => {
      const error = await applyContentPatch(deck, ops).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(BlueprintPatchError);
      expect((error as BlueprintPatchError).code).toBe(code);
    };
    await fail([{ op: 'replace', path: '/kind', value: 'page' }], 'invalid-result');
    await fail([{ op: 'remove', path: '/kind' }], 'invalid-result');
    await fail([{ op: 'add', path: '/deck/style/transition', value: 'spin' }], 'invalid-result');
    await fail([{ op: 'add', path: '/__proto__/x', value: 1 }], 'unsafe-pointer');
    expect(canonicalJson(deck)).toBe(before);
  });
});
