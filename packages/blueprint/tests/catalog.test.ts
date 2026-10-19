// @vitest-environment node
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addCrudTemplate,
  cli,
  createWorkspace,
  type TempWorkspace,
} from '../../cli/tests/helpers.ts';
import { createBlueprintGenerator } from '../src/generator.ts';
import {
  deriveInputSchemas,
  deriveIntegrity,
  derivePolicy,
  deriveStores,
  parseBlueprint,
  resolveBlueprintBrand,
  SCREEN_TYPES,
} from '../src/index.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const BLUEPRINTS_DIR = join(ROOT, 'blueprints');
let workspace: TempWorkspace;

beforeAll(() => {
  workspace = createWorkspace();
  addCrudTemplate(workspace);
});

afterAll(() => workspace.cleanup());

function listCatalogFiles(): string[] {
  return readdirSync(BLUEPRINTS_DIR)
    .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
    .sort();
}

function load(file: string) {
  const raw = JSON.parse(readFileSync(join(BLUEPRINTS_DIR, file), 'utf8'));
  return { slug: basename(file, '.json'), raw, blueprint: parseBlueprint(raw) };
}

describe('marketplace blueprint catalog', () => {
  const files = listCatalogFiles();

  it('ships at least 20 catalog blueprints', () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  it('parses every blueprint with brand + catalog and derives stores/policy/inputs', () => {
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const { slug, blueprint } = load(file);
      expect(blueprint.brand, slug).toBeDefined();
      expect(blueprint.catalog, slug).toBeDefined();
      expect(blueprint.catalog?.category, slug).toBeTruthy();
      expect(Object.keys(deriveStores(blueprint)).length, slug).toBeGreaterThan(0);
      expect(Object.keys(derivePolicy(blueprint).roles).length, slug).toBeGreaterThan(0);
      for (const entity of blueprint.entities) {
        const inputs = deriveInputSchemas(entity);
        expect(inputs.create, `${slug}.${entity.name}`).toBeDefined();
        expect(inputs.update, `${slug}.${entity.name}`).toBeDefined();
      }
      // Brand resolves to an AA theme id matching the catalog slug prefix.
      const theme = resolveBlueprintBrand(blueprint.brand!, { blueprintName: blueprint.name });
      expect(theme.id.length, slug).toBeGreaterThan(0);
      expect(theme.light.primary, slug).toMatch(/^#|^rgb/i);
    }
  });

  it('gives every blueprint a dashboard, four entities, distributions and a rich screen', () => {
    const coverage = new Map<string, number>();
    const richKinds = ['board', 'calendar', 'timeline', 'map', 'analytics'];
    for (const file of files) {
      const { slug, blueprint } = load(file);
      expect(blueprint.entities.length, slug).toBeGreaterThanOrEqual(4);
      expect(
        blueprint.screens.some((screen) => screen.type === 'dashboard'),
        slug
      ).toBe(true);
      expect(
        blueprint.screens.some((screen) => richKinds.includes(screen.type)),
        slug
      ).toBe(true);
      expect(
        blueprint.entities.some((entity) =>
          entity.fields.some(
            (field) =>
              ('weights' in field && field.weights !== undefined) ||
              ('window' in field && field.window !== undefined) ||
              ('trend' in field && field.trend !== undefined)
          )
        ),
        `${slug} has scenario distribution hints`
      ).toBe(true);
      for (const screen of blueprint.screens) {
        coverage.set(screen.type, (coverage.get(screen.type) ?? 0) + 1);
      }
    }
    for (const kind of SCREEN_TYPES) {
      expect(
        coverage.get(kind) ?? 0,
        `${kind} appears in at least three blueprints`
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('passes generate --dry-run for every catalog file in a temporary workspace', async () => {
    for (const file of files) {
      const slug = basename(file, '.json');
      const run = await cli([
        '--root',
        workspace.root,
        '--json',
        'generate',
        `catalog-${slug}`,
        '--blueprint',
        join(BLUEPRINTS_DIR, file),
        '--dry-run',
      ]);
      expect(run.code, `${slug}: ${run.stderr || run.stdout}`).toBe(0);
      expect(
        run.json<{ data: { dryRun: boolean; entities: string[]; files: unknown[] } }>().data
      ).toMatchObject({
        dryRun: true,
        entities: expect.arrayContaining(
          load(file).blueprint.entities.map((entity) => entity.name)
        ),
      });
      expect(run.json<{ data: { files: unknown[] } }>().data.files.length, slug).toBeGreaterThan(0);
    }
  }, 120_000);

  it('generates a deterministic world for every catalog blueprint', async () => {
    for (const file of files) {
      const { slug, blueprint } = load(file);
      const scenario = parseScenario({
        id: `catalog-${slug}`,
        name: `Catalog ${slug}`,
        seed: 42_000 + slug.length,
        referenceTime: '2026-06-15T12:00:00.000Z',
        density: 'normal',
        organization: {
          id: 'org_catalog',
          name: 'Catalog Org',
          size: 8,
          ageDays: 120,
          subscription: 'pro',
        },
      });
      const { generate } = createBlueprintGenerator(blueprint);
      const a = await generate(createGenerateContext(scenario));
      const b = await generate(createGenerateContext(scenario));
      expect(a, slug).toEqual(b);
      expect(
        validateWorld(a, {
          ...deriveIntegrity(blueprint),
          referenceTime: scenario.referenceTime,
        }),
        slug
      ).toEqual([]);
    }
  }, 60_000);
});
