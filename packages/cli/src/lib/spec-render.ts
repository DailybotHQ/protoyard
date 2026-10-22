import type { DexieIndex, SpecFacts, SpecTable } from './inspect.ts';

/**
 * Generated regions of a prototype spec (docs/SPECS.md). Pure functions:
 * SpecFacts in, Markdown out, deterministic (sorted input from toSpecFacts,
 * no clock, no machine paths). Text between
 * `<!-- protoyard:generated:<id> -->` and `<!-- /protoyard:generated:<id> -->`
 * belongs to the CLI; everything outside the markers is hand-written prose
 * and is never touched.
 */

export const SPEC_FILES = [
  'AGENTS.md',
  'docs/SPEC.md',
  'docs/DATA_MODEL.md',
  'docs/FLOWS.md',
  'docs/SCREENS.md',
  'docs/PERMISSIONS.md',
] as const;
export type SpecFile = (typeof SPEC_FILES)[number];

export const SPEC_REGIONS = {
  commands: 'AGENTS.md',
  manifest: 'docs/SPEC.md',
  scenarios: 'docs/SPEC.md',
  tables: 'docs/DATA_MODEL.md',
  versions: 'docs/DATA_MODEL.md',
  'er-diagram': 'docs/DATA_MODEL.md',
  'capability-matrix': 'docs/PERMISSIONS.md',
  rules: 'docs/PERMISSIONS.md',
  personas: 'docs/PERMISSIONS.md',
  routes: 'docs/SCREENS.md',
  screens: 'docs/SCREENS.md',
} as const satisfies Record<string, SpecFile>;
export type SpecRegionId = keyof typeof SPEC_REGIONS;

export const regionsOf = (file: SpecFile): SpecRegionId[] =>
  (Object.keys(SPEC_REGIONS) as SpecRegionId[]).filter((id) => SPEC_REGIONS[id] === file);

export const openMarker = (id: string) => `<!-- protoyard:generated:${id} -->`;
export const closeMarker = (id: string) => `<!-- /protoyard:generated:${id} -->`;

const PLATFORM_TABLE = /^py_/;

/** Escapes a value for a Markdown table cell. */
function cell(value: unknown): string {
  const text = value === null || value === undefined || value === '' ? '—' : String(value);
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function table(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ].join('\n');
}

const code = (text: string) => `\`${text.replace(/`/g, "'")}\``;

function indexLabel(index: DexieIndex): string {
  const flags = [
    index.autoIncrement ? 'auto-increment' : '',
    index.unique ? 'unique' : '',
    index.multiEntry ? 'multi-entry' : '',
    Array.isArray(index.keyPath) ? 'compound' : '',
  ].filter(Boolean);
  return flags.length > 0 ? `${code(index.name)} (${flags.join(', ')})` : code(index.name);
}

function renderCommands(facts: SpecFacts): string {
  const slug = facts.manifest.slug;
  return [
    '```bash',
    `pnpm protoyard dev ${slug}                  # run it (DevTools included)`,
    `pnpm vitest run prototypes/${slug}          # unit + integration tests`,
    `pnpm protoyard validate ${slug} --build     # contract, schema, build`,
    `pnpm protoyard spec ${slug} --check         # generated spec regions are current`,
    `pnpm protoyard export ${slug}               # relocatable ZIP`,
    '```',
  ].join('\n');
}

function renderManifest(facts: SpecFacts): string {
  const m = facts.manifest;
  return table(
    ['Field', 'Value'],
    [
      ['id', code(m.id)],
      ['slug', code(m.slug)],
      ['name', m.name],
      ['version', m.version],
      ['platform', m.platform],
      ['category', m.category],
      ['default scenario', facts.personasScenario ? code(facts.personasScenario) : null],
      ['default theme', code(m.defaultTheme)],
      ['storage namespace', code(m.namespace)],
      ['schema version', facts.schemaVersion],
      ['generator version', facts.generatorVersion],
      ['timeline', facts.timeline ? 'yes (simulated time advances apply events)' : 'no'],
      [
        'themes',
        facts.themes.length > 0
          ? facts.themes.map((t) => `${t.name} (${code(t.id)})`).join(', ')
          : 'built-in presets only',
      ],
    ]
  );
}

function renderScenarios(facts: SpecFacts): string {
  if (facts.scenarios.length === 0) return '_No scenarios declared._';
  return table(
    ['Scenario', 'Name', 'Group', 'Density', 'Seed', 'Generator knobs', 'Description'],
    facts.scenarios.map((s) => [
      code(s.id),
      s.name,
      s.group,
      s.density,
      s.seed,
      Object.keys(s.knobs).length > 0 ? code(JSON.stringify(s.knobs)) : null,
      s.description,
    ])
  );
}

function renderTables(facts: SpecFacts): string {
  if (facts.manifest.blueprintKind && facts.manifest.blueprintKind !== 'app')
    return `_Entity tables do not apply to ${facts.manifest.blueprintKind} blueprints._`;
  const domain = facts.tables.filter((t) => !PLATFORM_TABLE.test(t.table));
  const platform = facts.tables.filter((t) => PLATFORM_TABLE.test(t.table));
  const out = [
    table(
      ['Table', 'Primary key', 'Indexes'],
      domain.map((t) => [
        code(t.table),
        t.primaryKey ? indexLabel(t.primaryKey) : 'outbound key',
        t.indexes.length > 0 ? t.indexes.map(indexLabel).join(', ') : null,
      ])
    ),
  ];
  if (platform.length > 0) {
    out.push(
      '',
      `Platform tables (identities, managed by Protoyard): ${platform.map((t) => code(t.table)).join(', ')}.`
    );
  }
  return out.join('\n');
}

function storeSignature(t: SpecTable): string {
  return JSON.stringify([t.primaryKey, t.indexes]);
}

function renderVersions(facts: SpecFacts): string {
  if (facts.manifest.blueprintKind && facts.manifest.blueprintKind !== 'app')
    return `_Entity schema versions do not apply to ${facts.manifest.blueprintKind} blueprints._`;
  const rows: unknown[][] = [];
  let previous = new Map<string, string>();
  for (const version of facts.versions) {
    const added: string[] = [];
    const changed: string[] = [];
    for (const t of version.tables) {
      const before = previous.get(t.table);
      if (before === undefined) added.push(code(t.table));
      else if (before !== storeSignature(t)) changed.push(code(t.table));
    }
    rows.push([
      version.version,
      added.join(', ') || null,
      changed.join(', ') || null,
      version.deleted.map(code).join(', ') || null,
    ]);
    const next = new Map(previous);
    for (const t of version.tables) next.set(t.table, storeSignature(t));
    for (const t of version.deleted) next.delete(t);
    previous = next;
  }
  return table(['Version', 'Adds', 'Changes indexes', 'Deletes'], rows);
}

/** `companyId` → the `companies` table, when one exists. Heuristic: stated in the output. */
function referencedTable(field: string, tables: ReadonlySet<string>): string | null {
  const match = /^(.+)Id$/.exec(field);
  if (!match) return null;
  const base = match[1] as string;
  const candidates = [
    `${base}s`,
    `${base}es`,
    base.endsWith('y') ? `${base.slice(0, -1)}ies` : '',
    base,
  ];
  return candidates.find((c) => c && tables.has(c)) ?? null;
}

function renderErDiagram(facts: SpecFacts): string {
  if (facts.manifest.blueprintKind && facts.manifest.blueprintKind !== 'app')
    return `_Entity diagrams do not apply to ${facts.manifest.blueprintKind} blueprints._`;
  const domain = facts.tables.filter((t) => !PLATFORM_TABLE.test(t.table));
  if (domain.length === 0) return '_No domain tables._';
  const names = new Set(domain.map((t) => t.table));
  const entity = (name: string) => name.replace(/[^A-Za-z0-9_]/g, '_');
  const lines = ['```mermaid', 'erDiagram'];
  const relations: string[] = [];
  for (const t of domain) {
    const fields: string[] = [];
    if (t.primaryKey && !Array.isArray(t.primaryKey.keyPath))
      fields.push(`    string ${t.primaryKey.keyPath} PK`);
    for (const index of t.indexes) {
      if (Array.isArray(index.keyPath)) continue;
      const target = referencedTable(index.keyPath, names);
      fields.push(`    string ${index.keyPath}${target ? ' FK' : ''}`);
      if (target)
        relations.push(`  ${entity(target)} ||--o{ ${entity(t.table)} : ${index.keyPath}`);
    }
    lines.push(`  ${entity(t.table)} {`, ...fields, '  }');
  }
  lines.push(
    ...relations,
    '```',
    '',
    '_Indexed fields only. Relations are inferred from indexed `…Id` fields that match a table name; describe the rest by hand._'
  );
  return lines.join('\n');
}

/** Same rule as createPermissionPolicy in @protoyard/core: a `-capability` denial always wins. */
function grants(capabilities: readonly string[], capability: string): boolean {
  if (capabilities.includes(`-${capability}`)) return false;
  return capabilities.includes('*') || capabilities.includes(capability);
}

function renderCapabilityMatrix(facts: SpecFacts): string {
  if (!facts.policy) return '_No policy: every persona can do everything (simulated permissions)._';
  const { roles, rules } = facts.policy;
  // Every capability the policy names: grants, denials (without the `-`) and rule keys.
  const capabilities = [
    ...new Set(
      [...roles.flatMap((r) => r.capabilities), ...rules]
        .filter((c) => c !== '*')
        .map((c) => c.replace(/^-/, ''))
    ),
  ].sort();
  const out = [
    table(
      ['Capability', ...roles.map((r) => code(r.role))],
      capabilities.map((c) => [
        code(c),
        ...roles.map((r) => (grants(r.capabilities, c) ? '✓' : ' ')),
      ])
    ),
  ];
  for (const role of roles.filter((r) => r.capabilities.includes('*'))) {
    const denied = role.capabilities.filter((c) => c.startsWith('-')).map((c) => code(c.slice(1)));
    out.push(
      '',
      `${code(role.role)} holds every capability (\`*\`)${denied.length > 0 ? ` except ${denied.join(', ')}` : ''}, including ones this table cannot list because no role names them.`
    );
  }
  return out.join('\n');
}

function renderRules(facts: SpecFacts): string {
  if (!facts.policy || facts.policy.rules.length === 0) return '_No record-level rules._';
  return facts.policy.rules.map((r) => `- ${code(r)}`).join('\n');
}

function renderPersonas(facts: SpecFacts): string {
  if (facts.personas.length === 0) return '_No personas generated._';
  return [
    `Generated by the ${facts.personasScenario ? code(facts.personasScenario) : 'default'} scenario (fictional people).`,
    '',
    table(
      ['Persona', 'Id', 'Role'],
      facts.personas.map((p) => [p.name, code(p.id), p.role ? code(p.role) : null])
    ),
  ].join('\n');
}

function renderRoutes(facts: SpecFacts): string {
  if (facts.routes === null) {
    return '_No `src/routes.ts`: this prototype declares its routes in `src/App.svelte`. List the screens by hand below._';
  }
  return table(
    ['Route', 'Screen', 'Capability', 'Description'],
    facts.routes.map((r) => [
      code(`#${r.path}`),
      r.name,
      r.capability ? code(r.capability) : null,
      r.description,
    ])
  );
}

function renderScreens(facts: SpecFacts): string {
  if (facts.routes === null) return '_No generated route map; list the screens by hand._';
  if (facts.routes.length === 0) return '_No routes declared._';
  return table(
    ['Screen', 'Route', 'Description'],
    facts.routes.map((route) => [route.name, code(`#${route.path}`), route.description])
  );
}

const RENDERERS: Record<SpecRegionId, (facts: SpecFacts) => string> = {
  commands: renderCommands,
  manifest: renderManifest,
  scenarios: renderScenarios,
  tables: renderTables,
  versions: renderVersions,
  'er-diagram': renderErDiagram,
  'capability-matrix': renderCapabilityMatrix,
  rules: renderRules,
  personas: renderPersonas,
  routes: renderRoutes,
  screens: renderScreens,
};

export function renderRegion(id: SpecRegionId, facts: SpecFacts): string {
  return RENDERERS[id](facts);
}

export class SpecMarkerError extends Error {
  readonly file: string;
  constructor(file: string, message: string) {
    super(`${file}: ${message}`);
    this.name = 'SpecMarkerError';
    this.file = file;
  }
}

export interface ParsedRegion {
  id: string;
  /** Offsets of the text between the markers. */
  start: number;
  end: number;
  content: string;
}

const MARKER = /<!-- (\/?)protoyard:generated:([a-z0-9-]+) -->/g;

/** Finds every region; refuses unbalanced, nested or duplicate markers. */
export function parseRegions(file: string, text: string): ParsedRegion[] {
  const regions: ParsedRegion[] = [];
  const seen = new Set<string>();
  let open: { id: string; end: number } | null = null;
  for (const match of text.matchAll(MARKER)) {
    const closing = match[1] === '/';
    const id = match[2] as string;
    const index = match.index ?? 0;
    if (!closing) {
      if (open)
        throw new SpecMarkerError(
          file,
          `region "${id}" opens inside region "${open.id}" (no nesting).`
        );
      if (seen.has(id)) throw new SpecMarkerError(file, `region "${id}" appears more than once.`);
      open = { id, end: index + match[0].length };
      continue;
    }
    if (!open) throw new SpecMarkerError(file, `closing marker for "${id}" has no opening marker.`);
    if (open.id !== id)
      throw new SpecMarkerError(file, `region "${open.id}" is closed by a marker for "${id}".`);
    regions.push({ id, start: open.end, end: index, content: text.slice(open.end, index) });
    seen.add(id);
    open = null;
  }
  if (open) throw new SpecMarkerError(file, `region "${open.id}" is never closed.`);
  return regions;
}

/** The exact text the CLI keeps between a region's markers. */
export const regionBody = (rendered: string) => `\n${rendered}\n`;

export interface RegionStatus {
  id: string;
  status: 'fresh' | 'stale' | 'absent' | 'unknown';
}

/**
 * Replaces the known regions of `text` with freshly rendered content and
 * reports each region's state. Bytes outside the markers are untouched.
 */
export function refreshRegions(
  file: SpecFile,
  text: string,
  facts: SpecFacts
): { text: string; regions: RegionStatus[] } {
  const parsed = parseRegions(file, text);
  const expected = regionsOf(file);
  const statuses: RegionStatus[] = [];
  let out = '';
  let cursor = 0;
  for (const region of parsed) {
    if (!(expected as string[]).includes(region.id)) {
      statuses.push({ id: region.id, status: 'unknown' });
      continue;
    }
    const body = regionBody(renderRegion(region.id as SpecRegionId, facts));
    statuses.push({ id: region.id, status: region.content === body ? 'fresh' : 'stale' });
    out += text.slice(cursor, region.start) + body;
    cursor = region.end;
  }
  out += text.slice(cursor);
  for (const id of expected) {
    if (!parsed.some((r) => r.id === id)) statuses.push({ id, status: 'absent' });
  }
  return { text: out, regions: statuses };
}

const region = (id: SpecRegionId, facts: SpecFacts) =>
  `${openMarker(id)}${regionBody(renderRegion(id, facts))}${closeMarker(id)}`;

/** Skeleton for a missing spec file: TODO prompts for prose, filled generated regions. */
export function skeleton(file: SpecFile, facts: SpecFacts): string {
  const name = facts.manifest.name;
  const slug = facts.manifest.slug;
  switch (file) {
    case 'AGENTS.md':
      return `# AGENTS.md — ${name} (\`${slug}\`)

The entry point for agents working on this prototype. Repository-wide rules
live in the root [AGENTS.md](../../AGENTS.md); the spec standard is
[docs/SPECS.md](../../docs/SPECS.md).

## Index

- [docs/SPEC.md](docs/SPEC.md): problem, users, capabilities, honest boundaries, rebuild path
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): tables, indexes, relations, schema versions
- [docs/FLOWS.md](docs/FLOWS.md): user flows mapped to services, capabilities and tables
- [docs/SCREENS.md](docs/SCREENS.md): routes, screens and their states
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md): roles × capabilities, rules, personas

## Rules for this prototype

TODO: only what is specific to this prototype (units, invariants, ownership rules). Do not copy the root rules.

## Quick commands

${region('commands', facts)}
`;
    case 'docs/SPEC.md':
      return `# ${name}: spec

## Problem

TODO: the product problem in two or three sentences.

## Users

TODO: who uses it, mapped to the roles in [PERMISSIONS.md](PERMISSIONS.md).

## Capabilities

TODO: what a user can do, one line each, linked to [FLOWS.md](FLOWS.md).

## Non-goals

TODO: what this prototype deliberately does not do.

## Scenarios

${region('scenarios', facts)}

## Honest boundaries

TODO: name every simulated part plainly (data in the visitor's browser, personas instead of authentication, simulated permissions, payments, network and time). See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

TODO: for each prototype piece (schema, services, policy, personas, environment failures, scenarios, screens), the real counterpart to design. See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

${region('manifest', facts)}
`;
    case 'docs/DATA_MODEL.md':
      return `# ${name}: data model

## Overview

TODO: the domain in words, and why the model looks this way.

## Tables

${region('tables', facts)}

## Diagram

${region('er-diagram', facts)}

## Relations

TODO: foreign keys and cardinalities the diagram cannot infer.

## Field notes

TODO: units (integer cents, ISO dates), enums and invariants.

## Schema history

${region('versions', facts)}

## Migrations

TODO: what each \`upgrade\` does to existing rows.
`;
    case 'docs/FLOWS.md':
      return `# ${name}: flows

Each flow ends in the service layer: UI → service → \`session.assert\` → zod →
\`environment.run\` → \`db.transaction\`. Every mutation in
\`src/domain/services.ts\` should appear in at least one flow.

## TODO: first flow

1. TODO: where the user starts and what they do.
2. Service: TODO \`service.method(args)\` in src/domain/services.ts
3. Capability: TODO
4. Writes: TODO tables and fields
5. Failure states: permission denied, simulated offline (nothing written)
`;
    case 'docs/SCREENS.md':
      return `# ${name}: screens

## Routes

${region('routes', facts)}

## Screens

${region('screens', facts)}

Describe the data, actions, and empty, loading, error and denied states for each screen above.

## Shell

TODO: the device or host shell and viewport this prototype is designed for (\`preview\` in protoyard.json).
`;
    case 'docs/PERMISSIONS.md':
      return `# ${name}: permissions

Simulated permissions: UX only, not security. Services enforce them with
\`session.assert\`, so a forbidden action fails even when the UI is bypassed.

## Capability matrix

${region('capability-matrix', facts)}

## Record-level rules

${region('rules', facts)}

TODO: what each rule means (rules are functions, so only their names are generated).

## Personas

${region('personas', facts)}
`;
  }
}
