/**
 * Regression: generated JSON Schema (from Zod) accepts the structural shape of
 * every app/deck/page/doc catalog fixture. Cross-reference and lint rules still
 * require the package validator (`safeParseAnyBlueprint` / `parseBlueprint`).
 *
 * This task does not hand-edit schema artifacts; it regenerates JSON Schema from
 * the live TypeScript unions via `z.toJSONSchema`.
 */
// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { BRIEFS } from '../../../scripts/bench-brief-kinds.ts';
import {
  type BriefResult,
  blueprintFromBrief,
  isAppBriefResult,
  isContentBriefResult,
} from '../src/brief/index.ts';
import { blueprintJsonSchema, parseBlueprint, safeParseAnyBlueprint } from '../src/index.ts';
import { DeckBodySchema } from '../src/kinds/deck.ts';
import { DocBodySchema } from '../src/kinds/doc.ts';
import { PageBodySchema } from '../src/kinds/page.ts';
import { BLUEPRINT_BASE_SHAPE } from '../src/schema.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE_KINDS = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/kinds');
const BLUEPRINT_ROOT = join(ROOT, 'blueprints');

type Kind = 'app' | 'deck' | 'page' | 'doc';

function listCatalogFixtures(): { kind: Kind; path: string; value: unknown }[] {
  const out: { kind: Kind; path: string; value: unknown }[] = [];
  for (const name of readdirSync(FIXTURE_KINDS)
    .filter((n) => n.endsWith('.json'))
    .sort()) {
    const value = JSON.parse(readFileSync(join(FIXTURE_KINDS, name), 'utf8')) as {
      kind?: string;
    };
    const kind = (value.kind ?? 'app') as Kind;
    out.push({ kind, path: `fixtures/kinds/${name}`, value });
  }
  for (const [kind, folder] of [
    ['deck', 'decks'],
    ['page', 'pages'],
    ['doc', 'docs'],
  ] as const) {
    const dir = join(BLUEPRINT_ROOT, folder);
    for (const name of readdirSync(dir)
      .filter((n) => n.endsWith('.json'))
      .sort()) {
      out.push({
        kind,
        path: `blueprints/${folder}/${name}`,
        value: JSON.parse(readFileSync(join(dir, name), 'utf8')),
      });
    }
  }
  // App catalog sample
  const apps = join(BLUEPRINT_ROOT);
  for (const name of readdirSync(apps)
    .filter((n) => n.endsWith('.json'))
    .slice(0, 3)) {
    out.push({
      kind: 'app',
      path: `blueprints/${name}`,
      value: JSON.parse(readFileSync(join(apps, name), 'utf8')),
    });
  }
  return out;
}

function contentEnvelopeSchema(kind: 'deck' | 'page' | 'doc', body: z.ZodType) {
  return z.strictObject({
    ...BLUEPRINT_BASE_SHAPE,
    kind: z.literal(kind),
    [kind]: body,
  });
}

/** Generated JSON Schema documents (draft 2020-12) per kind — not hand-edited. */
function kindJsonSchemas() {
  return {
    app: blueprintJsonSchema(),
    deck: z.toJSONSchema(contentEnvelopeSchema('deck', DeckBodySchema), {
      io: 'input',
      target: 'draft-2020-12',
    }),
    page: z.toJSONSchema(contentEnvelopeSchema('page', PageBodySchema), {
      io: 'input',
      target: 'draft-2020-12',
    }),
    doc: z.toJSONSchema(contentEnvelopeSchema('doc', DocBodySchema), {
      io: 'input',
      target: 'draft-2020-12',
    }),
  } as const;
}

/**
 * Structural JSON Schema check without Ajv: required top-level keys from the
 * generated schema must be present on the fixture. Full typing still goes
 * through the package validator below.
 */
function assertMatchesGeneratedShape(
  schema: Record<string, unknown>,
  value: unknown,
  label: string
): void {
  expect(value, label).toBeTypeOf('object');
  expect(value).not.toBeNull();
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  const record = value as Record<string, unknown>;
  for (const key of required) {
    expect(record, `${label} missing required ${key}`).toHaveProperty(key);
  }
  expect(schema.$schema ?? schema['$schema']).toBeTruthy();
}

describe('generated kind JSON Schema vs fixtures', () => {
  const schemas = kindJsonSchemas();
  const fixtures = listCatalogFixtures();

  it('exposes a draft-2020-12 schema per kind with a kind/body discriminator', () => {
    expect(schemas.app.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    for (const kind of ['deck', 'page', 'doc'] as const) {
      const schema = schemas[kind] as {
        $schema?: string;
        properties?: Record<string, unknown>;
        required?: string[];
      };
      expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(schema.properties).toHaveProperty('kind');
      expect(schema.properties).toHaveProperty(kind);
      expect(schema.required).toEqual(
        expect.arrayContaining(['kind', kind, 'formatVersion', 'name'])
      );
    }
  });

  it.each(fixtures.map((f) => [f.path, f] as const))(
    '%s matches generated schema shape and package validator',
    async (_path, fixture) => {
      const schema = schemas[fixture.kind] as Record<string, unknown>;
      assertMatchesGeneratedShape(schema, fixture.value, fixture.path);
      if (fixture.kind === 'app') {
        // App fixtures may omit kind; package validator is the authority.
        expect(() => parseBlueprint(fixture.value)).not.toThrow();
      } else {
        const result = await safeParseAnyBlueprint(fixture.value);
        expect(result.success, JSON.stringify(result)).toBe(true);
      }
    }
  );

  it('documents that cross-reference errors still need the package validator', async () => {
    // Structurally a page (has kind + page object) but formId does not resolve.
    const broken = {
      formatVersion: 1,
      kind: 'page',
      name: 'Broken page',
      page: {
        id: 'broken-page',
        title: 'Broken',
        sections: [
          {
            id: 'only',
            blocks: [{ type: 'heading', text: 'Hello', level: 2 }],
          },
        ],
        forms: [{ formId: 'missing-form' }],
      },
    };
    // Required keys present (JSON Schema structural)…
    assertMatchesGeneratedShape(schemas.page as Record<string, unknown>, broken, 'broken');
    // …but package validator catches the cross-reference.
    const result = await safeParseAnyBlueprint(broken);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => /formId|form block/i.test(issue.message))).toBe(
        true
      );
    }
  });
});

describe('synthesized drafts validate for all four kinds', () => {
  it('bench briefs: expected kind and safeParseAnyBlueprint success', async () => {
    const results: { id: string; expected: string; actual: string; valid: boolean }[] = [];
    for (const row of BRIEFS) {
      const synthesized: BriefResult = blueprintFromBrief(row.brief);
      expect(synthesized.kind).toBe(row.expected);
      const parsed = await safeParseAnyBlueprint(synthesized.json);
      results.push({
        id: row.id,
        expected: row.expected,
        actual: synthesized.kind,
        valid: parsed.success,
      });
      expect(parsed.success, `${row.id}: ${JSON.stringify(parsed)}`).toBe(true);
      if (row.expected === 'page' && isContentBriefResult(synthesized)) {
        const page = synthesized.json.page as { id?: string; title?: string };
        expect(page.id).toMatch(/^[a-z][a-z0-9-]*$/);
        expect(page.title?.length).toBeGreaterThan(0);
      }
      if (row.expected === 'doc' && isContentBriefResult(synthesized)) {
        const doc = synthesized.json.doc as { id?: string; title?: string };
        expect(doc.id).toMatch(/^[a-z][a-z0-9-]*$/);
        expect(doc.title?.length).toBeGreaterThan(0);
      }
      if (row.expected === 'app') {
        expect(isAppBriefResult(synthesized)).toBe(true);
      }
    }
    expect(results.every((row) => row.valid && row.actual === row.expected)).toBe(true);
    const kinds = new Set(results.map((row) => row.actual));
    expect(kinds).toEqual(new Set(['app', 'deck', 'page', 'doc']));
  });

  it('one-page report brief detects as doc, not app', async () => {
    const brief =
      'Write a one-page report on a fictional support team: summary, key metrics, what changed this month, open issues and recommendations.';
    const result = blueprintFromBrief(brief);
    expect(result.kind).toBe('doc');
    const parsed = await safeParseAnyBlueprint(result.json);
    expect(parsed.success).toBe(true);
  });
});
