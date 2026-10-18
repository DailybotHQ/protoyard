/**
 * Child-process runner: imports ONE local prototype's `src/prototype.ts` under
 * tsx and reports its scenarios and database versions, optionally running the
 * generator for each scenario and checking referential integrity.
 *
 * This executes prototype code, so it is only for trusted prototypes in your
 * own workspace (the same trust level as `pnpm test`). Discovery and indexing
 * never use it. Output: one marker line followed by JSON on stdout.
 *
 *   tsx inspect-prototype.ts <prototypeDir> <workspaceRoot> [inspect|generate] [scenarioId]
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PrototypeDefinition, Scenario, WorldSeed } from '@protoyard/core';

const RESULT_MARKER = '@@PROTOYARD_RESULT@@';

interface ScenarioTools {
  resolveScenarios: (inputs: readonly unknown[], presets?: Record<string, unknown>) => Scenario[];
  presets: Record<string, unknown>;
  createGenerateContext: (scenario: Scenario) => Parameters<PrototypeDefinition['generate']>[0];
  validateWorld: (
    seed: WorldSeed,
    integrity?: { referenceTime?: string }
  ) => { table: string; rowId: string; field?: string; message: string }[];
  source: string;
}

async function importFile(path: string): Promise<Record<string, unknown>> {
  return (await import(pathToFileURL(path).href)) as Record<string, unknown>;
}

/** Prefers the prototype's resolved `@protoyard/scenarios`, else the workspace sources. */
async function loadScenarioTools(dir: string, root: string): Promise<ScenarioTools> {
  try {
    const entry = createRequire(join(dir, 'package.json')).resolve('@protoyard/scenarios');
    const mod = await importFile(entry);
    if (
      typeof mod.validateWorld === 'function' &&
      typeof mod.createGenerateContext === 'function'
    ) {
      return {
        resolveScenarios: mod.resolveScenarios as ScenarioTools['resolveScenarios'],
        presets: (mod.PRESETS ?? {}) as Record<string, unknown>,
        createGenerateContext: mod.createGenerateContext as ScenarioTools['createGenerateContext'],
        validateWorld: mod.validateWorld as ScenarioTools['validateWorld'],
        source: '@protoyard/scenarios',
      };
    }
  } catch {
    // fall through to the source files
  }
  const src = join(root, 'packages', 'scenarios', 'src');
  const [compose, presets, context, integrity] = await Promise.all(
    ['compose.ts', 'presets.ts', 'context.ts', 'integrity.ts'].map((f) => importFile(join(src, f)))
  );
  return {
    resolveScenarios: compose?.resolveScenarios as ScenarioTools['resolveScenarios'],
    presets: (presets?.PRESETS ?? {}) as Record<string, unknown>,
    createGenerateContext: context?.createGenerateContext as ScenarioTools['createGenerateContext'],
    validateWorld: integrity?.validateWorld as ScenarioTools['validateWorld'],
    source: 'packages/scenarios/src',
  };
}

async function main() {
  const [dir, root, mode = 'inspect', only] = process.argv.slice(2);
  if (!dir || !root)
    throw new Error('usage: inspect-prototype <dir> <root> [inspect|generate] [id]');
  // Some prototypes touch IndexedDB at import time; give them the same fake the tests use.
  try {
    const fake = createRequire(join(root, 'package.json')).resolve('fake-indexeddb/auto');
    await importFile(fake);
  } catch {
    // optional
  }
  const entry = join(dir, 'src', 'prototype.ts');
  if (!existsSync(entry)) throw new Error('src/prototype.ts not found');
  const mod = await importFile(entry);
  const definition = (mod.definition ?? mod.default) as PrototypeDefinition | undefined;
  if (!definition || typeof definition.generate !== 'function') {
    throw new Error('src/prototype.ts must export `definition = definePrototype({ … })`');
  }
  const tools = await loadScenarioTools(dir, root);
  const scenarios = tools.resolveScenarios(definition.scenarios, tools.presets);
  const result: Record<string, unknown> = {
    validator: tools.source,
    scenarios: scenarios.map((s) => ({
      id: s.id,
      name: s.name,
      group: s.group,
      version: s.version,
      seed: s.seed,
      density: s.density,
    })),
    rawScenarioIds: definition.scenarios.map((s) => s.id),
    declared: definition.manifest.scenarios,
    defaultScenario: definition.manifest.defaultScenario ?? null,
    databaseVersions: definition.database.versions.map((v) => v.version),
    // Latest store set: a `null` store in a later version deletes the table.
    tables: [
      ...definition.database.versions.reduce((tables, v) => {
        for (const [name, spec] of Object.entries(v.stores)) {
          if (spec === null) tables.delete(name);
          else tables.add(name);
        }
        return tables;
      }, new Set<string>()),
    ],
    schemaVersion: definition.manifest.storage.schemaVersion,
  };
  if (mode === 'generate') {
    const runs = [];
    for (const scenario of scenarios) {
      if (only && scenario.id !== only) continue;
      let generateMs = 0;
      let validateMs = 0;
      try {
        const generateStarted = performance.now();
        let world: WorldSeed;
        try {
          world = await definition.generate(tools.createGenerateContext(scenario));
        } finally {
          generateMs = performance.now() - generateStarted;
        }

        const validateStarted = performance.now();
        let violations: ReturnType<ScenarioTools['validateWorld']>;
        try {
          violations = tools.validateWorld(world, { referenceTime: scenario.referenceTime });
          const actorExists = world.personas.some((p) => p.id === scenario.actor.id);
          if (!actorExists) {
            violations.unshift({
              table: 'py_personas',
              rowId: scenario.actor.id,
              message: `scenario actor "${scenario.actor.id}" is not among the generated personas`,
            });
          }
        } finally {
          validateMs = performance.now() - validateStarted;
        }
        const counts: Record<string, number> = {
          py_organizations: world.organizations.length,
          py_personas: world.personas.length,
          py_memberships: world.memberships.length,
          py_events: world.events?.length ?? 0,
        };
        for (const [table, rows] of Object.entries(world.tables)) counts[table] = rows.length;
        runs.push({
          id: scenario.id,
          ok: violations.length === 0,
          counts,
          violationCount: violations.length,
          violations: violations.slice(0, 20),
          durationMs: generateMs + validateMs,
          generateMs,
          validateMs,
        });
      } catch (error) {
        runs.push({
          id: scenario.id,
          ok: false,
          error: (error as Error).message,
          durationMs: generateMs + validateMs,
          generateMs,
          validateMs,
        });
      }
    }
    result.runs = runs;
  }
  process.stdout.write(`\n${RESULT_MARKER}${JSON.stringify(result)}\n`);
}

main().catch((error: unknown) => {
  process.stdout.write(
    `\n${RESULT_MARKER}${JSON.stringify({ fatal: (error as Error).message ?? String(error) })}\n`
  );
  process.exitCode = 1;
});
