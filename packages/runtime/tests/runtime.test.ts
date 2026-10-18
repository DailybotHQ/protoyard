import {
  defineTheme,
  PermissionDeniedError,
  type PrototypeDefinition,
  parseScenario,
  ThemePaletteSchema,
} from '@protoyard/core';
import {
  dumpTables,
  listProtoyardDatabases,
  openControlStore,
  parseDatabaseName,
  sandboxNamespace,
} from '@protoyard/database';
import {
  composeScenario,
  createGenerateContext,
  PRESET_IDS,
  PRESETS,
  validateWorld,
} from '@protoyard/scenarios';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPrototypeRuntime,
  type MatchMedia,
  type ProtoyardRuntime,
  type RuntimeOptions,
  SNAPSHOT_MAX_ROWS,
  SnapshotImportError,
} from '../src/index.ts';
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

const domainOnly = async (runtime: ProtoyardRuntime) =>
  (await dumpTables(runtime.db)).filter((t) => !t.name.startsWith('py_'));

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
      generatorVersion: 1,
      prototypeGeneratorVersion: 3,
    });
  });
});

describe('2. referential integrity', () => {
  it('holds for every preset × the fixture generator', async () => {
    const definition = createTasksDefinition();
    for (const id of PRESET_IDS) {
      const scenario = composeScenario(PRESETS[id], { seed: 5, referenceTime: REFERENCE_TIME });
      const world = await definition.generate(createGenerateContext(scenario));
      const violations = validateWorld(world, {
        ...definition.integrity,
        referenceTime: scenario.referenceTime,
      });
      expect(violations, id).toEqual([]);
      const actor = world.personas.find((p) => p.id === scenario.actor.id);
      expect(actor, id).toBeDefined();
      expect(world.memberships.find((m) => m.personaId === actor?.id)?.role).toBe(
        scenario.actor.role
      );
      expect(world.personas.every((p) => /@example\.(com|org)$/.test(p.email ?? ''))).toBe(true);
    }
  });

  it('fails loudly when a generator breaks integrity', async () => {
    const base = createTasksDefinition({ namespace: 'broken' });
    const broken: PrototypeDefinition = {
      ...base,
      async generate(ctx) {
        const world = await base.generate(ctx);
        const tasks = world.tables.tasks as Task[];
        if (tasks[0]) tasks[0].projectId = 'project_9999';
        return world;
      },
    };
    const runtime = await start(broken, backend());
    await expect(runtime.scenarios.load('active-month')).rejects.toThrow(/integrity violation/);
    expect(runtime.scenarios.active()).toBeNull();
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

  it('persists the selected actor across reopen', async () => {
    const store = backend();
    const first = await start(createTasksDefinition(), store);
    await first.scenarios.ensureSeeded();
    const other = first.session.personas()[1]?.id as string;
    await first.session.switchActor(other);
    first.close();
    const second = await start(createTasksDefinition(), store);
    await second.scenarios.ensureSeeded();
    expect(second.session.principal()?.persona.id).toBe(other);
  });
});

describe('4. overrides are non-destructive', () => {
  it('role, environment and appearance overrides never change domain rows', async () => {
    const runtime = await start(createTasksDefinition(), backend());
    await runtime.scenarios.ensureSeeded();
    const before = await dumpTables(runtime.db);

    await runtime.overrides.set({ role: 'viewer' });
    expect(runtime.session.can('tasks:create')).toBe(false);
    await runtime.overrides.set({ environment: { network: 'offline' } });
    expect(runtime.environmentState().network).toBe('offline');
    await expect(runtime.environment.run('save', () => 1)).rejects.toMatchObject({
      code: 'offline',
    });
    await runtime.overrides.set({ themeId: 'ocean', mode: 'dark', viewport: 'iphone' });
    expect(runtime.theme.appearance().theme).toEqual({ value: 'ocean', source: 'override' });
    await expect(runtime.overrides.set({ mode: 'neon' as never })).rejects.toThrow(
      /Invalid override/
    );

    expect(await dumpTables(runtime.db)).toEqual(before);
    await runtime.overrides.clear();
    expect(runtime.overrides.get()).toEqual({});
    expect(runtime.session.can('tasks:create')).toBe(true);
    expect(runtime.environmentState().network).toBe('online');
  });

  it('environment.set persists as an override and reset restores the scenario', async () => {
    const store = backend();
    const runtime = await start(createTasksDefinition(), store);
    await runtime.scenarios.ensureSeeded();
    runtime.environment.set({ latencyMs: 250 });
    expect(runtime.environment.get().latencyMs).toBe(250);
    expect(runtime.overrides.get().environment).toEqual({ latencyMs: 250 });
    await new Promise((r) => setTimeout(r, 10));
    runtime.close();
    const reopened = await start(createTasksDefinition(), store);
    expect(reopened.environmentState().latencyMs).toBe(250);
    reopened.environment.reset();
    expect(reopened.environmentState().latencyMs).toBe(0);
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

  it('restores the captured look as overrides only when it would otherwise differ', async () => {
    const store = backend();
    const author = await start(createTasksDefinition(), store);
    await author.scenarios.ensureSeeded();
    await author.theme.setPreference({ themeId: 'ocean', mode: 'dark' });
    const own = await author.snapshots.save({ name: 'Ocean dark' });
    await author.snapshots.restore(own.id);
    // Same persona, same preference: nothing to pin.
    expect(author.overrides.get()).toEqual({});
    const { json } = await author.snapshots.exportJson(own.id);

    const colleague = await start(createTasksDefinition(), backend());
    await colleague.scenarios.ensureSeeded();
    await colleague.snapshots.importJson(json, { restore: true });
    expect(colleague.overrides.get()).toEqual({ themeId: 'ocean', mode: 'dark' });
    expect(colleague.theme.appearance().theme).toEqual({ value: 'ocean', source: 'override' });
  });

  it('skips unknown tables with a warning', async () => {
    const runtime = await start(createTasksDefinition(), backend());
    await runtime.scenarios.ensureSeeded();
    const { json } = await runtime.snapshots.exportJson();
    const data = JSON.parse(json);
    data.tables.push({ name: 'ghosts', rows: [{ id: 'g1' }] });
    const preview = await runtime.snapshots.previewImport(JSON.stringify(data));
    expect(preview.warnings).toContain('Unknown table "ghosts" will be skipped.');
    await runtime.snapshots.importJson(JSON.stringify(data), { restore: true });
    expect(runtime.snapshots.lastWarnings()).toContain('Unknown table "ghosts" was skipped.');
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

describe('7. appearance never touches data', () => {
  it('theme, mode and system changes leave the data DB unchanged', async () => {
    const media = fakeMedia(false);
    const runtime = await start(createTasksDefinition(), backend(), {
      matchMedia: media.matchMedia,
    });
    await runtime.scenarios.ensureSeeded();
    const before = await dumpTables(runtime.db);
    const seen: string[] = [];
    runtime.theme.subscribe((s) => seen.push(s.resolvedMode));

    expect(runtime.theme.appearance().mode).toEqual({ value: 'system', source: 'default' });
    expect(runtime.theme.appearance().resolvedMode).toBe('light');
    media.setDark(true);
    expect(runtime.theme.appearance().resolvedMode).toBe('dark');

    await runtime.theme.setPreference({ themeId: 'ocean', mode: 'light' });
    expect(runtime.theme.appearance().theme).toEqual({ value: 'ocean', source: 'preference' });
    await runtime.theme.setOverride({ mode: 'dark', viewport: 'tablet' });
    expect(runtime.theme.appearance().mode.source).toBe('override');
    await runtime.theme.clearOverride();
    expect(runtime.theme.appearance().mode).toEqual({ value: 'light', source: 'preference' });
    expect(seen).toEqual(['dark', 'light', 'dark', 'light']);

    // Preferences are per persona.
    await runtime.session.switchActor(runtime.session.personas()[1]?.id as string);
    expect(runtime.theme.appearance().theme.source).toBe('default');

    expect(await dumpTables(runtime.db)).toEqual(before);
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

  it('preview never writes data and advance persists the clock', async () => {
    const store = backend();
    const runtime = await start(createTasksDefinition(), store);
    await runtime.scenarios.ensureSeeded();
    const before = await dumpTables(runtime.db);
    runtime.clock.preview({ days: 30 });
    expect(await dumpTables(runtime.db)).toEqual(before);
    runtime.clock.clearPreview();
    await runtime.scenarios.advance({ days: 2 });
    runtime.close();
    const reopened = await start(createTasksDefinition(), store);
    expect(reopened.clock.committed().toISOString()).toBe('2026-06-03T09:00:00.000Z');
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

describe('10. reopening', () => {
  it('ensureSeeded never resets existing edits', async () => {
    const store = backend();
    const first = await start(createTasksDefinition(), store);
    await first.scenarios.ensureSeeded();
    await first.db.rows('tasks').put({ id: 'task_keep', projectId: 'project_0001', title: 'Keep' });
    const world = await domainOnly(first);
    first.close();

    const second = await start(createTasksDefinition(), store, {
      link: { scenario: 'viewer', seed: 3 },
    });
    await second.scenarios.ensureSeeded();
    expect(await domainOnly(second)).toEqual(world);
    expect(second.scenarios.active()?.scenario.id).toBe('active-month');
    expect(second.scenarios.pendingLink()).toMatchObject({ scenario: 'viewer', seed: 3 });

    await second.scenarios.load('viewer', { seed: 3, snapshotFirst: true });
    expect(second.scenarios.pendingLink()).toBeNull();
    expect(second.scenarios.active()).toMatchObject({ seed: 3 });
    const safety = await second.snapshots.list();
    expect(safety.map((s) => s.name)).toEqual(['Before loading Viewer']);
  });

  it('a first visit honours the link scenario, seed and actor', async () => {
    const runtime = await start(createTasksDefinition(), backend(), {
      link: { scenario: 'new-member', seed: 11, actor: 'user_0002', theme: 'ocean', mode: 'dark' },
    });
    await runtime.scenarios.ensureSeeded();
    expect(runtime.scenarios.active()).toMatchObject({ seed: 11, scenario: { id: 'new-member' } });
    expect(runtime.session.principal()?.persona.id).toBe('user_0002');
    expect(runtime.overrides.get()).toEqual({ themeId: 'ocean', mode: 'dark' });
    expect(runtime.theme.appearance().resolvedMode).toBe('dark');
  });
});

describe('scenario composition through the runtime', () => {
  it('resolves extends against presets and keeps tenure independent from org age', async () => {
    const runtime = await start(createTasksDefinition(), backend());
    const member = runtime.scenarios.get('new-member');
    expect(member).toMatchObject({
      organization: { ageDays: 180 },
      actor: { joinedDaysAgo: 0, role: 'member' },
      group: 'Lifecycle',
    });
    await runtime.scenarios.load('new-member');
    const principal = runtime.session.principal();
    expect(principal?.persona.joinedAt).toBe(REFERENCE_TIME);
    expect(principal?.organization?.createdAt).toBe('2025-12-03T09:00:00.000Z');
    expect(principal?.persona.onboardingComplete).toBe(false);
  });

  it('exposes paged rows and counts for the inspector', async () => {
    const runtime = await start(createTasksDefinition(), backend());
    await runtime.scenarios.ensureSeeded();
    expect(runtime.data.tables()).toEqual([
      'projects',
      'tasks',
      'py_organizations',
      'py_personas',
      'py_memberships',
      'py_events',
    ]);
    const counts = await runtime.data.counts();
    expect(counts.tasks).toBe(15);
    expect(await runtime.data.rows('tasks', { limit: 4, offset: 2 })).toHaveLength(4);
    await expect(runtime.data.rows('nope')).rejects.toThrow(/Unknown table/);
  });
});

describe('large-world loads', () => {
  it('reports generate → validate → write (chunked) → done, then null', async () => {
    const runtime = await start(createTasksDefinition(), backend(), { writeChunkSize: 7 });
    const seen: (string | null)[] = [];
    const direct: string[] = [];
    runtime.scenarios.subscribeProgress((p) =>
      seen.push(p ? `${p.phase}:${p.done}/${p.total}` : null)
    );
    await runtime.scenarios.load('active-month', {
      onProgress: (p) => direct.push(`${p.phase}:${p.done}/${p.total}`),
    });
    const counts = await runtime.data.counts();
    const rows = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(seen.at(-1)).toBeNull();
    expect(direct).toEqual(seen.slice(0, -1));
    expect(direct.slice(0, 4)).toEqual([
      'generate:0/1',
      'generate:1/1',
      'validate:0/1',
      'validate:1/1',
    ]);
    expect(direct.at(-1)).toBe(`done:${rows}/${rows}`);
    const writes = direct
      .filter((s) => s.startsWith('write:'))
      .map((s) => Number(s.split(/[:/]/)[1]));
    expect(writes[0]).toBe(0);
    expect(writes.length).toBeGreaterThan(rows / 7);
    expect(writes).toEqual([...writes].sort((a, b) => a - b));
    expect(writes.at(-1)).toBe(rows);
    expect(runtime.scenarios.progress()).toBeNull();
    expect(runtime.scenarios.lastLoadTimings()).toMatchObject({ scenarioId: 'active-month', rows });
  });

  it('stays atomic when a later chunk fails: the previous world survives', async () => {
    const base = createTasksDefinition({ namespace: 'chunk-fail' });
    let poison = false;
    const definition: PrototypeDefinition = {
      ...base,
      async generate(ctx) {
        const world = await base.generate(ctx);
        // A duplicate primary key in the LAST rows makes the final bulkAdd fail.
        const tasks = world.tables.tasks as Task[];
        if (poison && tasks[0]) tasks.push({ ...tasks[0] });
        return world;
      },
    };
    const runtime = await start(definition, backend(), { writeChunkSize: 3, validation: 'off' });
    await runtime.scenarios.load('active-month');
    await runtime.db
      .rows('tasks')
      .put({ id: 'task_edit', projectId: 'project_0001', title: 'Mine' });
    const before = await dumpTables(runtime.db);
    const progress: (string | null)[] = [];
    runtime.scenarios.subscribeProgress((p) => progress.push(p?.phase ?? null));

    poison = true;
    await expect(runtime.scenarios.load('new-member')).rejects.toThrow();
    expect(await dumpTables(runtime.db)).toEqual(before);
    expect(runtime.scenarios.active()?.scenario.id).toBe('active-month');
    expect(progress).toContain('write');
    expect(progress).not.toContain('done');
    expect(progress.at(-1)).toBeNull();
    expect(runtime.scenarios.progress()).toBeNull();
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

  it('a restore that fails after validation leaves no stored copy and no data change', async () => {
    const { runtime, snapshot } = await exported();
    const before = await dumpTables(runtime.db);
    const listed = await runtime.snapshots.list();
    // Valid ids, but duplicated: passes validation, fails inside the restore transaction.
    const tasks = snapshot.tables.find((t: { name: string }) => t.name === 'tasks');
    tasks.rows.push({ ...tasks.rows[0] });
    await expect(
      runtime.snapshots.importJson(JSON.stringify(snapshot), { restore: true })
    ).rejects.toThrow();
    expect(await dumpTables(runtime.db)).toEqual(before);
    expect(await runtime.snapshots.list()).toEqual(listed);
  });

  it('keeps the stored copy when the restore fails after the records were replaced', async () => {
    const { runtime, snapshot } = await exported();
    const listed = await runtime.snapshots.list();
    const tasks = snapshot.tables.find((t: { name: string }) => t.name === 'tasks');
    tasks.rows = [{ ...tasks.rows[0], title: 'from the file' }];
    // The control-state write that follows the (committed) record restore fails.
    const put = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['put']>
    ) {
      if (this.name === 'state') throw new DOMException('Simulated failure', 'UnknownError');
      return put.apply(this, args);
    });
    try {
      await expect(
        runtime.snapshots.importJson(JSON.stringify(snapshot), { restore: true })
      ).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
    // The records already hold the file's rows, so the copy stays as the way back.
    expect((await runtime.db.table('tasks').toArray()).map((t) => t.title)).toEqual([
      'from the file',
    ]);
    expect(await runtime.snapshots.list()).toHaveLength(listed.length + 1);
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

  it('boots even when the stored clock is corrupt', async () => {
    const store = backend();
    const first = await start(createTasksDefinition(), store);
    await first.scenarios.ensureSeeded();
    first.close();
    const control = await openControlStore('tasks-fixture', store);
    await control.setState('clock', {
      referenceTime: 'garbage',
      committedOffsetMs: 0,
      previewOffsetMs: 0,
      running: false,
    });
    control.close();
    const errors: unknown[] = [];
    const again = await start(createTasksDefinition(), store, { onError: (e) => errors.push(e) });
    expect(again.clock.now().toISOString()).toBe(REFERENCE_TIME);
    expect(errors.length).toBe(1);
  });
});

describe('sandboxed worlds', () => {
  it('keeps sandboxes isolated from each other and from the default world', async () => {
    const store = backend();
    const main = await start(createTasksDefinition(), store);
    await main.scenarios.ensureSeeded();
    await main.db
      .rows('tasks')
      .put({ id: 'task_main_edit', projectId: 'project_0001', title: 'Mine' });
    const mainWorld = await dumpTables(main.db);

    const a = await start(createTasksDefinition(), store, {
      link: { sandbox: 'a', scenario: 'viewer' },
    });
    const b = await start(createTasksDefinition(), store, {
      link: { sandbox: 'b', scenario: 'empty' },
    });
    await a.scenarios.ensureSeeded();
    await b.scenarios.ensureSeeded();
    expect(a.sandbox).toBe('a');
    expect(main.sandbox).toBeUndefined();
    expect(a.db.name).toBe('protoyard.tasks-fixture~a.data');
    expect(a.scenarios.active()?.scenario.id).toBe('viewer');
    expect(b.scenarios.active()?.scenario.id).toBe('empty');
    expect(await b.db.rows('tasks').count()).toBe(0);

    await a.db.rows('tasks').put({ id: 'task_a_edit', projectId: 'project_0001', title: 'A' });
    await a.session.switchActor('user_0001');
    await b.scenarios.load('active-month');
    expect(await dumpTables(main.db)).toEqual(mainWorld);
    expect(main.scenarios.active()?.scenario.id).toBe('active-month');
    expect(await b.db.rows('tasks').get('task_a_edit')).toBeUndefined();
    expect(await main.db.rows('tasks').get('task_a_edit')).toBeUndefined();

    const listing = await listProtoyardDatabases('tasks-fixture', store);
    expect(listing).toMatchObject({ supported: true, sandboxes: ['a', 'b'] });
    expect(listing.databases.map((d) => d.name)).toEqual([
      'protoyard.tasks-fixture.control',
      'protoyard.tasks-fixture.data',
      'protoyard.tasks-fixture~a.control',
      'protoyard.tasks-fixture~a.data',
      'protoyard.tasks-fixture~b.control',
      'protoyard.tasks-fixture~b.data',
    ]);
  });

  it('follows a new link scenario inside a sandbox, keeps edits on plain reloads', async () => {
    const store = backend();
    const first = await start(createTasksDefinition(), store, {
      link: { sandbox: 'cmp', scenario: 'viewer' },
    });
    await first.scenarios.ensureSeeded();
    await first.db.rows('tasks').put({ id: 'task_keep', projectId: 'project_0001', title: 'Keep' });
    first.close();
    const reload = await start(createTasksDefinition(), store, {
      link: { sandbox: 'cmp', scenario: 'viewer' },
    });
    await reload.scenarios.ensureSeeded();
    expect(await reload.db.rows('tasks').get('task_keep')).toBeDefined();
    reload.close();
    const relink = await start(createTasksDefinition(), store, {
      link: { sandbox: 'cmp', scenario: 'new-member' },
    });
    await relink.scenarios.ensureSeeded();
    expect(relink.scenarios.active()?.scenario.id).toBe('new-member');
    expect(relink.scenarios.pendingLink()).toBeNull();
    expect(await relink.db.rows('tasks').get('task_keep')).toBeUndefined();
  });

  it('discards only its own databases; outside a sandbox discard throws', async () => {
    const store = backend();
    const main = await start(createTasksDefinition(), store);
    await main.scenarios.ensureSeeded();
    const a = await start(createTasksDefinition(), store, {
      link: { sandbox: 'a', scenario: 'empty' },
    });
    const b = await start(createTasksDefinition(), store, {
      link: { sandbox: 'b', scenario: 'empty' },
    });
    await a.scenarios.ensureSeeded();
    await b.scenarios.ensureSeeded();
    await expect(main.discardSandbox()).rejects.toThrow(/not running in a sandbox/);
    await a.discardSandbox();
    expect(a.closed).toBe(true);
    expect((await listProtoyardDatabases('tasks-fixture', store)).sandboxes).toEqual(['b']);
    expect(await main.db.rows('tasks').count()).toBeGreaterThan(0);
    expect(b.scenarios.active()?.scenario.id).toBe('empty');
  });

  it('ignores an invalid sandbox name and uses the default world', async () => {
    const store = backend();
    const runtime = await start(createTasksDefinition(), store, {
      link: { sandbox: '../Evil~x', scenario: 'viewer' },
    });
    await runtime.scenarios.ensureSeeded();
    expect(runtime.sandbox).toBeUndefined();
    expect(runtime.db.name).toBe('protoyard.tasks-fixture.data');
    expect((await listProtoyardDatabases('tasks-fixture', store)).sandboxes).toEqual([]);
  });

  it('lists gracefully when indexedDB.databases() is unavailable', async () => {
    const factory = new IDBFactory() as unknown as globalThis.IDBFactory & { databases?: unknown };
    Object.defineProperty(factory, 'databases', { value: undefined });
    expect(await listProtoyardDatabases('tasks-fixture', { indexedDB: factory })).toEqual({
      supported: false,
      databases: [],
      sandboxes: [],
    });
    expect(parseDatabaseName('protoyard.crm-demo~cmp-1.data')).toEqual({
      name: 'protoyard.crm-demo~cmp-1.data',
      namespace: 'crm-demo',
      sandbox: 'cmp-1',
      kind: 'data',
    });
    expect(parseDatabaseName('other.db')).toBeNull();
    expect(() => sandboxNamespace('crm-demo', 'Bad Name')).toThrow(/Invalid sandbox/);
  });
});

describe('simulated sign-in (signed out sessions)', () => {
  it('keeps existing prototypes signed in by default', async () => {
    const runtime = await start(createTasksDefinition(), backend());
    await runtime.scenarios.ensureSeeded();
    expect(runtime.session.isSignedIn()).toBe(true);
    expect(runtime.session.authState()).toBe('signed-in');
    expect(runtime.session.principal()?.persona.id).toBe('user_0001');
  });

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

  it('lets a DevTools actor override act while signed out; sign-in and sign-out clear it', async () => {
    const runtime = await start(createTasksDefinition(), backend());
    await runtime.scenarios.ensureSeeded();
    const other = runtime.session.personas()[1]?.id as string;
    await runtime.session.signOut();
    await runtime.overrides.set({ actorId: other });
    expect(runtime.session.principal()?.persona.id).toBe(other);

    await runtime.session.signOut();
    expect(runtime.overrides.get().actorId).toBeUndefined();
    expect(runtime.session.principal()).toBeNull();

    await runtime.overrides.set({ actorId: other });
    await runtime.session.signIn('user_0001');
    expect(runtime.overrides.get().actorId).toBeUndefined();
    expect(runtime.session.principal()?.persona.id).toBe('user_0001');
  });
});
