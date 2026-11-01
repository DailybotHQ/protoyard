// @vitest-environment node
/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type PrototypeDefinition, parseScenario } from '@protoyard/core';
import { createGenerateContext } from '@protoyard/scenarios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
 * app (ADR-029). For a representative catalog blueprint this generates a real prototype
 * with the CLI, loads its definition, and compares it with
 * `definePrototypeFromBlueprint` on the same blueprint.json: storage versions,
 * policy, integrity, scenarios, generator version, theme, routes, navigation,
 * layout, and the seeded world, byte for byte. The generated app renders the
 * shared shell (BlueprintApp) from `src/generated/blueprint.ts`, so its routes,
 * navigation and layout are the app model of that module's blueprint.
 */

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
/** One representative catalog blueprint (relations, enums, money, personas, a dashboard). */
const REPRESENTATIVE = ['crm'];

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

describe('runtime and codegen parity', () => {
  it.each(REPRESENTATIVE)(
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
