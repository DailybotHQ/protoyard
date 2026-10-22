/**
 * Child-process runner: imports ONE local prototype's `src/prototype.ts` under
 * tsx and reports its scenarios and database versions, optionally running the
 * generator for each scenario and checking referential integrity.
 *
 * This executes prototype code, so it is only for trusted prototypes in your
 * own workspace (the same trust level as `pnpm test`). Discovery and indexing
 * never use it. Output: one marker line followed by JSON on stdout.
 *
 *   tsx inspect-prototype.ts <prototypeDir> <workspaceRoot> [inspect|generate|spec] [scenarioId]
 *
 * `spec` adds raw facts for generated prototype docs: database store strings
 * per version, policy roles and rule names, the default scenario's personas,
 * scenario descriptions and generator knobs, themes, timeline presence,
 * generatorVersion and the `src/routes.ts` table. The CLI parses and sorts
 * them (lib/inspect.ts).
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire, register } from 'node:module';
import { dirname, join, resolve } from 'node:path';
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

function readManifest(path: string): { name?: unknown; exports?: Record<string, unknown> } | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as {
      name?: unknown;
      exports?: Record<string, unknown>;
    };
  } catch {
    return null;
  }
}

/**
 * Where `@protoyard/scenarios` lives for this prototype, without relying on
 * `require` conditions (a packed package exports `import` only): the nearest
 * `node_modules/@protoyard/scenarios` above the prototype or the root, else
 * this repository's `packages/scenarios`. NODE_PATH is ignored on purpose. The
 * same lookup as `findInstalledPackage` in lib/workspace.ts, kept local so the
 * runner stays dependency-light.
 */
export function scenariosEntry(dir: string, root: string): string | null {
  const name = '@protoyard/scenarios';
  const candidates: string[] = [];
  for (const base of [dir, root]) {
    for (let at = resolve(base); ; at = dirname(at)) {
      candidates.push(join(at, 'node_modules', '@protoyard', 'scenarios'));
      if (dirname(at) === at) break;
    }
  }
  candidates.push(join(root, 'packages', 'scenarios'));
  for (const pkg of candidates) {
    const manifest = readManifest(join(pkg, 'package.json'));
    if (manifest?.name !== name) continue;
    const target = manifest.exports?.['.'];
    const file =
      typeof target === 'string'
        ? target
        : target && typeof target === 'object'
          ? ((target as Record<string, unknown>).default ??
            (target as Record<string, unknown>).import)
          : undefined;
    if (typeof file === 'string' && file.startsWith('./') && existsSync(join(pkg, file))) {
      return join(pkg, file);
    }
  }
  return null;
}

/** The scenario SDK the prototype uses: its resolved `@protoyard/scenarios` entry. */
async function loadScenarioTools(dir: string, root: string): Promise<ScenarioTools> {
  let entry: string | null = null;
  try {
    entry = createRequire(join(dir, 'package.json')).resolve('@protoyard/scenarios');
  } catch {
    entry = scenariosEntry(dir, root);
  }
  if (!entry) {
    throw new Error(
      '@protoyard/scenarios is not installed for this prototype. Run `pnpm install` (or `npm install`) in the workspace root, then try again.'
    );
  }
  const mod = await importFile(entry);
  if (typeof mod.validateWorld !== 'function' || typeof mod.createGenerateContext !== 'function') {
    throw new Error(
      `${entry} is not a usable @protoyard/scenarios entry (no validateWorld/createGenerateContext).`
    );
  }
  return {
    resolveScenarios: mod.resolveScenarios as ScenarioTools['resolveScenarios'],
    presets: (mod.PRESETS ?? {}) as Record<string, unknown>,
    createGenerateContext: mod.createGenerateContext as ScenarioTools['createGenerateContext'],
    validateWorld: mod.validateWorld as ScenarioTools['validateWorld'],
    source: '@protoyard/scenarios',
  };
}

/**
 * `src/routes.ts` imports `defineRoutes` from @protoyard/renderer-svelte, whose
 * entry pulls in Svelte components Node cannot load. While loading that one
 * file, the specifier resolves to an identity `defineRoutes`; the screens are
 * lazy `load()` functions and never run here.
 */
async function loadRoutes(dir: string): Promise<{ routes: unknown[] | null; error?: string }> {
  const file = join(dir, 'src', 'routes.ts');
  if (!existsSync(file)) return { routes: null };
  const routesUrl = pathToFileURL(file).href;
  const shim = 'data:text/javascript,export%20const%20defineRoutes%3D(r)%3D%3Er%3B';
  const hooks = `export async function resolve(specifier, context, next) {
    if (specifier === '@protoyard/renderer-svelte' && context.parentURL === ${JSON.stringify(routesUrl)}) {
      return { url: ${JSON.stringify(shim)}, shortCircuit: true };
    }
    return next(specifier, context);
  }`;
  register(`data:text/javascript,${encodeURIComponent(hooks)}`);
  try {
    const mod = await importFile(file);
    const routes = mod.routes ?? mod.default;
    if (!Array.isArray(routes))
      return { routes: null, error: 'src/routes.ts does not export `routes`' };
    return {
      routes: routes.map((r: Record<string, unknown>) => ({
        path: r.path,
        name: r.name ?? r.title ?? null,
        description: r.description ?? null,
        capability: r.capability ?? null,
      })),
    };
  } catch (error) {
    return { routes: null, error: (error as Error).message };
  }
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
          // A world with no personas at all is a signed-out start (the runtime
          // accepts it; registration creates the first person), not a missing actor.
          const actorExists =
            world.personas.length === 0 || world.personas.some((p) => p.id === scenario.actor.id);
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
        // Fictional generated identities (id, name, first role) for `?actor=` links.
        const personas = world.personas.slice(0, 50).map((p) => ({
          id: p.id,
          name: p.name,
          role: world.memberships.find((m) => m.personaId === p.id)?.role ?? null,
        }));
        runs.push({
          id: scenario.id,
          ok: violations.length === 0,
          counts,
          personas,
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
  if (mode === 'spec') {
    const scenario =
      scenarios.find((s) => s.id === definition.manifest.defaultScenario) ?? scenarios[0];
    let personas: { id: string; name: string; role: string | null }[] = [];
    let personasError: string | undefined;
    if (scenario) {
      try {
        // In memory only: the generator's output, never written anywhere.
        const world = await definition.generate(tools.createGenerateContext(scenario));
        personas = world.personas.map((p) => ({
          id: p.id,
          name: p.name,
          role: world.memberships.find((m) => m.personaId === p.id)?.role ?? null,
        }));
      } catch (error) {
        personasError = (error as Error).message;
      }
    }
    const routes = await loadRoutes(dir);
    result.spec = {
      manifest: {
        id: definition.manifest.id,
        slug: definition.manifest.slug,
        name: definition.manifest.name,
        version: definition.manifest.version,
        platform: definition.manifest.platform,
        category: definition.manifest.category,
        defaultTheme: definition.manifest.defaultTheme,
        namespace: definition.manifest.storage.namespace,
      },
      generatorVersion: definition.generatorVersion ?? null,
      versions: definition.database.versions.map((v) => ({ version: v.version, stores: v.stores })),
      policy: definition.policy
        ? { roles: definition.policy.roles, rules: Object.keys(definition.policy.rules ?? {}) }
        : null,
      personasScenario: scenario?.id ?? null,
      personas,
      ...(personasError ? { personasError } : {}),
      scenarios: scenarios.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        group: s.group,
        version: s.version,
        seed: s.seed,
        density: s.density,
        tags: s.tags,
        // Knobs are data passed to the generator; round-trip to keep them JSON-safe.
        knobs: JSON.parse(JSON.stringify(s.generators ?? {})) as Record<string, unknown>,
        ...(s.appearance?.themeId ? { themeId: s.appearance.themeId } : {}),
      })),
      themes: (definition.themes ?? []).map((t) => ({ id: t.id, name: t.name })),
      timeline: typeof definition.timeline === 'function',
      routes: routes.routes,
      ...(routes.error ? { routesError: routes.error } : {}),
    };
  }
  process.stdout.write(`\n${RESULT_MARKER}${JSON.stringify(result)}\n`);
}

// Runs only as the child-process entry, so tests can import its helpers.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    process.stdout.write(
      `\n${RESULT_MARKER}${JSON.stringify({ fatal: (error as Error).message ?? String(error) })}\n`
    );
    process.exitCode = 1;
  });
}
