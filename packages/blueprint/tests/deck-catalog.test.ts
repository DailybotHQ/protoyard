import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @protoyard/blocks is not a runtime dep of every blueprint import path; load
// by relative source so free-slide blocks are checked against the real contract.
import { forEachBlock, safeParseBlocks } from '../../blocks/src/index.ts';
import { lintDeckStructure } from '../src/authoring/deck-lint.ts';
import { safeParseAnyBlueprint } from '../src/index.ts';

/**
 * Kind-specific deck catalog (`blueprints/decks/`). Kept out of the flat
 * `blueprints/*.json` app marketplace scan in `catalog.test.ts`.
 */

const ROOT = join(import.meta.dirname, '../../..');
const DECKS_DIR = join(ROOT, 'blueprints/decks');

const APP_ONLY_KEYS = [
  'entities',
  'roles',
  'screens',
  'layout',
  'archetype',
  'scenarios',
  'relations',
  'workflows',
  'notifications',
  'validation',
] as const;

interface Example {
  file: string;
  raw: Record<string, unknown>;
}

function loadExamples(): Example[] {
  return readdirSync(DECKS_DIR)
    .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
    .sort()
    .map((file) => ({
      file,
      raw: JSON.parse(readFileSync(join(DECKS_DIR, file), 'utf8')) as Record<string, unknown>,
    }));
}

const EXAMPLES = loadExamples();

type DeckBody = {
  slides: Array<{
    id: string;
    layout: string;
    blocks?: unknown[];
    props?: unknown;
  }>;
  outline?: { sections: Array<{ id: string; slideIds: string[] }> };
};

function deckOf(example: Example): DeckBody {
  return example.raw.deck as DeckBody;
}

function strings(value: unknown, path = '$'): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((item, i) => strings(item, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => strings(item, `${path}.${key}`));
  }
  return [];
}

describe('deck example catalog', () => {
  it('ships several distinct fictional decks outside the app catalog', () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(4);
    const names = new Set(EXAMPLES.map((example) => example.file));
    expect(names.has('harbor-ops-pitch.json')).toBe(true);
    expect(names.has('northwind-qbr.json')).toBe(true);
    expect(names.has('lumen-launch.json')).toBe(true);
    expect(names.has('cedar-training.json')).toBe(true);
  });

  it('uses kind deck without app-only keys', () => {
    for (const example of EXAMPLES) {
      expect(example.raw.kind, example.file).toBe('deck');
      expect(example.raw).toHaveProperty('deck');
      expect(example.raw).toHaveProperty('formatVersion', 1);
      expect(example.raw).toHaveProperty('name');
      for (const key of APP_ONLY_KEYS) {
        expect(example.raw, `${example.file} must omit ${key}`).not.toHaveProperty(key);
      }
    }
  });

  it('parses every example through the kind envelope', async () => {
    for (const example of EXAMPLES) {
      const result = await safeParseAnyBlueprint(example.raw);
      expect(
        result.success,
        `${example.file}: ${JSON.stringify(result.error?.issues?.slice(0, 5))}`
      ).toBe(true);
      if (!result.success) continue;
      expect(result.data).toMatchObject({ kind: 'deck' });
    }
  });

  it('lints cleanly with unique slide ids and a complete outline', () => {
    for (const example of EXAMPLES) {
      const body = deckOf(example);
      const ids = body.slides.map((slide) => slide.id);
      expect(new Set(ids).size, example.file).toBe(ids.length);

      const lint = lintDeckStructure(body);
      expect(lint.valid, `${example.file}: ${JSON.stringify(lint.diagnostics)}`).toBe(true);
      expect(lint.diagnostics).toEqual([]);

      const covered = new Set(body.outline?.sections.flatMap((section) => section.slideIds) ?? []);
      for (const id of ids) {
        expect(covered.has(id), `${example.file} outline misses ${id}`).toBe(true);
      }
    }
  });

  it('covers chart, comparison, process and interactive free slides across the catalog', () => {
    const layouts = new Set(
      EXAMPLES.flatMap((example) => deckOf(example).slides.map((slide) => slide.layout))
    );
    expect(layouts.has('chart')).toBe(true);
    expect(layouts.has('comparison-table')).toBe(true);
    expect(layouts.has('process-steps')).toBe(true);
    expect(layouts.has('free')).toBe(true);

    const freeTypes = new Set<string>();
    for (const example of EXAMPLES) {
      for (const slide of deckOf(example).slides) {
        if (slide.layout !== 'free' || !slide.blocks) continue;
        const parsed = safeParseBlocks(slide.blocks);
        expect(parsed.success, `${example.file} free blocks`).toBe(true);
        if (!parsed.success) continue;
        forEachBlock(parsed.data, (block) => {
          freeTypes.add(block.type);
        });
      }
    }
    expect([...freeTypes].some((type) => ['poll', 'quiz', 'counter'].includes(type))).toBe(true);
  });

  it('keeps copy fictional (example.com / placeholder framing)', () => {
    const banned =
      /\b(gmail\.com|yahoo\.com|hotmail\.com|real customer|production metrics|live revenue)\b/i;
    for (const example of EXAMPLES) {
      for (const [path, text] of strings(example.raw)) {
        expect(banned.test(text), `${example.file} ${path}`).toBe(false);
      }
      const blob = JSON.stringify(example.raw).toLowerCase();
      expect(
        blob.includes('fictional') ||
          blob.includes('placeholder') ||
          blob.includes('sample') ||
          blob.includes('example.com') ||
          blob.includes('simulated'),
        example.file
      ).toBe(true);
    }
  });
});
