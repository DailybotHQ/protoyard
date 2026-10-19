import { fileURLToPath } from 'node:url';
import { CliError } from './output.ts';
import { resolvePackageBin, run } from './process.ts';

const RUNNER = fileURLToPath(new URL('../runners/inspect-prototype.ts', import.meta.url));
const RESULT_MARKER = '@@PROTOYARD_RESULT@@';

export interface InspectedScenario {
  id: string;
  name: string;
  group: string;
  version: number;
  seed: number;
  density: string;
}

export interface ScenarioRun {
  id: string;
  ok: boolean;
  counts?: Record<string, number>;
  /** Generated personas (first 50) with their first membership role. */
  personas?: { id: string; name: string; role: string | null }[];
  violationCount?: number;
  violations?: { table: string; rowId: string; field?: string; message: string }[];
  error?: string;
  durationMs: number;
}

export interface Inspection {
  validator: string;
  scenarios: InspectedScenario[];
  rawScenarioIds: string[];
  declared: string[];
  defaultScenario: string | null;
  databaseVersions: number[];
  /** Domain tables in the latest database version (reserved py_* tables excluded). */
  tables: string[];
  schemaVersion: number;
  runs?: ScenarioRun[];
  /** Raw facts from `spec` mode; use {@link inspectSpec} for the parsed, sorted form. */
  spec?: RawSpec;
}

/** One Dexie index (or primary key) parsed from a store string. */
export interface DexieIndex {
  /** Key path: `id`, `email`, or `[a+b]` for a compound index. */
  name: string;
  keyPath: string | string[];
  unique: boolean;
  multiEntry: boolean;
  autoIncrement: boolean;
}

export interface SpecTable {
  table: string;
  /** null for an outbound key (an empty first field in the store string). */
  primaryKey: DexieIndex | null;
  indexes: DexieIndex[];
}

export interface SpecVersion {
  version: number;
  tables: SpecTable[];
  /** Tables this version deletes (`null` store). */
  deleted: string[];
}

/** What the runner's `spec` mode prints, before parsing and sorting. */
export interface RawSpec {
  manifest: SpecFacts['manifest'];
  generatorVersion: number | null;
  versions: { version: number; stores: Record<string, string | null> }[];
  policy: { roles: Record<string, string[]>; rules: string[] } | null;
  personasScenario: string | null;
  personas: SpecPersona[];
  personasError?: string;
  scenarios: SpecScenario[];
  themes: { id: string; name: string }[];
  timeline: boolean;
  routes: SpecRoute[] | null;
  routesError?: string;
}

export interface SpecPersona {
  id: string;
  name: string;
  role: string | null;
}

export interface SpecScenario {
  id: string;
  name: string;
  description: string;
  group: string;
  version: number;
  seed: number;
  density: string;
  tags: string[];
  knobs: Record<string, unknown>;
  /** `appearance.themeId`, when the scenario sets one. */
  themeId?: string;
}

export interface SpecRoute {
  path: string;
  name: string | null;
  description: string | null;
  capability: string | null;
}

/**
 * Facts for generated spec regions (docs/SPECS.md), taken from the real
 * prototype definition. Every list is sorted by a stable key and nothing
 * depends on the clock or the machine, so the same code gives the same JSON.
 */
export interface SpecFacts {
  manifest: {
    id: string;
    slug: string;
    name: string;
    version: string;
    platform: string;
    category: string;
    defaultTheme: string;
    namespace: string;
  };
  generatorVersion: number | null;
  schemaVersion: number;
  versions: SpecVersion[];
  /** The latest store set: every table alive after all versions, with its latest definition. */
  tables: SpecTable[];
  policy: {
    roles: { role: string; capabilities: string[] }[];
    capabilities: string[];
    rules: string[];
  } | null;
  /** Default scenario whose generated personas are listed (fictional data). */
  personasScenario: string | null;
  personas: SpecPersona[];
  scenarios: SpecScenario[];
  themes: { id: string; name: string }[];
  timeline: boolean;
  /** Routes from `src/routes.ts`, in declaration order; null when the file is absent. */
  routes: SpecRoute[] | null;
  /** Why a part could not be extracted (the rest is still reported). */
  warnings: string[];
}

/**
 * Runs `runners/inspect-prototype.ts` under tsx in a child process. The
 * prototype's code executes there, never in the CLI process.
 */
export async function inspectPrototype(
  root: string,
  dir: string,
  mode: 'inspect' | 'generate' | 'spec',
  scenarioId?: string
): Promise<Inspection> {
  const tsx = resolvePackageBin('tsx', 'tsx', [root, dir]);
  if (!tsx)
    throw new CliError('not_found', 'tsx is not installed.', { hint: 'Run `pnpm install`.' });
  const args = [tsx, RUNNER, dir, root, mode, ...(scenarioId ? [scenarioId] : [])];
  const result = await run(process.execPath, args, { cwd: dir, timeoutMs: 180_000 });
  const marker = result.stdout.lastIndexOf(RESULT_MARKER);
  if (marker === -1) {
    const detail = (result.stderr || result.stdout || result.spawnError || '')
      .trim()
      .split('\n')
      .slice(-8)
      .join('\n');
    throw new CliError(
      'failure',
      `Could not load src/prototype.ts${result.timedOut ? ' (timed out)' : ''}.`,
      {
        hint: detail || 'The runner produced no output.',
      }
    );
  }
  const payload = JSON.parse(
    result.stdout
      .slice(marker + RESULT_MARKER.length)
      .trim()
      .split('\n')[0] ?? '{}'
  ) as Inspection | { fatal: string };
  if ('fatal' in payload) {
    throw new CliError('validation', `src/prototype.ts failed to load: ${payload.fatal}`);
  }
  return payload;
}

function parseIndex(raw: string, primary: boolean): DexieIndex {
  let spec = raw.trim();
  const autoIncrement = primary && spec.startsWith('++');
  if (autoIncrement) spec = spec.slice(2);
  const unique = spec.startsWith('&');
  if (unique) spec = spec.slice(1);
  const multiEntry = spec.startsWith('*');
  if (multiEntry) spec = spec.slice(1);
  const compound = /^\[(.+)\]$/.exec(spec);
  return {
    name: spec,
    keyPath: compound ? (compound[1] as string).split('+').map((p) => p.trim()) : spec,
    // Dexie: a primary key is always unique.
    unique: unique || primary,
    multiEntry,
    autoIncrement,
  };
}

/** Splits on commas outside `[…]` (compound indexes use `+`, but stay safe). */
function splitFields(store: string): string[] {
  const fields: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of store) {
    if (ch === '[') depth++;
    if (ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      fields.push(current);
      current = '';
    } else current += ch;
  }
  fields.push(current);
  return fields;
}

/** Parses a Dexie store string (`++id, &email, *tags, [orgId+createdAt]`). */
export function parseDexieStore(table: string, store: string): SpecTable {
  const [first = '', ...rest] = splitFields(store);
  return {
    table,
    primaryKey: first.trim() === '' ? null : parseIndex(first, true),
    indexes: rest
      .map((f) => f.trim())
      .filter(Boolean)
      .map((f) => parseIndex(f, false))
      .sort((a, b) => compare(a.name, b.name)),
  };
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Sorts object keys recursively so knobs serialize identically every time. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort(compare)
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])])
    );
  }
  return value;
}

/** Turns the runner's raw facts into sorted, parsed {@link SpecFacts}. */
export function toSpecFacts(raw: RawSpec, schemaVersion: number): SpecFacts {
  const versions: SpecVersion[] = [...raw.versions]
    .sort((a, b) => a.version - b.version)
    .map((v) => ({
      version: v.version,
      tables: Object.entries(v.stores)
        .filter((entry): entry is [string, string] => entry[1] !== null)
        .map(([table, store]) => parseDexieStore(table, store))
        .sort((a, b) => compare(a.table, b.table)),
      deleted: Object.entries(v.stores)
        .filter(([, store]) => store === null)
        .map(([table]) => table)
        .sort(compare),
    }));
  const latest = new Map<string, SpecTable>();
  for (const version of versions) {
    for (const table of version.tables) latest.set(table.table, table);
    for (const table of version.deleted) latest.delete(table);
  }
  const roles = raw.policy
    ? Object.entries(raw.policy.roles)
        .map(([role, caps]) => ({ role, capabilities: [...new Set(caps)].sort(compare) }))
        .sort((a, b) => compare(a.role, b.role))
    : [];
  const warnings = [
    ...(raw.personasError ? [`personas: ${raw.personasError}`] : []),
    ...(raw.routesError ? [`routes: ${raw.routesError}`] : []),
  ];
  return {
    manifest: raw.manifest,
    generatorVersion: raw.generatorVersion,
    schemaVersion,
    versions,
    tables: [...latest.values()].sort((a, b) => compare(a.table, b.table)),
    policy: raw.policy
      ? {
          roles,
          capabilities: [...new Set(roles.flatMap((r) => r.capabilities))].sort(compare),
          rules: [...raw.policy.rules].sort(compare),
        }
      : null,
    personasScenario: raw.personasScenario,
    personas: [...raw.personas].sort((a, b) => compare(a.id, b.id)),
    scenarios: [...raw.scenarios]
      .map((s) => ({
        ...s,
        tags: [...s.tags].sort(compare),
        knobs: sortKeys(s.knobs) as Record<string, unknown>,
      }))
      .sort((a, b) => compare(a.id, b.id)),
    themes: [...raw.themes].sort((a, b) => compare(a.id, b.id)),
    timeline: raw.timeline,
    // Declaration order is meaningful (it is the router's matching order).
    routes: raw.routes,
    warnings,
  };
}

/** Runs the prototype definition in a child process and returns its spec facts. */
export async function inspectSpec(root: string, dir: string): Promise<SpecFacts> {
  const inspection = await inspectPrototype(root, dir, 'spec');
  if (!inspection.spec) throw new CliError('failure', 'The inspect runner returned no spec facts.');
  return toSpecFacts(inspection.spec, inspection.schemaVersion);
}
