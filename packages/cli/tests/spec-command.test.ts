// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildRebuildKit, specForPrototype } from '../src/commands/spec.ts';
import { checkSpec } from '../src/commands/validate.ts';
import { type Inspection, type RawSpec, type SpecFacts, toSpecFacts } from '../src/lib/inspect.ts';
import { workspacePaths } from '../src/lib/paths.ts';
import type { RegistryEntry } from '../src/lib/registry.ts';
import {
  closeMarker,
  openMarker,
  parseRegions,
  refreshRegions,
  SpecMarkerError,
} from '../src/lib/spec-render.ts';
import type { CommandContext } from '../src/lib/workspace.ts';
import { cli } from './helpers.ts';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

const facts: SpecFacts = {
  manifest: {
    id: 'example.tasks',
    slug: 'tasks-app',
    name: 'Tasks | App',
    version: '0.1.0',
    platform: 'responsive',
    category: 'ops',
    defaultTheme: 'violet',
    namespace: 'tasks-app',
  },
  generatorVersion: 2,
  schemaVersion: 2,
  versions: [
    {
      version: 1,
      tables: [
        {
          table: 'projects',
          primaryKey: {
            name: 'id',
            keyPath: 'id',
            unique: true,
            multiEntry: false,
            autoIncrement: false,
          },
          indexes: [],
        },
        {
          table: 'tasks',
          primaryKey: {
            name: 'id',
            keyPath: 'id',
            unique: true,
            multiEntry: false,
            autoIncrement: false,
          },
          indexes: [
            {
              name: 'projectId',
              keyPath: 'projectId',
              unique: false,
              multiEntry: false,
              autoIncrement: false,
            },
          ],
        },
      ],
      deleted: [],
    },
    {
      version: 2,
      tables: [
        {
          table: 'tasks',
          primaryKey: {
            name: 'id',
            keyPath: 'id',
            unique: true,
            multiEntry: false,
            autoIncrement: false,
          },
          indexes: [
            {
              name: 'labels',
              keyPath: 'labels',
              unique: false,
              multiEntry: true,
              autoIncrement: false,
            },
            {
              name: 'projectId',
              keyPath: 'projectId',
              unique: false,
              multiEntry: false,
              autoIncrement: false,
            },
          ],
        },
      ],
      deleted: [],
    },
  ],
  tables: [],
  policy: {
    roles: [
      { role: 'admin', capabilities: ['*', '-billing:manage'] },
      { role: 'viewer', capabilities: ['tasks:read'] },
    ],
    capabilities: ['*', '-billing:manage', 'tasks:read'],
    rules: ['tasks:update'],
  },
  personasScenario: 'busy-team',
  personas: [{ id: 'user_0001', name: 'Ada Example', role: 'admin' }],
  scenarios: [
    {
      id: 'busy-team',
      name: 'Busy team',
      description: 'Many open tasks',
      group: 'General',
      version: 1,
      seed: 7,
      density: 'dense',
      tags: [],
      knobs: { tasks: { perPerson: 4 } },
    },
  ],
  themes: [],
  timeline: false,
  routes: [{ path: '/tasks/:id', name: 'Task', description: 'One task', capability: 'tasks:read' }],
  warnings: [],
};
facts.tables = [facts.versions[0]?.tables[0], facts.versions[1]?.tables[0]] as SpecFacts['tables'];

const region = (id: string, body: string) => `${openMarker(id)}${body}${closeMarker(id)}`;

describe('markers', () => {
  it('refuses unbalanced, stray, mismatched, nested and duplicate markers', () => {
    const bad = [
      [openMarker('tables'), /never closed/],
      [closeMarker('tables'), /no opening marker/],
      [`${openMarker('tables')}x${closeMarker('versions')}`, /closed by a marker for "versions"/],
      [`${openMarker('tables')}${openMarker('versions')}`, /no nesting/],
      [`${region('tables', 'a')}${region('tables', 'b')}`, /more than once/],
    ] as const;
    for (const [text, message] of bad) {
      expect(() => parseRegions('docs/DATA_MODEL.md', text)).toThrow(SpecMarkerError);
      expect(() => parseRegions('docs/DATA_MODEL.md', text)).toThrow(message);
    }
  });

  it('refreshes stale regions, keeps every byte outside the markers, and is idempotent', () => {
    const prose = '# Data\n\nHand-written intro with <b>html</b> and trailing spaces   \n\n';
    const middle = '\n\nMore prose.\r\nWindows line ending above.\n\n';
    const text = `${prose}${region('tables', '\nold table\n')}${middle}${region('custom-note', '\nmine\n')}\nend`;
    const first = refreshRegions('docs/DATA_MODEL.md', text, facts);
    expect(first.regions).toEqual([
      { id: 'tables', status: 'stale' },
      { id: 'custom-note', status: 'unknown' },
      { id: 'versions', status: 'absent' },
      { id: 'er-diagram', status: 'absent' },
    ]);
    expect(first.text.startsWith(`${prose}${openMarker('tables')}\n`)).toBe(true);
    expect(first.text).toContain(
      `${closeMarker('tables')}${middle}${region('custom-note', '\nmine\n')}\nend`
    );
    expect(first.text).not.toContain('old table');

    const second = refreshRegions('docs/DATA_MODEL.md', first.text, facts);
    expect(second.text).toBe(first.text);
    expect(second.regions.find((r) => r.id === 'tables')?.status).toBe('fresh');
  });
});

describe('protoyard spec (CLI)', { timeout: 120_000 }, () => {
  // Every prototype in the repository now ships a spec; the missing-files path is covered by
  // 'validate: missing spec files warn, and fail with --strict-spec' below.
  it('reports ui-kit spec files as present and current with --check', async () => {
    const run = await cli(['--root', ROOT, '--json', 'spec', 'ui-kit', '--check']);
    expect(run.code, run.stdout).toBe(0);
    const data = run.json<{
      data: {
        mode: string;
        stale: number;
        results: { slug: string; files: { exists: boolean }[] }[];
      };
    }>().data;
    expect(data).toMatchObject({ mode: 'check', stale: 0 });
    expect(data.results[0]?.files.every((f) => f.exists)).toBe(true);
  });
});

const toFacts = (spec: RawSpec) => toSpecFacts(spec, 1);

describe('validate spec check', () => {
  const raw: RawSpec = {
    manifest: facts.manifest,
    generatorVersion: 1,
    versions: [{ version: 1, stores: { notes: 'id, ownerId' } }],
    policy: { roles: { owner: ['*'] }, rules: [] },
    personasScenario: 'empty',
    personas: [{ id: 'user_0001', name: 'Ada Example', role: 'owner' }],
    scenarios: [],
    themes: [],
    timeline: false,
    routes: null,
  };
  const inspection = (spec: RawSpec) => ({ schemaVersion: 1, spec }) as unknown as Inspection;
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'protoyard-spec-validate-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('validate: current files pass, stale regions and invalid markers fail', async () => {
    await specForPrototype(dir, toFacts(raw), { mode: 'write', init: true });
    const fresh = await checkSpec(dir, 'notes-app', inspection(raw), true);
    expect(fresh).toMatchObject({ status: 'pass' });
    expect(fresh.details[0]).toMatch(/^6 files, \d+ generated regions current$/);

    const changed: RawSpec = {
      ...raw,
      personas: [...raw.personas, { id: 'user_0002', name: 'Bo Example', role: 'owner' }],
    };
    const stale = await checkSpec(dir, 'notes-app', inspection(changed), false);
    expect(stale.status).toBe('fail');
    expect(stale.details).toContain('docs/PERMISSIONS.md: region "personas" is stale');
    expect(stale.details).toContain('Run `pnpm protoyard spec notes-app --write`.');

    writeFileSync(join(dir, 'docs/SCREENS.md'), `${openMarker('routes')}\n`);
    const invalid = await checkSpec(dir, 'notes-app', inspection(raw), false);
    expect(invalid.status).toBe('fail');
    expect(invalid.details[0]).toMatch(/docs\/SCREENS\.md: region "routes" is never closed/);
  });
});

describe('rebuild kit (spec --bundle)', () => {
  let ws: string;
  const write = (rel: string, text: string) => {
    mkdirSync(join(ws, rel, '..'), { recursive: true });
    writeFileSync(join(ws, rel), text);
  };
  const dir = () => join(ws, 'prototypes', 'tasks-app');
  const ctx = () => ({ root: ws, paths: workspacePaths(ws) }) as unknown as CommandContext;
  const entry = { kind: 'prototype', slug: 'tasks-app' } as RegistryEntry;
  const kitPath = () => join(ws, 'artifacts', 'tasks-app', 'tasks-app-rebuild-kit.zip');

  beforeAll(async () => {
    ws = mkdtempSync(join(tmpdir(), 'protoyard-kit-'));
    const p = 'prototypes/tasks-app';
    for (const [rel, text] of Object.entries({
      'protoyard.json': '{"slug":"tasks-app"}\n',
      'src/prototype.ts': 'export const definition = {};\n',
      'src/database/schema.ts': 'export const schema = 1;\n',
      'src/domain/services.ts': 'export const services = {};\n',
      'src/domain/policy.ts': 'export const policy = {};\n',
      'src/scenarios/index.ts': 'export const scenarios = [];\n',
      'src/scenarios/nested/presets.ts': 'export const presets = [];\n',
      // Never bundled: not on the allow-list, a test, other extensions, secrets files.
      'src/App.svelte': '<p>app</p>\n',
      'src/screens/Home.svelte': '<p>home</p>\n',
      'src/domain/services.test.ts': 'test\n',
      'src/database/seed.ts': 'export {};\n',
      'docs/notes.txt': 'notes\n',
      'tests/services.test.ts': 'test\n',
      '.env': 'TOKEN=x\n',
      'public/thumbnail.png': 'png',
    })) {
      write(`${p}/${rel}`, text);
    }
    await specForPrototype(dir(), facts, { mode: 'write', init: true });
  });
  afterAll(() => rmSync(ws, { recursive: true, force: true }));

  it('bundle: refuses symlinks and hygiene findings without echoing the matched text', async () => {
    const spec = await specForPrototype(dir(), facts, { mode: 'check', init: false });
    rmSync(kitPath(), { force: true });
    const secret = `AKIA${'Q'.repeat(16)}`;
    const notes = join(dir(), 'src/domain/notes.ts');
    writeFileSync(notes, `// planted for the test\nexport const key = '${secret}';\n`);
    const error = await buildRebuildKit(ctx(), entry, dir(), facts, spec).catch(
      (e: { message: string; hint?: string }) => e
    );
    expect((error as { message: string }).message).toMatch(/public-hygiene/);
    expect((error as { hint: string }).hint).toBe('src/domain/notes.ts:2 secret-aws');
    expect(JSON.stringify(error)).not.toContain(secret);
    expect(existsSync(kitPath())).toBe(false);
    rmSync(notes);

    symlinkSync(join(ws, 'outside.ts'), join(dir(), 'src/domain/link.ts'));
    await expect(buildRebuildKit(ctx(), entry, dir(), facts, spec)).rejects.toThrow(/symlink/);
    rmSync(join(dir(), 'src/domain/link.ts'));
  });
});
