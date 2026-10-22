// @vitest-environment node
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  type AnyBlueprint,
  BLUEPRINT_KINDS,
  blueprintIdentity,
  blueprintKind,
  CONTENT_KINDS,
  type ContentKind,
  detectBlueprintKind,
  isAppBlueprint,
  isContentBlueprint,
  isDeckBlueprint,
  isDocBlueprint,
  isPageBlueprint,
  parseAnyBlueprint,
  parseBlueprint,
  safeParseAnyBlueprint,
  safeParseBlueprint,
} from '../../src/index.ts';
import { kindBodySchema } from '../../src/kinds/bodies.ts';
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
  it('treats a missing kind as app', () => {
    expect(detectBlueprintKind({ name: 'x' })).toEqual({ ok: true, kind: 'app' });
    expect(detectBlueprintKind({ kind: undefined })).toEqual({ ok: true, kind: 'app' });
  });

  it('reads each known kind', () => {
    for (const kind of BLUEPRINT_KINDS)
      expect(detectBlueprintKind({ kind })).toEqual({ ok: true, kind });
  });

  it('explains unknown and non-string kinds', () => {
    const unknown = detectBlueprintKind({ kind: 'quiz' });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.message).toMatch(/"quiz" needs a newer Protoyard/);
    const numeric = detectBlueprintKind({ kind: 3 });
    expect(numeric.ok).toBe(false);
    if (!numeric.ok) expect(numeric.message).toMatch(/must be a string/);
  });

  it('ignores an inherited kind', () => {
    expect(detectBlueprintKind(Object.create({ kind: 'deck' }))).toEqual({ ok: true, kind: 'app' });
  });
});

describe('apps through the union', () => {
  it('parses every catalog blueprint exactly as parseBlueprint does', async () => {
    expect(catalog.length).toBeGreaterThanOrEqual(40);
    for (const [name, raw] of catalog) {
      expect(await parseAnyBlueprint(raw), name).toEqual(parseBlueprint(raw));
    }
  });

  it('gives a missing kind and kind "app" one output and one identity', async () => {
    const missing = await parseAnyBlueprint(minimalApp);
    const explicit = await parseAnyBlueprint({ ...minimalApp, kind: 'app' });
    expect(explicit).toEqual(missing);
    expect('kind' in explicit).toBe(false);
    expect(await blueprintIdentity(parseBlueprint({ ...minimalApp, kind: 'app' }))).toEqual(
      await blueprintIdentity(parseBlueprint(minimalApp))
    );
    for (const [name, raw] of catalog) {
      expect(await blueprintIdentity(parseBlueprint({ ...raw, kind: 'app' })), name).toEqual(
        await blueprintIdentity(parseBlueprint(raw))
      );
    }
  });

  it('keeps app validation: entities and roles stay required', async () => {
    const { entities: _entities, ...noEntities } = minimalApp;
    const result = await safeParseAnyBlueprint({ ...noEntities, kind: 'app' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === 'entities')).toBe(true);
  });

  it('classifies a parsed app', async () => {
    const app: AnyBlueprint = await parseAnyBlueprint(minimalApp);
    expect(blueprintKind(app)).toBe('app');
    expect(isAppBlueprint(app)).toBe(true);
    expect(isContentBlueprint(app)).toBe(false);
    if (isAppBlueprint(app)) expect(app.entities.length).toBeGreaterThan(0);
  });
});

describe('content kind body loading', () => {
  it('loads deck, page and doc schemas only when requested', async () => {
    for (const kind of CONTENT_KINDS) expect(await kindBodySchema(kind)).toBeDefined();
  });

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

  it.each(CONTENT_KINDS)('parses a %s and keeps its kind', async (kind) => {
    const parsed = await parseAnyBlueprint(content(kind));
    expect(parsed).toMatchObject({ kind, name: `A ${kind}`, [kind]: { title: 'Hello' } });
    expect(blueprintKind(parsed)).toBe(kind);
    expect(isAppBlueprint(parsed)).toBe(false);
    expect(isContentBlueprint(parsed)).toBe(true);
  });

  it('narrows with the per-kind guards', async () => {
    const deck = await parseAnyBlueprint(content('deck'));
    const page = await parseAnyBlueprint(content('page'));
    const doc = await parseAnyBlueprint(content('doc'));
    expect([isDeckBlueprint(deck), isPageBlueprint(deck), isDocBlueprint(deck)]).toEqual([
      true,
      false,
      false,
    ]);
    expect(isPageBlueprint(page)).toBe(true);
    expect(isDocBlueprint(doc)).toBe(true);
    if (isDeckBlueprint(deck)) expect(deck.deck).toEqual({ title: 'Hello' });
  });

  it('applies the shared root rules (name, tags, brand) to content kinds', async () => {
    expect((await safeParseAnyBlueprint(content('deck', { name: '' }))).success).toBe(false);
    expect((await safeParseAnyBlueprint(content('deck', { formatVersion: 2 }))).success).toBe(
      false
    );
    expect((await safeParseAnyBlueprint(content('deck', { brand: {} }))).success).toBe(false);
    const branded = await parseAnyBlueprint(content('deck', { brand: { preset: 'ocean' } }));
    expect(branded).toMatchObject({ brand: { preset: 'ocean' } });
  });

  it.each([
    'entities',
    'roles',
    'screens',
    'layout',
    'archetype',
    'notifications',
    'history',
    'validation',
  ])('rejects the app-only key %s on a deck', async (key) => {
    const result = await safeParseAnyBlueprint(content('deck', { [key]: [] }));
    expect(result.success).toBe(false);
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

  it('truncate a very long kind in the message', async () => {
    const result = await safeParseAnyBlueprint({ kind: 'x'.repeat(500) });
    expect(result.error?.issues[0]?.message.length).toBeLessThan(160);
  });

  it('reject non-object input through the app schema', async () => {
    for (const input of [null, 'deck', 42, []]) {
      expect((await safeParseAnyBlueprint(input)).success, String(input)).toBe(false);
    }
  });
});
