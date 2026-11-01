// @vitest-environment node
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BLUEPRINT_FORMAT_VERSION,
  BLUEPRINT_MOTION_LEVELS,
  blueprintIdentity,
  blueprintJsonSchema,
  blueprintMotionLevel,
  deckWithMotionCeiling,
  isBlueprintMotionLevel,
  lowerMotionLevel,
  parseAnyBlueprint,
  safeParseAnyBlueprint,
  safeParseBlueprint,
} from '../src/index.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (path: string) =>
  JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as Record<string, unknown>;
const catalog = [
  ...readdirSync(join(ROOT, 'blueprints'))
    .filter((name) => name.endsWith('.json'))
    .map((name) => `blueprints/${name}`),
  ...['decks', 'pages', 'docs'].flatMap((dir) =>
    readdirSync(join(ROOT, 'blueprints', dir))
      .filter((name) => name.endsWith('.json'))
      .map((name) => `blueprints/${dir}/${name}`)
  ),
].sort();

describe('blueprint motion vocabulary', () => {
  it('is the closed texuli/motion level list, highest first', () => {
    expect(BLUEPRINT_MOTION_LEVELS).toEqual(['full', 'subtle', 'none']);
    expect(isBlueprintMotionLevel('subtle')).toBe(true);
    expect(isBlueprintMotionLevel('expressive')).toBe(false);
    expect(isBlueprintMotionLevel(undefined)).toBe(false);
  });

  it('stays formatVersion 1: motion is optional and additive, no migration', () => {
    expect(BLUEPRINT_FORMAT_VERSION).toBe(1);
  });

  it('accepts every level on apps and content kinds', async () => {
    const app = read('blueprints/crm.json');
    const deck = read('blueprints/decks/example.json');
    for (const level of BLUEPRINT_MOTION_LEVELS) {
      const parsedApp = safeParseBlueprint({ ...app, motion: { level } });
      expect(parsedApp.success, level).toBe(true);
      if (parsedApp.success) expect(blueprintMotionLevel(parsedApp.data)).toBe(level);
      const parsedDeck = await parseAnyBlueprint({ ...deck, motion: { level } });
      expect(blueprintMotionLevel(parsedDeck)).toBe(level);
    }
  });

  it('refuses unknown levels, extra keys, CSS and milliseconds', async () => {
    const app = read('blueprints/crm.json');
    for (const motion of [
      { level: 'expressive' },
      { level: 'full', duration: 300 },
      { level: 'full', keyframes: 'from{opacity:0}' },
      {},
      'full',
      null,
    ]) {
      expect(safeParseBlueprint({ ...app, motion }).success, JSON.stringify(motion)).toBe(false);
    }
    const page = read('blueprints/pages/tidewater-roasters-landing.json');
    const refused = await safeParseAnyBlueprint({ ...page, motion: { level: 'fast' } });
    expect(refused.success).toBe(false);
    if (!refused.success) expect(refused.error.issues[0]?.path).toEqual(['motion', 'level']);
  });

  it('adds no key to a blueprint that declares none (every catalog blueprint parses as before)', async () => {
    expect(catalog.length).toBeGreaterThan(40);
    for (const path of catalog) {
      const raw = read(path);
      const parsed = await parseAnyBlueprint(raw);
      if (raw.motion === undefined) {
        expect('motion' in parsed, path).toBe(false);
        expect(blueprintMotionLevel(parsed), path).toBe('full');
      }
    }
  });

  it('is part of the content identity only when declared', async () => {
    const deck = read('blueprints/decks/example.json');
    const base = await blueprintIdentity(await parseAnyBlueprint(deck));
    const same = await blueprintIdentity(await parseAnyBlueprint({ ...deck, motion: undefined }));
    const subtle = await blueprintIdentity(
      await parseAnyBlueprint({ ...deck, motion: { level: 'subtle' } })
    );
    expect(same.sha256).toBe(base.sha256);
    expect(subtle.sha256).not.toBe(base.sha256);
  });

  it('is published in the JSON Schema with its closed levels', async () => {
    const schema = (await blueprintJsonSchema()) as {
      oneOf: {
        properties: Record<
          string,
          { properties?: { level?: { enum?: string[] } }; additionalProperties?: unknown }
        >;
      }[];
    };
    for (const branch of schema.oneOf) {
      const motion = branch.properties.motion;
      expect(motion?.properties?.level?.enum).toEqual(['full', 'subtle', 'none']);
      expect(motion?.additionalProperties).toBe(false);
    }
  });
});

describe('motion levels as a ceiling', () => {
  it('lowers, never raises', () => {
    expect(lowerMotionLevel('full', 'subtle')).toBe('subtle');
    expect(lowerMotionLevel('subtle', 'full')).toBe('subtle');
    expect(lowerMotionLevel('none', 'full')).toBe('none');
    expect(lowerMotionLevel('subtle', 'none')).toBe('none');
    expect(lowerMotionLevel('full', 'full')).toBe('full');
  });

  it('caps a deck style motion and keeps the same object when nothing changes', () => {
    const deck = { slides: [], style: { motion: 'subtle' as const, radius: 'round' } };
    expect(deckWithMotionCeiling(deck, 'full')).toBe(deck);
    expect(deckWithMotionCeiling(deck, 'subtle')).toBe(deck);
    const capped = deckWithMotionCeiling(deck, 'none');
    expect(capped).not.toBe(deck);
    expect(capped.style).toEqual({ motion: 'none', radius: 'round' });
    expect(deck.style.motion).toBe('subtle');
    const plain = { slides: [] } as {
      slides: never[];
      style?: { motion?: 'full' | 'subtle' | 'none' };
    };
    expect(deckWithMotionCeiling(plain, 'full')).toBe(plain);
    expect(deckWithMotionCeiling(plain, 'subtle').style).toEqual({ motion: 'subtle' });
  });
});
