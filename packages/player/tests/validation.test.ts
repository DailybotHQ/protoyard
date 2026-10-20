import { type Blueprint, parseBlueprint } from '@protoyard/blueprint';
import { createPendingTracker } from '@protoyard/core';
import { createPrototypeRuntime } from '@protoyard/runtime';
import { configure, fireEvent, screen, waitFor } from '@testing-library/svelte';
import { Dexie } from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import quickJson from '../../../blueprints/quick/saas-onboarding.json';
import { type BootedPlayer, bootPlayer } from '../src/boot.ts';
import demo from '../src/fixtures/demo.blueprint.json';
import {
  assertAttempt,
  createValidationSession,
  metricsFile,
  mountValidationPanel,
  openValidationStore,
  type RouteSource,
  VALIDATION_METRICS_FORMAT,
  type ValidationAttempt,
  validationDatabaseName,
} from '../src/validation/index.ts';

configure({ asyncUtilTimeout: 10_000 });

const quick = parseBlueprint(quickJson);

/** A route source the test drives by hand. */
function fakeRoute(initial = '/') {
  let route = initial;
  const listeners = new Set<() => void>();
  const source: RouteSource = {
    current: () => route,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    source,
    go(next: string) {
      route = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

/** The quick blueprint's tables on a fresh in-memory IndexedDB. */
async function fixtureDb() {
  const db = new Dexie(`validation-test-${Math.random().toString(36).slice(2)}`, {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  });
  db.version(1).stores({ workspaces: 'id', teammates: 'id' });
  await db.open();
  await db.table('workspaces').bulkAdd([
    { id: 'ws_1', name: 'North' },
    { id: 'ws_2', name: 'South' },
  ]);
  return db;
}

const opened: { close(): void }[] = [];
let booted: BootedPlayer | undefined;
afterEach(async () => {
  await booted?.destroy();
  booted = undefined;
  for (const item of opened.splice(0)) item.close();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('validation session', () => {
  async function setup(blueprint: Blueprint = quick) {
    const db = await fixtureDb();
    opened.push(db);
    const route = fakeRoute('/');
    const pending = createPendingTracker();
    const recorded: ValidationAttempt[] = [];
    let clock = Date.parse('2026-10-20T10:00:00.000Z');
    const timers: (() => void)[] = [];
    const session = createValidationSession({
      blueprint,
      runtime: { db, pending },
      route: route.source,
      record: async (attempt) => {
        recorded.push(attempt);
      },
      now: () => clock,
      setTimer: (fn) => timers.push(fn),
      clearTimer: () => {},
    });
    opened.push(session);
    return {
      db,
      route,
      pending,
      recorded,
      session,
      timers,
      advance: (ms: number) => (clock += ms),
    };
  }

  it('detects success from route and live data, counting route changes and service calls as steps', async () => {
    const { db, route, pending, recorded, session, advance } = await setup();
    expect(session.state()).toMatchObject({ index: 0, total: 2, current: { phase: 'ready' } });
    await session.start();
    expect(session.state().current.phase).toBe('running');

    route.go('/workspaces/new');
    await pending.track({ kind: 'service', label: 'workspace.create' }, async () => {});
    await pending.track({ kind: 'scenario', label: 'load' }, async () => {});
    expect(session.state().current).toMatchObject({ phase: 'running', steps: 2 });
    advance(42_500);
    route.go('/workspaces');
    expect(session.state().current.phase).toBe('running');

    await db.table('workspaces').add({ id: 'ws_3', name: 'East' });
    await waitFor(() => expect(recorded).toHaveLength(1));
    expect(recorded[0]).toEqual({
      taskId: 'create-workspace',
      outcome: 'success',
      durationMs: 42_500,
      steps: 3,
      startedAt: '2026-10-20T10:00:00.000Z',
      endedAt: '2026-10-20T10:00:42.500Z',
    });
    expect(session.state().current.phase).toBe('done');
  });

  it('counts rows against the task start and ignores soft-deleted rows', async () => {
    const { db, route, recorded, session } = await setup();
    await session.start();
    route.go('/workspaces');
    await db
      .table('workspaces')
      .add({ id: 'ws_gone', name: 'Gone', deletedAt: '2026-10-20T10:00:01.000Z' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(recorded).toHaveLength(0);
    await db.table('workspaces').add({ id: 'ws_4', name: 'West' });
    await waitFor(() => expect(recorded[0]?.outcome).toBe('success'));
  });

  it('records giving up and time-outs, then moves to the next task', async () => {
    const { recorded, session, timers } = await setup();
    await session.start();
    await session.giveUp();
    expect(recorded[0]).toMatchObject({ taskId: 'create-workspace', outcome: 'gave-up', steps: 0 });
    session.next();
    expect(session.state()).toMatchObject({
      index: 1,
      task: { id: 'invite-teammate' },
      current: { phase: 'ready' },
    });
    await session.start();
    expect(timers).toHaveLength(2);
    timers[1]?.();
    await waitFor(() =>
      expect(recorded[1]).toMatchObject({ taskId: 'invite-teammate', outcome: 'timed-out' })
    );
    expect(session.state().finished).toBe(true);
    session.next();
    expect(session.state().index).toBe(1);
  });

  it('refuses a blueprint without tasks', async () => {
    const db = await fixtureDb();
    opened.push(db);
    expect(() =>
      createValidationSession({
        blueprint: parseBlueprint(demo),
        runtime: { db },
        route: fakeRoute().source,
        record: async () => {},
      })
    ).toThrow(/no validation tasks/);
  });
});

describe('validation metrics store', () => {
  const attempt: ValidationAttempt = {
    taskId: 'create-workspace',
    outcome: 'success',
    durationMs: 1200,
    steps: 3,
    startedAt: '2026-10-20T10:00:00.000Z',
    endedAt: '2026-10-20T10:00:01.200Z',
  };

  it('persists attempts per blueprint namespace and exports protoyard-validation-metrics v1', async () => {
    const indexedDB = new IDBFactory();
    const store = openValidationStore('bp-alpha', { indexedDB, IDBKeyRange });
    await store.record(attempt);
    store.close();
    const reopened = openValidationStore('bp-alpha', { indexedDB, IDBKeyRange });
    opened.push(reopened);
    expect(await reopened.list()).toEqual([attempt]);
    const other = openValidationStore('bp-beta', { indexedDB, IDBKeyRange });
    opened.push(other);
    expect(await other.list()).toEqual([]);
    expect(validationDatabaseName('bp-alpha')).toBe('protoyard.bp-alpha.validation');

    const file = metricsFile({
      name: quick.name,
      namespace: 'bp-alpha',
      tasks: quick.validation?.tasks ?? [],
      attempts: await reopened.list(),
      now: () => new Date('2026-10-20T11:00:00.000Z'),
    });
    expect(file).toEqual({
      format: VALIDATION_METRICS_FORMAT,
      version: 1,
      blueprint: { name: 'Quick Workspace Onboarding', namespace: 'bp-alpha' },
      exportedAt: '2026-10-20T11:00:00.000Z',
      tasks: [
        { id: 'create-workspace', prompt: 'Create a workspace for your team.' },
        { id: 'invite-teammate', prompt: 'Invite a teammate to one of your workspaces.' },
      ],
      attempts: [attempt],
    });
  });

  it('refuses malformed attempts', () => {
    for (const bad of [
      { ...attempt, taskId: 'Bad Id' },
      { ...attempt, outcome: 'won' },
      { ...attempt, steps: -1 },
      { ...attempt, durationMs: 1.5 },
      { ...attempt, startedAt: 'yesterday' },
    ]) {
      expect(() => assertAttempt(bad as ValidationAttempt), JSON.stringify(bad)).toThrow(
        /Invalid validation attempt/
      );
    }
    expect(assertAttempt({ ...attempt, extra: 'dropped' } as ValidationAttempt)).toEqual(attempt);
  });
});

describe('validation panel', () => {
  it('starts, gives up and downloads the metrics', async () => {
    const db = await fixtureDb();
    opened.push(db);
    const download = vi.fn();
    const mounted = mountValidationPanel({
      blueprint: quick,
      namespace: 'bp-panel',
      runtime: { db, pending: createPendingTracker() },
      route: fakeRoute().source,
      indexedDB: new IDBFactory(),
      IDBKeyRange,
      download,
    });
    opened.push({ close: () => void mounted.destroy() });
    expect(await screen.findByRole('heading', { name: 'Task 1 of 2' })).toBeTruthy();
    expect(screen.getByTestId('validation-prompt').textContent).toBe(
      'Create a workspace for your team.'
    );

    await fireEvent.click(screen.getByRole('button', { name: 'Start task' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Give up' }));
    expect((await screen.findByTestId('validation-outcome')).textContent).toMatch(/Gave up/);
    expect(screen.getByRole('status').textContent).toBe('Task skipped.');

    await fireEvent.click(screen.getByRole('button', { name: 'Download metrics' }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    const [file] = download.mock.calls[0] as [{ attempts: ValidationAttempt[]; format: string }];
    expect(file.format).toBe('protoyard-validation-metrics');
    expect(file.attempts.map((item) => item.outcome)).toEqual(['gave-up']);

    await fireEvent.click(screen.getByRole('button', { name: 'Next task' }));
    expect(await screen.findByRole('heading', { name: 'Task 2 of 2' })).toBeTruthy();
  });
});

describe('bootPlayer with validation tasks', () => {
  async function boot(blueprint: Blueprint) {
    const target = document.body.appendChild(document.createElement('div'));
    const indexedDB = new IDBFactory();
    booted = await bootPlayer({
      blueprint,
      target,
      search: '',
      indexFactory: indexedDB,
      createRuntime: (definition, options) =>
        createPrototypeRuntime(definition, {
          ...options,
          indexedDB,
          IDBKeyRange,
          sleep: async () => {},
        }),
    });
    return booted;
  }

  it('shows the panel only for blueprints that declare tasks', { timeout: 60_000 }, async () => {
    await boot(quick);
    expect(await screen.findByTestId('validation-panel')).toBeTruthy();
    await booted?.destroy();
    booted = undefined;
    expect(screen.queryByTestId('validation-panel')).toBeNull();
    document.body.replaceChildren();

    await boot(parseBlueprint(demo));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByTestId('validation-panel')).toBeNull();
  });
});
