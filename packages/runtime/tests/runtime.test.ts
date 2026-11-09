import {
  defineTheme,
  PermissionDeniedError,
  type PrototypeDefinition,
  type PrototypeRuntime,
  parseScenario,
  ThemePaletteSchema,
  ValidationError,
} from '@protoyard/core';
import { dumpTables, type PrototypeDatabase } from '@protoyard/database';
import { createGenerateContext, GENERATOR_SDK_VERSION, PRESETS } from '@protoyard/scenarios';
import { createThemeFromSeed } from '@protoyard/themes';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  createPrototypeRuntime,
  IdentityValidationError,
  type MatchMedia,
  type ProtoyardRuntime,
  type RuntimeOptions,
  SNAPSHOT_MAX_ROWS,
  SnapshotImportError,
} from '../src/index.ts';
import { loadCustomThemes } from '../src/theme.ts';
import { createTasksDefinition, REFERENCE_TIME, type Task } from './fixtures/tasks-prototype.ts';

const palette = Object.fromEntries(
  Object.keys(ThemePaletteSchema.shape).map((key) => [key, '#123456'])
) as never;
const themes = [
  defineTheme({ id: 'violet', name: 'Violet', light: palette, dark: palette }),
  defineTheme({ id: 'ocean', name: 'Ocean', light: palette, dark: palette }),
];

function fakeMedia(initialDark = false) {
  let dark = initialDark;
  const listeners = new Set<() => void>();
  const matchMedia: MatchMedia = (query) =>
    ({
      get matches() {
        return query.includes('dark') ? dark : false;
      },
      addEventListener: (_type: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_type: string, fn: () => void) => listeners.delete(fn),
    }) as never;
  return {
    matchMedia,
    setDark(next: boolean) {
      dark = next;
      for (const fn of listeners) fn();
    },
  };
}

const open: ProtoyardRuntime[] = [];

function backend() {
  return { indexedDB: new IDBFactory() as unknown as globalThis.IDBFactory, IDBKeyRange };
}

async function start(
  definition: PrototypeDefinition,
  store: ReturnType<typeof backend>,
  extra: RuntimeOptions = {}
) {
  const runtime = await createPrototypeRuntime(definition, {
    themes,
    sleep: async () => {},
    now: () => Date.parse('2026-10-17T12:00:00.000Z'),
    matchMedia: fakeMedia().matchMedia,
    ...store,
    ...extra,
  });
  open.push(runtime);
  return runtime;
}

afterEach(() => {
  for (const runtime of open.splice(0)) runtime.close();
});

describe('1. deterministic generation', () => {
  it('builds a deep-equal world for the same seed/time/version and a different one otherwise', async () => {
    const definition = createTasksDefinition();
    const scenario = parseScenario({
      ...PRESETS['active-month'],
      seed: 42,
      referenceTime: REFERENCE_TIME,
    });
    const a = await definition.generate(createGenerateContext(scenario));
    const b = await definition.generate(createGenerateContext(scenario));
    expect(a).toEqual(b);
    const c = await definition.generate(createGenerateContext({ ...scenario, seed: 43 }));
    expect(c).not.toEqual(a);

    // Same through the runtime, across two independent databases.
    const r1 = await start(definition, backend());
    const r2 = await start(definition, backend());
    await r1.scenarios.ensureSeeded();
    await r2.scenarios.ensureSeeded();
    expect(await dumpTables(r1.db)).toEqual(await dumpTables(r2.db));
    expect(r1.scenarios.active()).toMatchObject({
      seed: 42,
      generatorVersion: GENERATOR_SDK_VERSION,
      prototypeGeneratorVersion: 3,
    });
  });
});

describe('3. personas and permissions', () => {
  it('switching persona keeps records; a viewer is blocked at service level', async () => {
    const runtime = await start(createTasksDefinition(), backend());
    await runtime.scenarios.ensureSeeded();
    const before = await dumpTables(runtime.db);
    const other = runtime.session.personas().find((p) => p.id !== 'user_0001');
    expect(other).toBeDefined();
    await runtime.session.switchActor(other?.id as string);
    expect(runtime.session.principal()?.persona.id).toBe(other?.id);
    expect(await dumpTables(runtime.db)).toEqual(before);

    await runtime.scenarios.load('viewer');
    expect(runtime.session.principal()?.role).toBe('viewer');
    expect(runtime.session.can('tasks:read')).toBe(true);
    expect(() => runtime.session.assert('tasks:create')).toThrow(PermissionDeniedError);
    await expect(runtime.session.switchActor('nobody')).rejects.toThrow(/Unknown persona/);
  });
});

describe('5. snapshots', () => {
  it('save → mutate → restore gives back the exact world and session', async () => {
    const runtime = await start(createTasksDefinition(), backend());
    await runtime.scenarios.ensureSeeded();
    await runtime.session.switchActor(runtime.session.personas()[2]?.id as string);
    await runtime.overrides.set({ environment: { latencyMs: 100 } });
    const before = await dumpTables(runtime.db);
    const actor = runtime.session.principal()?.persona.id;
    const summary = await runtime.snapshots.save({ name: 'Before chaos', notes: 'n' });

    await runtime.db.rows<Task>('tasks').clear();
    await runtime.db.rows('projects').put({ id: 'project_x', name: 'X' });
    await runtime.session.switchActor('user_0001');
    await runtime.overrides.clear();
    runtime.clock.preview({ days: 3 });

    await runtime.snapshots.restore(summary.id);
    expect(await dumpTables(runtime.db)).toEqual(before);
    expect(runtime.session.principal()?.persona.id).toBe(actor);
    expect(runtime.overrides.get()).toEqual({ environment: { latencyMs: 100 } });
    expect(runtime.clock.isPreviewing()).toBe(false);
    expect((await runtime.snapshots.list()).map((s) => s.name)).toEqual(['Before chaos']);
  });

  it('export/import round-trips and bad files leave data untouched', async () => {
    const store = backend();
    const runtime = await start(createTasksDefinition(), store);
    await runtime.scenarios.ensureSeeded();
    const world = await dumpTables(runtime.db);
    const saved = await runtime.snapshots.save({ name: 'Demo state' });
    const { filename, json } = await runtime.snapshots.exportJson(saved.id);
    expect(filename).toBe('tasks-fixture-demo-state-2026-10-17.protoyard.json');

    await runtime.db.rows('tasks').clear();
    const preview = await runtime.snapshots.previewImport(json);
    expect(preview.rowCounts.tasks).toBe(world.find((t) => t.name === 'tasks')?.rows.length);
    const imported = await runtime.snapshots.importJson(json, { restore: true });
    expect(imported.id).not.toBe(saved.id);
    expect(await dumpTables(runtime.db)).toEqual(world);

    const current = await dumpTables(runtime.db);
    const foreign = JSON.stringify({ ...JSON.parse(json), prototypeId: 'example.other' });
    await expect(runtime.snapshots.importJson(foreign, { restore: true })).rejects.toThrow(
      SnapshotImportError
    );
    await expect(runtime.snapshots.importJson('{ not json', { restore: true })).rejects.toThrow(
      /not valid JSON/
    );
    const badRows = JSON.parse(json);
    badRows.tables.find((t: { name: string }) => t.name === 'tasks').rows.push({ title: 'no id' });
    await expect(
      runtime.snapshots.importJson(JSON.stringify(badRows), { restore: true })
    ).rejects.toThrow();
    expect(await dumpTables(runtime.db)).toEqual(current);
    expect((await runtime.snapshots.list()).length).toBe(2);

    // Another prototype on the same origin imports into itself only.
    const other = await start(createTasksDefinition({ namespace: 'other-fixture' }), store);
    await expect(other.snapshots.previewImport(json)).rejects.toThrow(/belongs to/);
  });
});

describe('6. migrations', () => {
  it('v1 → v2 keeps existing rows (including edits) and transforms them', async () => {
    const store = backend();
    const v1 = await start(createTasksDefinition(), store);
    await v1.scenarios.ensureSeeded();
    await v1.db.rows<Task>('tasks').put({
      id: 'task_mine',
      projectId: 'project_0001',
      assigneeId: null,
      title: 'My edit',
      status: 'doing',
      createdAt: REFERENCE_TIME,
    });
    const count = await v1.db.rows('tasks').count();
    v1.close();

    const v2 = await start(createTasksDefinition({ withV2: true }), store);
    await v2.scenarios.ensureSeeded();
    const tasks = await v2.db.rows<Task>('tasks').toArray();
    expect(tasks).toHaveLength(count);
    expect(tasks.find((t) => t.id === 'task_mine')).toMatchObject({
      title: 'My edit',
      priority: 'high',
    });
    expect(tasks.every((t) => t.priority === 'high' || t.priority === 'normal')).toBe(true);
    expect(
      await v2.db.rows<Task>('tasks').where('priority').equals('high').count()
    ).toBeGreaterThan(0);
    v2.close();

    await expect(start(createTasksDefinition(), store)).rejects.toMatchObject({
      code: 'version-newer',
    });
  });
});

describe('8. time advance', () => {
  it('7 × 1 day equals 1 × 7 days, and replays apply nothing', async () => {
    const a = await start(createTasksDefinition(), backend());
    const b = await start(createTasksDefinition(), backend());
    await a.scenarios.ensureSeeded();
    await b.scenarios.ensureSeeded();

    let appliedA = 0;
    for (let day = 0; day < 7; day++) appliedA += (await a.scenarios.advance({ days: 1 })).applied;
    const resultB = await b.scenarios.advance({ days: 7 });
    expect(appliedA).toBeGreaterThan(0);
    expect(resultB.applied).toBe(appliedA);
    expect(await dumpTables(a.db)).toEqual(await dumpTables(b.db));
    expect(a.clock.committed().toISOString()).toBe('2026-06-08T09:00:00.000Z');

    // Re-running the same window (clock moved back by a snapshot restore) applies nothing.
    const snap = await b.snapshots.save({ name: 'after week' });
    await b.snapshots.restore(snap.id);
    b.clock.setState({ ...b.clock.getState(), committedOffsetMs: 0 });
    const replay = await b.scenarios.advance({ days: 7 });
    expect(replay).toEqual({ applied: 0, skipped: resultB.applied });
  });
});

describe('9. isolation', () => {
  it('loading or destroying prototype A never touches prototype B', async () => {
    const store = backend();
    const a = await start(createTasksDefinition({ namespace: 'proto-a' }), store);
    const b = await start(createTasksDefinition({ namespace: 'proto-b' }), store);
    await a.scenarios.ensureSeeded();
    await b.scenarios.ensureSeeded();
    await b.db.rows('tasks').put({ id: 'task_b_edit', projectId: 'project_0001', title: 'B' });
    await b.snapshots.save({ name: 'b snapshot' });
    const bWorld = await dumpTables(b.db);

    await a.scenarios.load('empty');
    await a.scenarios.reset();
    expect(await a.db.rows('tasks').count()).toBe(0);
    expect(await dumpTables(b.db)).toEqual(bWorld);

    await a.destroy();
    expect(a.closed).toBe(true);
    expect(await dumpTables(b.db)).toEqual(bWorld);
    expect(await b.snapshots.list()).toHaveLength(1);
    const names = (await store.indexedDB.databases()).map((d) => d.name).sort();
    expect(names).toEqual(['protoyard.proto-b.control', 'protoyard.proto-b.data']);
  });
});

describe('hostile snapshot files', () => {
  async function exported() {
    const runtime = await start(createTasksDefinition(), backend());
    await runtime.scenarios.ensureSeeded();
    const { json } = await runtime.snapshots.exportJson();
    return { runtime, snapshot: JSON.parse(json) };
  }

  it('rejects an impossible clock BEFORE touching records', async () => {
    const { runtime, snapshot } = await exported();
    const before = await dumpTables(runtime.db);
    snapshot.tables.find((t: { name: string }) => t.name === 'tasks').rows = [
      { id: 'evil', projectId: 'project_0001', title: 'from the file' },
    ];
    for (const clock of [
      { ...snapshot.clock, referenceTime: 'garbage' },
      { ...snapshot.clock, committedOffsetMs: 9_000_000_000_000_000 },
    ]) {
      const text = JSON.stringify({ ...snapshot, clock });
      await expect(runtime.snapshots.previewImport(text)).rejects.toThrow(
        /not a valid point in time/
      );
      await expect(runtime.snapshots.importJson(text, { restore: true })).rejects.toThrow(
        /Nothing was changed/
      );
      expect(await dumpTables(runtime.db)).toEqual(before);
    }
    expect(await runtime.snapshots.list()).toEqual([]);
  });

  it('rejects rows without a usable id and oversized worlds with a clear message', async () => {
    const { runtime, snapshot } = await exported();
    const before = await dumpTables(runtime.db);
    const tasks = snapshot.tables.find((t: { name: string }) => t.name === 'tasks');
    tasks.rows.push({ id: { nested: 1 }, title: 'x' });
    await expect(
      runtime.snapshots.importJson(JSON.stringify(snapshot), { restore: true })
    ).rejects.toThrow(/table "tasks" has no valid id/);
    tasks.rows = Array.from({ length: SNAPSHOT_MAX_ROWS + 1 }, (_, i) => ({ id: `t${i}` }));
    await expect(runtime.snapshots.previewImport(JSON.stringify(snapshot))).rejects.toThrow(
      /more than 250,000 rows/
    );
    expect(await dumpTables(runtime.db)).toEqual(before);
  });

  it('never pollutes prototypes through __proto__ / constructor keys', async () => {
    const { runtime, snapshot } = await exported();
    const text = JSON.stringify(snapshot)
      .replace(
        '"rows":[{',
        '"rows":[{"__proto__":{"polluted":true},"constructor":{"prototype":{"isAdmin":true}},'
      )
      .replace('"overrides":{}', '"overrides":{"__proto__":{"role":"viewer"}}');
    await runtime.snapshots.importJson(text, { restore: true });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    expect(runtime.overrides.get()).toEqual({});
    for (const table of await dumpTables(runtime.db)) {
      for (const row of table.rows) {
        expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
        expect(Object.hasOwn(row, '__proto__')).toBe(false);
      }
    }
  });
});

describe('simulated sign-in (signed out sessions)', () => {
  it('signs out to a null principal, never signs in on switch, and signs in explicitly', async () => {
    const runtime = await start(createTasksDefinition(), backend());
    await runtime.scenarios.ensureSeeded();
    const before = await dumpTables(runtime.db);
    const seen: (string | null)[] = [];
    runtime.session.subscribe((p) => seen.push(p?.persona.id ?? null));

    await runtime.session.signOut();
    expect(runtime.session.principal()).toBeNull();
    expect(runtime.session.isSignedIn()).toBe(false);
    expect(runtime.session.authState()).toBe('signed-out');
    expect(runtime.session.personas().length).toBeGreaterThan(1);
    expect(runtime.session.can('tasks:read')).toBe(false);
    expect(() => runtime.session.assert('tasks:read')).toThrow(PermissionDeniedError);

    const other = runtime.session.personas()[1]?.id as string;
    await runtime.session.switchActor(other);
    expect(runtime.session.principal()).toBeNull();

    await runtime.session.signIn(other);
    expect(runtime.session.principal()?.persona.id).toBe(other);
    expect(runtime.session.isSignedIn()).toBe(true);
    await expect(runtime.session.signIn('nobody')).rejects.toThrow(/Unknown persona/);
    expect(seen).toEqual([null, other]);
    expect(await dumpTables(runtime.db)).toEqual(before);
  });
});

describe('runtime identity writes', () => {
  it('rejects an unsafe persona avatar before writing anything', async () => {
    const runtime = await start(createTasksDefinition(), backend());
    await runtime.scenarios.ensureSeeded();
    const before = await dumpTables(runtime.db);
    for (const avatar of [
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      '//x.example.com/a',
    ]) {
      const write = runtime.identity.write((ops) => ops.putPersona({ name: 'Unsafe', avatar }));
      await expect(write).rejects.toBeInstanceOf(IdentityValidationError);
      await expect(write).rejects.toMatchObject({ issues: { avatar: expect.any(String) } });
    }
    expect(await dumpTables(runtime.db)).toEqual(before);
    runtime.close();
  });

  it('validates before writing and rolls back the whole transaction on failure', async () => {
    const runtime = await start(createTasksDefinition(), backend());
    await runtime.scenarios.ensureSeeded();
    const before = await dumpTables(runtime.db);

    const invalid = runtime.identity.write((ops) => ops.putPersona({ name: '' }));
    await expect(invalid).rejects.toBeInstanceOf(IdentityValidationError);
    await expect(invalid).rejects.toMatchObject({ issues: { name: expect.any(String) } });

    const orphan = runtime.identity.write(async (ops) => {
      const organization = await ops.putOrganization({ name: 'Rolled back' });
      return ops.putMembership({
        personaId: 'nobody',
        organizationId: organization.id,
        role: 'member',
      });
    });
    await expect(orphan).rejects.toMatchObject({ issues: { personaId: expect.any(String) } });

    const actor = runtime.session.principal();
    const duplicate = runtime.identity.write((ops) =>
      ops.putMembership({
        personaId: actor?.persona.id as string,
        organizationId: actor?.organization?.id as string,
        role: 'viewer',
      })
    );
    await expect(duplicate).rejects.toMatchObject({
      issues: { organizationId: expect.stringMatching(/already belongs/) },
    });
    await expect(runtime.identity.write(() => undefined, { tables: ['missing'] })).rejects.toThrow(
      /Unknown table "missing"/
    );
    expect(await dumpTables(runtime.db)).toEqual(before);
  });
});

describe('untrusted themes and style overrides', () => {
  const sunset = () => createThemeFromSeed({ id: 'sunset', name: 'Sunset', seed: '#e8590c' });
  const issuesOf = async (promise: Promise<unknown>) => {
    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    return (error as ValidationError).issues;
  };

  it('importTheme refuses malformed JSON, files over the size cap and CSS injection', async () => {
    const runtime = await start(createTasksDefinition(), backend());
    expect(await issuesOf(runtime.theme.importTheme('{nope'))).toEqual({
      form: 'That is not valid JSON.',
    });
    expect((await issuesOf(runtime.theme.importTheme(' '.repeat(70_000)))).form).toMatch(
      /too large/
    );
    const injected = { ...sunset(), style: { shape: { borderWidth: '1px; color: red' } } };
    expect(await issuesOf(runtime.theme.importTheme(JSON.stringify(injected)))).toHaveProperty([
      'style.shape.borderWidth',
    ]);
    expect(await issuesOf(runtime.theme.saveCustom({ ...sunset(), id: 'violet' }))).toHaveProperty(
      'id'
    );
    expect(runtime.theme.customThemes()).toEqual([]);
  });

  it('loadCustomThemes skips malformed, injected and clashing stored themes', () => {
    const errors: unknown[] = [];
    const list = [...themes];
    const ids = loadCustomThemes(
      [
        sunset(),
        { ...sunset(), id: 'violet' },
        { id: 'broken', name: 'Broken' },
        { ...sunset(), id: 'evil', style: { shape: { borderWidth: '1px; color: red' } } },
      ],
      list,
      (error) => errors.push(error)
    );
    expect([...ids]).toEqual(['sunset']);
    expect(list.filter((t) => t.id === 'violet')).toHaveLength(1);
    expect(errors).toHaveLength(3);
    expect(loadCustomThemes('not a list', [], (e) => errors.push(e)).size).toBe(0);
  });

  it('refuses style ids outside the presets (never free CSS)', async () => {
    const runtime = await start(createTasksDefinition(), backend());
    await expect(runtime.overrides.set({ radius: '3px' as never })).rejects.toThrow();
    await expect(runtime.theme.setOverride({ elevation: 'neon' as never })).rejects.toThrow();
    await expect(runtime.theme.setOverride({ font: 'Comic Sans' as never })).rejects.toThrow();
    await expect(
      runtime.theme.setOverride({ motion: 'cubic-bezier(0,0,1,1)' as never })
    ).rejects.toThrow();
    expect(runtime.overrides.get()).toEqual({});
  });
});

// --- merged from snapshot-redaction.test.ts ---

/**
 * Simulated auth keeps typed passwords as plain text in this browser
 * (`simulatedPassword`). An exported snapshot file leaves the browser, so
 * those values are blanked on export; local saved snapshots keep them.
 */

type Runtime = PrototypeRuntime<PrototypeDatabase>;
type Row = Record<string, unknown> & { id: string };
const harnesses: ReturnType<typeof createHarness>[] = [];
afterEach(() => {
  for (const harness of harnesses.splice(0)) harness.closeAll();
});

const SECRET = 'typed simulated password';

async function bootWithPassword(): Promise<{ runtime: Runtime; taskId: string }> {
  const harness = createHarness<PrototypeDatabase>(createTasksDefinition());
  harnesses.push(harness);
  const runtime = (await harness.boot()) as Runtime;
  const task = (await runtime.db.rows<Row>('tasks').toCollection().first()) as Row;
  // Any table: the field name is what marks a typed secret.
  await runtime.db.rows<Row>('tasks').put({ ...task, simulatedPassword: SECRET });
  return { runtime, taskId: task.id };
}

function exportedRow(json: string, id: string): Row | undefined {
  const parsed = JSON.parse(json) as { tables: { name: string; rows: Row[] }[] };
  return parsed.tables.find((t) => t.name === 'tasks')?.rows.find((row) => row.id === id);
}

describe('snapshot export redacts simulated passwords', () => {
  it('blanks simulatedPassword in the exported JSON of the current world', async () => {
    const { runtime, taskId } = await bootWithPassword();
    const { json } = await runtime.snapshots.exportJson();
    expect(json).not.toContain(SECRET);
    const row = exportedRow(json, taskId);
    expect(row).toBeDefined();
    expect(row?.simulatedPassword).toBeNull();
    // The live record is untouched.
    expect((await runtime.db.rows<Row>('tasks').get(taskId))?.simulatedPassword).toBe(SECRET);
  });

  it('blanks it when exporting a saved snapshot, which keeps it locally', async () => {
    const { runtime, taskId } = await bootWithPassword();
    const saved = await runtime.snapshots.save({ name: 'With a password' });
    const { json } = await runtime.snapshots.exportJson(saved.id);
    expect(json).not.toContain(SECRET);
    expect(exportedRow(json, taskId)?.simulatedPassword).toBeNull();
    await runtime.db.rows<Row>('tasks').update(taskId, { simulatedPassword: 'changed' });
    await runtime.snapshots.restore(saved.id);
    expect((await runtime.db.rows<Row>('tasks').get(taskId))?.simulatedPassword).toBe(SECRET);
  });
});

describe('locked design system (PLAN_013)', () => {
  function lockedDefinition() {
    const definition = createTasksDefinition({ namespace: 'tasks-locked' });
    return {
      ...definition,
      manifest: {
        ...definition.manifest,
        defaultTheme: 'ocean',
        designSystem: { id: 'ocean', version: '1.0.0', locked: true },
      },
    } as PrototypeDefinition;
  }

  it('keeps only the design system theme and ignores other ids and style presets', async () => {
    const runtime = await start(lockedDefinition(), backend(), {
      resolveTheme: async (id) => ({ ...themes[0], id, name: id }) as never,
    });
    expect(runtime.theme.locked?.()).toEqual({ id: 'ocean', version: '1.0.0' });
    expect(runtime.theme.themes().map((t) => t.id)).toEqual(['ocean']);
    await runtime.theme.setOverride({ themeId: 'violet', radius: 'pill' });
    expect(runtime.theme.appearance().theme.value).toBe('ocean');
    expect(runtime.theme.appearance().radius.value).toBeNull();
    expect(await runtime.theme.ensure?.('library-theme')).toBeUndefined();
    expect(runtime.theme.themes().map((t) => t.id)).toEqual(['ocean']);
    const refused = await runtime.theme
      .saveCustom(createThemeFromSeed({ id: 'sunset', name: 'Sunset', seed: '#e8590c' }))
      .catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(ValidationError);
    expect(runtime.theme.customThemes()).toEqual([]);
  });

  it('an unlocked binding changes nothing', async () => {
    const definition = createTasksDefinition({ namespace: 'tasks-bound' });
    const runtime = await start(
      {
        ...definition,
        manifest: {
          ...definition.manifest,
          designSystem: { id: 'ocean', version: '1.0.0', locked: false },
        },
      } as PrototypeDefinition,
      backend()
    );
    expect(runtime.theme.locked?.()).toBeNull();
    expect(runtime.theme.themes().map((t) => t.id)).toEqual(['violet', 'ocean']);
    await runtime.theme.setOverride({ themeId: 'violet' });
    expect(runtime.theme.appearance().theme.value).toBe('violet');
  });
});
