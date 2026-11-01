// @vitest-environment node
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  type AnyBlueprint,
  blueprintKind,
  CONTENT_KINDS,
  type ContentKind,
  detectBlueprintKind,
  parseAnyBlueprint,
  parseBlueprint,
  safeParseAnyBlueprint,
  safeParseBlueprint,
} from '../../src/index.ts';
import {
  parseDeckBlueprint,
  parseDocBlueprint,
  parsePageBlueprint,
} from '../../src/kinds/parse.ts';
import { withKindBodySchemaForTesting } from '../../src/kinds/testing.ts';

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const CATALOG = join(ROOT, 'blueprints');
const catalog = readdirSync(CATALOG)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => [name, JSON.parse(readFileSync(join(CATALOG, name), 'utf8')) as object] as const);

const minimalApp = JSON.parse(readFileSync(join(CATALOG, 'crm.json'), 'utf8')) as {
  entities: unknown[];
} & Record<string, unknown>;

/** Stand-ins for the engine body schemas, which later tasks wire in. */
const placeholderBody = z.strictObject({ title: z.string().min(1).max(80) });

const content = (kind: ContentKind, extra: Record<string, unknown> = {}) => ({
  formatVersion: 1,
  name: `A ${kind}`,
  description: `A minimal ${kind}.`,
  tags: ['example'],
  kind,
  [kind]: { title: 'Hello' },
  ...extra,
});

describe('detectBlueprintKind', () => {
  it('explains unknown and non-string kinds', () => {
    const unknown = detectBlueprintKind({ kind: 'quiz' });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.message).toMatch(/"quiz" needs a newer Protoyard/);
    const numeric = detectBlueprintKind({ kind: 3 });
    expect(numeric.ok).toBe(false);
    if (!numeric.ok) expect(numeric.message).toMatch(/must be a string/);
  });
});

describe('the shipped catalog', () => {
  it('parses every deck, page and doc example with its kind schema', async () => {
    const kinds = ['decks', 'pages', 'docs'] as const;
    let count = 0;
    for (const dir of kinds) {
      for (const name of readdirSync(join(CATALOG, dir)).filter((file) => file.endsWith('.json'))) {
        const raw = JSON.parse(readFileSync(join(CATALOG, dir, name), 'utf8')) as object;
        const result = await safeParseAnyBlueprint(raw);
        expect(result.success, `${dir}/${name}: ${JSON.stringify(result.error?.issues)}`).toBe(
          true
        );
        expect(blueprintKind(result.data as AnyBlueprint)).toBe(dir.slice(0, -1));
        count += 1;
      }
    }
    expect(count).toBeGreaterThanOrEqual(9);
  });
});

describe('apps through the union', () => {
  it('parses every catalog blueprint exactly as parseBlueprint does', async () => {
    expect(catalog.length).toBeGreaterThanOrEqual(40);
    for (const [name, raw] of catalog) {
      expect(await parseAnyBlueprint(raw), name).toEqual(parseBlueprint(raw));
    }
  });
});

describe('content kind body loading', () => {
  it('refuses to install a test body outside Vitest', () => {
    const saved = process.env.VITEST;
    delete process.env.VITEST;
    try {
      expect(() => withKindBodySchemaForTesting('deck', placeholderBody)).toThrow(/only available/);
    } finally {
      process.env.VITEST = saved;
    }
  });
});

describe('content kinds with a body schema', () => {
  let restore: (() => void)[] = [];
  beforeEach(() => {
    restore = CONTENT_KINDS.map((kind) => withKindBodySchemaForTesting(kind, placeholderBody));
  });
  afterEach(() => {
    for (const undo of restore) undo();
  });

  it('rejects another kind body, a missing body and an invalid body', async () => {
    expect((await safeParseAnyBlueprint(content('deck', { page: { title: 'x' } }))).success).toBe(
      false
    );
    const { deck: _deck, ...bodiless } = content('deck');
    const missing = await safeParseAnyBlueprint(bodiless);
    expect(missing.success).toBe(false);
    expect(missing.error?.issues.some((issue) => issue.path[0] === 'deck')).toBe(true);
    const invalid = await safeParseAnyBlueprint({ ...content('deck'), deck: { title: '' } });
    expect(invalid.error?.issues[0]?.path).toEqual(['deck', 'title']);
  });

  it('keeps parseBlueprint app-only: a deck is rejected', () => {
    expect(safeParseBlueprint(content('deck')).success).toBe(false);
    expect(() => parseBlueprint(content('deck'))).toThrow();
  });
});

describe('unknown kinds', () => {
  it('fail on kind with a "needs a newer Protoyard" issue', async () => {
    const result = await safeParseAnyBlueprint({ ...minimalApp, kind: 'quiz' });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        code: 'custom',
        path: ['kind'],
        message: expect.stringMatching(
          /"quiz" needs a newer Protoyard \(this version supports app, deck, page, doc\)/
        ),
      }),
    ]);
    await expect(parseAnyBlueprint({ ...minimalApp, kind: 'quiz' })).rejects.toThrow(
      /newer Protoyard/
    );
  });
});

describe('synchronous kind parsers (@protoyard/blueprint/kinds/parse)', () => {
  const FIXTURES = join(ROOT, 'packages/blueprint/tests/fixtures/kinds');
  const fixture = (name: string): Record<string, unknown> =>
    JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
  const CASES = [
    ['deck', 'intro.deck.json', parseDeckBlueprint],
    ['page', 'landing.page.json', parsePageBlueprint],
    ['doc', 'quarterly-report.doc.json', parseDocBlueprint],
  ] as const;

  it('return what parseAnyBlueprint returns, and refuse another kind, an app and an invalid body', async () => {
    for (const [kind, file, parse] of CASES) {
      const input = fixture(file);
      const parsed = parse(input);
      expect(parsed).not.toBeInstanceOf(Promise);
      expect(parsed).toEqual(await parseAnyBlueprint(input));
      for (const [, other] of CASES.filter(([k]) => k !== kind)) {
        expect(() => parse(fixture(other))).toThrow();
      }
      expect(() => parse(minimalApp)).toThrow();
      expect(() => parse({ ...input, [kind]: { nonsense: true } })).toThrow();
    }
  });
});
