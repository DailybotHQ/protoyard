import { definePrototype, type PrototypeRuntime } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { helpdeskBlueprint } from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import { blueprintGeneratorVersion } from '../src/generator.ts';
import {
  BLUEPRINT_DEFAULT_SCENARIO,
  type BlueprintInput,
  blueprintScenarios,
  brandDefaultThemeId,
  createEntityServices,
  definePrototypeFromBlueprint,
  deriveAppModel,
  deriveDatabaseVersions,
  latestSchemaVersion,
  parseBlueprint,
} from '../src/index.ts';

const NAMESPACE = 'bp-runtimefixture';
let harnesses: ReturnType<typeof createHarness>[] = [];
afterEach(() => {
  for (const harness of harnesses) harness.closeAll();
  harnesses = [];
});

function harnessFor(definition: Parameters<typeof createHarness>[0]) {
  const harness = createHarness(definition);
  harnesses.push(harness);
  return harness;
}

const rows = (runtime: PrototypeRuntime, table: string) =>
  (runtime.db as { table(name: string): { toArray(): Promise<Record<string, unknown>[]> } })
    .table(table)
    .toArray();

/** A fictional studio with a built brand and a layout. */
function branded(brand: BlueprintInput['brand']) {
  return parseBlueprint({
    formatVersion: 1,
    name: 'Brightside Studio',
    description: 'Classes and bookings.',
    category: 'productivity',
    tags: ['booking'],
    icon: '🎨',
    brand,
    layout: { id: 'rail', mobile: 'mobile-tabs' },
    entities: [
      {
        name: 'booking',
        plural: 'bookings',
        fields: [{ name: 'member', kind: 'text', required: true }],
        titleField: 'member',
      },
    ],
    roles: [{ name: 'member', permissions: { '*': ['*'] } }],
  } as BlueprintInput);
}

describe('definePrototypeFromBlueprint', () => {
  it('returns a definePrototype-valid definition with a synthesized manifest', () => {
    const { definition, appModel } = definePrototypeFromBlueprint(helpdeskBlueprint, {
      namespace: NAMESPACE,
    });
    expect(() => definePrototype(definition)).not.toThrow();
    expect(definition.manifest).toMatchObject({
      id: `local.${NAMESPACE}`,
      slug: NAMESPACE,
      kind: 'prototype',
      name: 'Help desk fixture',
      version: '0.1.0',
      defaultScenario: BLUEPRINT_DEFAULT_SCENARIO,
      defaultTheme: 'violet',
      storage: { namespace: NAMESPACE, schemaVersion: latestSchemaVersion(helpdeskBlueprint) },
      scenarios: blueprintScenarios(helpdeskBlueprint).map((scenario) => scenario.id),
      preview: { viewport: 'desktop', layout: { id: 'sidebar' } },
    });
    expect(definition.database.versions).toEqual(deriveDatabaseVersions(helpdeskBlueprint));
    expect(definition.scenarios.map((scenario) => scenario.id)).toContain(
      BLUEPRINT_DEFAULT_SCENARIO
    );
    expect(definition.generatorVersion).toBe(blueprintGeneratorVersion(helpdeskBlueprint));
    expect(definition.policy).toBeDefined();
    expect(definition.integrity).toBeDefined();
    expect(definition.themes).toBeUndefined();
    expect(appModel).toEqual(deriveAppModel(helpdeskBlueprint));
  });

  it('uses the slug when given and refuses a namespace that is not a valid slug', () => {
    const named = definePrototypeFromBlueprint(helpdeskBlueprint, {
      namespace: NAMESPACE,
      slug: 'help-desk',
    });
    expect(named.definition.manifest).toMatchObject({ slug: 'help-desk', id: 'local.help-desk' });
    expect(named.definition.manifest.storage.namespace).toBe(NAMESPACE);
    expect(() =>
      definePrototypeFromBlueprint(helpdeskBlueprint, { namespace: 'Bad Namespace' })
    ).toThrow();
    expect(() =>
      definePrototypeFromBlueprint(helpdeskBlueprint, { namespace: `bp-${'a'.repeat(60)}` })
    ).toThrow();
  });

  it('carries the brand theme, catalog metadata and layout like codegen', () => {
    const blueprint = branded({ seed: '#a35f47', font: 'humanist' });
    const { definition, appModel } = definePrototypeFromBlueprint(blueprint, {
      namespace: NAMESPACE,
    });
    const themeId = brandDefaultThemeId(blueprint);
    expect(themeId).toBe('brightside-studio');
    expect(definition.manifest).toMatchObject({
      defaultTheme: themeId,
      description: 'Classes and bookings.',
      category: 'productivity',
      tags: ['booking'],
      icon: '🎨',
      preview: { layout: { id: 'rail' } },
    });
    expect(definition.themes?.map((theme) => theme.id)).toEqual([themeId]);
    expect(appModel.layout).toEqual({ id: 'rail', mobile: 'mobile-tabs' });
  });

  it('ships a library brand by id, without a theme module', () => {
    const blueprint = branded({ libraryTheme: 'fintech-ledger' });
    const { definition } = definePrototypeFromBlueprint(blueprint, { namespace: NAMESPACE });
    expect(definition.manifest.defaultTheme).toBe('fintech-ledger');
    expect(definition.themes).toBeUndefined();
    expect(() => brandDefaultThemeId(branded({ libraryTheme: 'no-such-theme' }))).toThrow(
      /Unknown library theme/
    );
  });

  it('boots in the runtime harness, seeds a world and keeps it across a reload', async () => {
    const { definition } = definePrototypeFromBlueprint(helpdeskBlueprint, {
      namespace: NAMESPACE,
    });
    const harness = harnessFor(definition);
    const runtime = await harness.boot();
    expect(runtime.scenarios.active()?.scenario.id).toBe(BLUEPRINT_DEFAULT_SCENARIO);
    const customers = await rows(runtime, 'customers');
    expect(customers.length).toBeGreaterThan(0);

    const services = createEntityServices(runtime, helpdeskBlueprint);
    const created = await services.customer?.create({ name: 'Northwind Example' });
    const reopened = await harness.reload(runtime);
    expect((await rows(reopened, 'customers')).some((row) => row.id === created?.id)).toBe(true);
  });

  it('loads every default scenario', async () => {
    const { definition } = definePrototypeFromBlueprint(helpdeskBlueprint, {
      namespace: NAMESPACE,
    });
    const runtime = await harnessFor(definition).boot();
    const counts: Record<string, number> = {};
    for (const id of ['empty', 'viewer', 'massive']) {
      await runtime.scenarios.load(id);
      expect(runtime.scenarios.active()?.scenario.id).toBe(id);
      counts[id] = (await rows(runtime, 'tickets')).length;
    }
    expect(counts.empty).toBe(0);
    expect(counts.massive).toBeGreaterThan(counts.viewer ?? 0);
  });

  it('seeds the same world for the same blueprint, scenario and seed', async () => {
    const first = await harnessFor(
      definePrototypeFromBlueprint(helpdeskBlueprint, { namespace: NAMESPACE }).definition
    ).boot();
    const second = await harnessFor(
      definePrototypeFromBlueprint(helpdeskBlueprint, { namespace: NAMESPACE }).definition
    ).boot();
    expect(await rows(second, 'tickets')).toEqual(await rows(first, 'tickets'));
  });
});
