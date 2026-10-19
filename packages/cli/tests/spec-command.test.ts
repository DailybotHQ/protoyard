// @vitest-environment node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildRebuildKit,
  kitFiles,
  rebuildPrompt,
  specForPrototype,
} from '../src/commands/spec.ts';
import { checkSpec } from '../src/commands/validate.ts';
import { scanText } from '../src/lib/hygiene.ts';
import {
  type Inspection,
  inspectSpec,
  type RawSpec,
  type SpecFacts,
  toSpecFacts,
} from '../src/lib/inspect.ts';
import { workspacePaths } from '../src/lib/paths.ts';
import type { RegistryEntry } from '../src/lib/registry.ts';
import {
  closeMarker,
  openMarker,
  parseRegions,
  refreshRegions,
  regionsOf,
  renderRegion,
  SPEC_FILES,
  SpecMarkerError,
  skeleton,
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

describe('region rendering', () => {
  it('is deterministic and escapes table cells', () => {
    const manifest = renderRegion('manifest', facts);
    expect(renderRegion('manifest', structuredClone(facts))).toBe(manifest);
    expect(manifest).toContain('| name | Tasks \\| App |');
  });

  it('applies wildcard and denial semantics in the capability matrix', () => {
    const matrix = renderRegion('capability-matrix', facts);
    expect(matrix).toContain('| `billing:manage` |   |   |');
    expect(matrix).toContain('| `tasks:read` | ✓ | ✓ |');
    expect(matrix).toContain('| `tasks:update` | ✓ |   |');
    expect(matrix).toContain('`admin` holds every capability (`*`) except `billing:manage`');
  });

  it('infers ER relations from indexed …Id fields and states the heuristic', () => {
    const diagram = renderRegion('er-diagram', facts);
    expect(diagram).toContain('projects ||--o{ tasks : projectId');
    expect(diagram).toContain('string projectId FK');
    expect(diagram).toContain('Relations are inferred');
  });

  it('lists schema history and routes, or says routes are hand-written', () => {
    expect(renderRegion('versions', facts)).toContain('| 2 | — | `tasks` | — |');
    expect(renderRegion('routes', facts)).toContain(
      '| `#/tasks/:id` | Task | `tasks:read` | One task |'
    );
    expect(renderRegion('routes', { ...facts, routes: null })).toContain('No `src/routes.ts`');
  });
});

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

  it('builds skeletons whose regions are all present and fresh', () => {
    for (const file of SPEC_FILES) {
      const { regions } = refreshRegions(file, skeleton(file, facts), facts);
      expect(regions.map((r) => r.id).sort(), file).toEqual([...regionsOf(file)].sort());
      expect(
        regions.every((r) => r.status === 'fresh'),
        file
      ).toBe(true);
    }
    expect(skeleton('docs/SPEC.md', facts)).toContain('TODO: the product problem');
  });
});

describe('spec files on disk (real crm-demo facts)', { timeout: 120_000 }, () => {
  let crm: SpecFacts;
  let dir: string;
  beforeAll(async () => {
    crm = await inspectSpec(ROOT, join(ROOT, 'prototypes', 'crm-demo'));
    dir = mkdtempSync(join(tmpdir(), 'protoyard-spec-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('--init creates every file with fresh regions; without --init nothing is created', async () => {
    const none = await specForPrototype(dir, crm, { mode: 'write', init: false });
    expect(none.files.every((f) => !f.exists && !f.created)).toBe(true);
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(false);

    const created = await specForPrototype(dir, crm, { mode: 'write', init: true });
    expect(created.files.map((f) => [f.path, f.created])).toEqual(SPEC_FILES.map((f) => [f, true]));
    expect(created.stale).toBe(0);
    expect(readFileSync(join(dir, 'docs/SCREENS.md'), 'utf8')).toContain(
      '| `#/deals/:id` | Deal |'
    );
  });

  it('never overwrites prose on a second --init, and --check then --write follow the facts', async () => {
    const file = join(dir, 'docs/PERMISSIONS.md');
    const edited = readFileSync(file, 'utf8').replace(
      'TODO: what each rule means',
      'Reps may only change deals they own.'
    );
    writeFileSync(file, edited);
    await specForPrototype(dir, crm, { mode: 'write', init: true });
    expect(readFileSync(file, 'utf8')).toBe(edited);

    // The definition changes: a new persona appears.
    const changed: SpecFacts = {
      ...crm,
      personas: [...crm.personas, { id: 'zz_new', name: 'New Example', role: 'viewer' }],
    };
    const check = await specForPrototype(dir, changed, { mode: 'check', init: false });
    expect(check.stale).toBe(1);
    expect(check.files.find((f) => f.path === 'docs/PERMISSIONS.md')?.regions).toContainEqual({
      id: 'personas',
      status: 'stale',
    });
    expect(readFileSync(file, 'utf8')).toBe(edited);

    const write = await specForPrototype(dir, changed, { mode: 'write', init: false });
    expect(write.files.find((f) => f.path === 'docs/PERMISSIONS.md')?.updated).toBe(true);
    const after = readFileSync(file, 'utf8');
    expect(after).toContain('zz_new');
    expect(after).toContain('Reps may only change deals they own.');
    expect((await specForPrototype(dir, changed, { mode: 'check', init: false })).stale).toBe(0);
  });

  it('reports invalid markers per file instead of rewriting them', async () => {
    const file = join(dir, 'docs/SCREENS.md');
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n${openMarker('routes')}\n`);
    const result = await specForPrototype(dir, crm, { mode: 'write', init: false });
    expect(result.files.find((f) => f.path === 'docs/SCREENS.md')?.error).toMatch(
      /more than once|nesting|never closed/
    );
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

  it('rejects conflicting or missing arguments', async () => {
    expect(
      (await cli(['--root', ROOT, '--json', 'spec', 'crm-demo', '--write', '--check'])).code
    ).toBe(2);
    expect((await cli(['--root', ROOT, '--json', 'spec'])).code).toBe(2);
    expect((await cli(['--root', ROOT, '--json', 'spec', 'crm-demo', '--all'])).code).toBe(2);
    expect((await cli(['--root', ROOT, '--json', 'spec', 'no-such-app'])).code).toBe(3);
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

  it('validate: missing spec files warn, and fail with --strict-spec', async () => {
    const loose = await checkSpec(dir, 'notes-app', inspection(raw), false);
    expect(loose.status).toBe('warn');
    expect(loose.details).toContain('missing AGENTS.md');
    expect(loose.details).toContain('missing docs/SPEC.md');
    expect(loose.details.at(-1)).toContain('pnpm protoyard spec notes-app --init');
    expect((await checkSpec(dir, 'notes-app', inspection(raw), true)).status).toBe('fail');
  });

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

  it('validate: skips the spec check when the definition did not load', async () => {
    expect((await checkSpec(dir, 'notes-app', null, true)).status).toBe('skip');
  });

  it('validate: real prototypes: crm-demo and ui-kit pass --strict-spec', {
    timeout: 120_000,
  }, async () => {
    const validate = (slug: string, ...extra: string[]) =>
      cli(['--root', ROOT, '--json', 'validate', slug, '--skip-typecheck', ...extra]);
    const specOf = (run: Awaited<ReturnType<typeof validate>>) =>
      run
        .json<{ data: { checks: { id: string; status: string }[] } }>()
        .data.checks.find((c) => c.id === 'spec');

    for (const slug of ['crm-demo', 'ui-kit']) {
      const run = await validate(slug, '--strict-spec');
      expect(run.code, run.stdout).toBe(0);
      expect(specOf(run)?.status).toBe('pass');
    }
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

  it('bundle: kitFiles returns only allow-listed spec and domain files, sorted', async () => {
    expect(await kitFiles(dir())).toEqual([
      'AGENTS.md',
      'docs/DATA_MODEL.md',
      'docs/FLOWS.md',
      'docs/PERMISSIONS.md',
      'docs/SCREENS.md',
      'docs/SPEC.md',
      'protoyard.json',
      'src/database/schema.ts',
      'src/domain/policy.ts',
      'src/domain/services.ts',
      'src/prototype.ts',
      'src/scenarios/index.ts',
      'src/scenarios/nested/presets.ts',
    ]);
  });

  it('bundle: writes a deterministic ZIP with REBUILD.md first and the listed hashes', async () => {
    const spec = await specForPrototype(dir(), facts, { mode: 'check', init: false });
    const first = await buildRebuildKit(ctx(), entry, dir(), facts, spec);
    expect(first.path).toBe('artifacts/tasks-app/tasks-app-rebuild-kit.zip');
    const zip = unzipSync(new Uint8Array(readFileSync(kitPath())));
    expect(Object.keys(zip)).toEqual(['REBUILD.md', ...(await kitFiles(dir()))]);
    expect(
      Object.keys(zip).some((name) =>
        /\.svelte$|\.test\.ts$|\.env|\.png$|seed\.ts|notes\.txt/.test(name)
      )
    ).toBe(false);
    const prompt = new TextDecoder().decode(zip['REBUILD.md']);
    expect(prompt).toBe(rebuildPrompt(facts, first.files.slice(1)));
    expect(prompt).toContain('# Rebuild kit: Tasks | App (`tasks-app` v0.1.0)');
    expect(prompt).toContain('| `src/domain/services.ts` |');
    expect(prompt).toContain('ask before choosing any external vendor');
    const second = await buildRebuildKit(ctx(), entry, dir(), facts, spec);
    expect(second.sha256).toBe(first.sha256);
  });

  it('bundle: refuses a missing or stale spec', async () => {
    const stale = await specForPrototype(
      dir(),
      {
        ...facts,
        personas: [...facts.personas, { id: 'user_0009', name: 'Zed Example', role: 'viewer' }],
      },
      { mode: 'check', init: false }
    );
    await expect(buildRebuildKit(ctx(), entry, dir(), facts, stale)).rejects.toThrow(/not current/);
    const missing = {
      ...stale,
      stale: 0,
      files: stale.files.map((f) => (f.path === 'docs/SPEC.md' ? { ...f, exists: false } : f)),
    };
    await expect(buildRebuildKit(ctx(), entry, dir(), facts, missing)).rejects.toThrow(
      /missing docs\/SPEC\.md/
    );
  });

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

  it('bundle: scanText applies the hygiene rules and their exceptions', () => {
    expect(
      scanText('a.md', 'path /home/runner/work is fine\nsupport@dailybot.com is public')
    ).toEqual([]);
    // Built at runtime so this test file itself stays clean for the repository's hygiene check.
    const homePath = ['', 'Users', 'someone', 'x'].join('/');
    const privateEmail = ['alex', 'dailybot.com'].join('@');
    expect(
      scanText('a.md', `see ${homePath}\nmail ${privateEmail}`).map((f) => `${f.line} ${f.rule}`)
    ).toEqual(['1 personal-path', '2 private-email']);
  });

  it('bundle: crm-demo kit is produced from its real spec', { timeout: 120_000 }, async () => {
    const run = await cli(['--root', ROOT, '--json', 'spec', 'crm-demo', '--bundle']);
    expect(run.code, run.stdout).toBe(0);
    const kit = run.json<{
      data: { results: { bundle: { path: string; sha256: string; files: { path: string }[] } }[] };
    }>().data.results[0]?.bundle;
    expect(kit?.path).toBe('artifacts/crm-demo/crm-demo-rebuild-kit.zip');
    expect(kit?.sha256).toMatch(/^[0-9a-f]{64}$/);
    const names = kit?.files.map((f) => f.path) ?? [];
    expect(names[0]).toBe('REBUILD.md');
    expect(names).toEqual(
      expect.arrayContaining([
        'AGENTS.md',
        'docs/SPEC.md',
        'src/database/schema.ts',
        'src/domain/services.ts',
        'src/routes.ts',
      ])
    );
    expect(names.some((n) => n.endsWith('.svelte') || n.startsWith('tests/'))).toBe(false);
  });
});
