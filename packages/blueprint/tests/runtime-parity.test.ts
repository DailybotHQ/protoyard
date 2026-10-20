// @vitest-environment node
/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type PrototypeDefinition, type PrototypeRuntime, parseScenario } from '@protoyard/core';
import { createGenerateContext } from '@protoyard/scenarios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  addCrudTemplate,
  cli,
  createWorkspace,
  linkInstalled,
  type TempWorkspace,
} from '../../cli/tests/helpers.ts';
import {
  type Blueprint,
  definePrototypeFromBlueprint,
  deriveAppModel,
  parseBlueprint,
} from '../src/index.ts';

/**
 * Level 1 (the player) and level 2 (generated prototypes) must be the same
 * app (ADR-029). For every catalog blueprint this generates a real prototype
 * with the CLI, loads its definition, and compares it with
 * `definePrototypeFromBlueprint` on the same blueprint.json: storage versions,
 * policy, integrity, scenarios, generator version, theme, routes, navigation,
 * layout, and the seeded world, byte for byte. The generated app renders the
 * shared shell (BlueprintApp) from `src/generated/blueprint.ts`, so its routes,
 * navigation and layout are the app model of that module's blueprint.
 */

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const CATALOG = readdirSync(join(ROOT, 'blueprints'))
  .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
  .sort()
  .map((file) => basename(file, '.json'));

let workspace: TempWorkspace;
beforeAll(() => {
  workspace = createWorkspace();
  addCrudTemplate(workspace);
});
afterAll(() => workspace.cleanup());

interface Generated {
  definition: PrototypeDefinition;
  blueprintJson: unknown;
  appText: string;
  /** What the generated app hands to BlueprintApp. */
  appBlueprint: Blueprint;
  retired: string[];
  crudGeneratorVersion: () => Promise<number>;
}

const generatedBySlug = new Map<string, Promise<Generated>>();

/** `protoyard generate` into the temporary workspace once per slug, then load what it wrote. */
function generate(slug: string): Promise<Generated> {
  let pending = generatedBySlug.get(slug);
  if (!pending) {
    pending = generateOnce(slug);
    generatedBySlug.set(slug, pending);
  }
  return pending;
}

async function generateOnce(slug: string): Promise<Generated> {
  const name = `parity-${slug}`;
  const run = await cli([
    '--root',
    workspace.root,
    '--json',
    'generate',
    name,
    '--blueprint',
    join(ROOT, 'blueprints', `${slug}.json`),
    '--no-install',
  ]);
  expect(run.code, `${slug}: ${run.stderr || run.stdout}`).toBe(0);
  linkInstalled(workspace, name);
  const dir = join(workspace.root, 'prototypes', name);
  const [{ definition }, { blueprint: appBlueprint }, scenarios] = await Promise.all([
    import(join(dir, 'src/prototype.ts')) as Promise<{ definition: PrototypeDefinition }>,
    import(join(dir, 'src/generated/blueprint.ts')) as Promise<{ blueprint: Blueprint }>,
    import(join(dir, 'src/generated/scenarios.ts')) as Promise<{
      crudGeneratorVersion: () => Promise<number>;
    }>,
  ]);
  return {
    definition,
    blueprintJson: JSON.parse(readFileSync(join(dir, 'blueprint.json'), 'utf8')),
    appText: readFileSync(join(dir, 'src/App.svelte'), 'utf8'),
    appBlueprint,
    retired: ['src/generated/routes.ts', 'src/generated/layout.ts', 'src/generated/screens'].filter(
      (file) => existsSync(join(dir, file))
    ),
    crudGeneratorVersion: scenarios.crudGeneratorVersion,
  };
}

const versions = (definition: PrototypeDefinition) =>
  definition.database.versions.map((version) => ({
    version: version.version,
    stores: version.stores,
    upgrade: typeof version.upgrade,
  }));

/** A plain normal-density scenario, as the catalog determinism test uses. */
const SCENARIO = parseScenario({
  id: 'parity',
  name: 'Parity',
  seed: 4_242,
  referenceTime: '2026-06-15T12:00:00.000Z',
  density: 'normal',
  organization: {
    id: 'org_parity',
    name: 'Parity Org',
    size: 8,
    ageDays: 120,
    subscription: 'pro',
  },
});

describe('runtime and codegen parity over the catalog', () => {
  it('covers the 40 catalog blueprints', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(40);
  });

  it.each(CATALOG)(
    '%s: the generated prototype and the runtime definition agree',
    async (slug) => {
      const generated = await generate(slug);
      const blueprint = parseBlueprint(generated.blueprintJson);
      const generatedManifest = generated.definition.manifest;
      const { definition, appModel } = definePrototypeFromBlueprint(blueprint, {
        namespace: generatedManifest.storage.namespace,
        slug: generatedManifest.slug,
      });

      // Storage, policy, integrity and scenarios.
      expect(versions(definition), 'database versions').toEqual(versions(generated.definition));
      expect(definition.manifest.storage).toEqual(generatedManifest.storage);
      expect(JSON.parse(JSON.stringify(definition.policy)), 'policy').toEqual(
        JSON.parse(JSON.stringify(generated.definition.policy))
      );
      expect(definition.integrity, 'integrity').toEqual(generated.definition.integrity);
      expect(definition.scenarios, 'scenarios').toEqual(generated.definition.scenarios);
      expect(definition.manifest.scenarios).toEqual(generatedManifest.scenarios);
      expect(definition.manifest.defaultScenario).toBe(generatedManifest.defaultScenario);

      // The generator version: the prototype declares the blueprint generator's own version
      // (regression: generated prototype.ts used to pin 1, so it never reseeded on change).
      expect(definition.generatorVersion, 'generator version').toBe(
        await generated.crudGeneratorVersion()
      );
      expect(generated.definition.generatorVersion, 'generated prototype.ts generatorVersion').toBe(
        definition.generatorVersion
      );

      // Theme: the same default and the same built brand theme.
      expect(definition.manifest.defaultTheme, 'default theme').toBe(
        generatedManifest.defaultTheme
      );
      expect(definition.themes ?? [], 'brand themes').toEqual(generated.definition.themes ?? []);

      // Routes, navigation and layout: the generated app renders BlueprintApp from the
      // generated blueprint module, so they are that blueprint's app model, and it is the
      // runtime definition's (no generated route or layout files remain to drift).
      expect(generated.appText).toContain("import { blueprint } from './generated/blueprint.ts';");
      expect(generated.appText).toContain('<BlueprintApp {blueprint}');
      expect(generated.retired, 'retired generated files').toEqual([]);
      expect(generated.appBlueprint, 'app blueprint').toEqual(blueprint);
      const appModelOfGenerated = deriveAppModel(generated.appBlueprint);
      expect(appModelOfGenerated.routes, 'routes').toEqual(appModel.routes);
      expect(appModelOfGenerated.nav, 'nav').toEqual(appModel.nav);
      expect(appModelOfGenerated.layout, 'layout').toEqual(appModel.layout);
      expect(appModelOfGenerated.navGroups, 'nav groups').toEqual(appModel.navGroups);
      expect(definition.manifest.preview?.layout?.id).toBe(appModel.layout.id);

      // The seeded world, byte for byte, for a fixed seed.
      const fromGenerated = await generated.definition.generate(createGenerateContext(SCENARIO));
      const fromRuntime = await definition.generate(createGenerateContext(SCENARIO));
      expect(JSON.stringify(fromRuntime), 'world').toBe(JSON.stringify(fromGenerated));
    },
    30_000
  );
});

describe('runtime and codegen parity in a real runtime', () => {
  const dump = async (runtime: PrototypeRuntime) => {
    const db = runtime.db as {
      tables: { name: string; toArray(): Promise<unknown[]> }[];
    };
    const tables = [...db.tables].sort((a, b) => a.name.localeCompare(b.name));
    return Object.fromEntries(
      await Promise.all(tables.map(async (table) => [table.name, await table.toArray()] as const))
    );
  };

  it.each(['crm', 'clinic', 'logistics'])(
    '%s: both definitions seed identical databases through the default scenario',
    async (slug) => {
      const generated = await generate(`${slug}`);
      const blueprint = parseBlueprint(generated.blueprintJson);
      const { definition } = definePrototypeFromBlueprint(blueprint, {
        namespace: `${generated.definition.manifest.storage.namespace}-runtime`,
        slug: generated.definition.manifest.slug,
      });
      const generatedHarness = createHarness(generated.definition);
      const runtimeHarness = createHarness(definition);
      try {
        const [left, right] = await Promise.all([generatedHarness.boot(), runtimeHarness.boot()]);
        const [leftActive, rightActive] = [left.scenarios.active(), right.scenarios.active()];
        expect(leftActive?.scenario.id).toBe('active');
        expect(rightActive?.scenario.id).toBe(leftActive?.scenario.id);
        expect(rightActive?.seed).toBe(leftActive?.seed);
        const [leftTables, rightTables] = [await dump(left), await dump(right)];
        // A seeded world, not two empty databases.
        expect(Object.values(leftTables).filter((rows) => rows.length > 0).length).toBeGreaterThan(
          4
        );
        expect(JSON.stringify(rightTables)).toBe(JSON.stringify(leftTables));
      } finally {
        generatedHarness.closeAll();
        runtimeHarness.closeAll();
      }
    },
    60_000
  );
});
