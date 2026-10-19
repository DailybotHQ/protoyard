import { createPendingTracker, type PendingOperation } from '@protoyard/core';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { createPrototypeRuntime, type ProtoyardRuntime } from '../src/index.ts';
import { createTasksDefinition } from './fixtures/tasks-prototype.ts';

/** A sleep the test releases by hand, so "in flight" is observable. */
function manualSleep() {
  const waiting: (() => void)[] = [];
  return {
    sleep: (ms: number) =>
      ms <= 0 ? Promise.resolve() : new Promise<void>((resolve) => waiting.push(resolve)),
    release() {
      for (const resolve of waiting.splice(0)) resolve();
    },
  };
}

const open: ProtoyardRuntime[] = [];
async function boot(sleep?: (ms: number) => Promise<void>) {
  const runtime = await createPrototypeRuntime(createTasksDefinition(), {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sleep: sleep ?? (async () => {}),
  });
  await runtime.scenarios.ensureSeeded();
  open.push(runtime);
  return runtime;
}

afterEach(() => {
  for (const runtime of open.splice(0)) runtime.close();
});

describe('createPendingTracker', () => {
  it('counts work from the call until it settles, errors included', async () => {
    const tracker = createPendingTracker();
    const seen: number[] = [];
    tracker.subscribe((ops) => seen.push(ops.length));
    let finish!: () => void;
    const work = tracker.track(
      { kind: 'service', label: 'deals.update' },
      () => new Promise<void>((resolve) => (finish = resolve))
    );
    expect(tracker.count()).toBe(1);
    expect(tracker.list()[0]).toMatchObject({ kind: 'service', label: 'deals.update' });
    const failing = tracker.track({ label: 'boom' }, async () => {
      throw new Error('boom');
    });
    expect(tracker.count()).toBe(2);
    await expect(failing).rejects.toThrow('boom');
    expect(tracker.count()).toBe(1);
    finish();
    await work;
    expect(tracker.count()).toBe(0);
    expect(seen).toEqual([1, 2, 1, 0]);
  });

  it('ends a begun operation only once', () => {
    const tracker = createPendingTracker();
    const end = tracker.begin({ label: 'x' });
    end();
    end();
    expect(tracker.count()).toBe(0);
  });
});

describe('runtime.pending', () => {
  it('counts an environment.run, including its simulated latency', async () => {
    const manual = manualSleep();
    const runtime = await boot(manual.sleep);
    runtime.environment.set({ latencyMs: 500 });
    let ran = false;
    const call = runtime.environment.run('tasks.create', () => {
      ran = true;
      return 'ok';
    });
    expect(runtime.pending.count()).toBe(1);
    expect(runtime.pending.list()[0]).toMatchObject({ kind: 'service', label: 'tasks.create' });
    await Promise.resolve();
    expect(ran).toBe(false);
    manual.release();
    await expect(call).resolves.toBe('ok');
    expect(runtime.pending.count()).toBe(0);
  });

  it('clears after a failing environment.run', async () => {
    const runtime = await boot();
    runtime.environment.set({ network: 'offline' });
    const call = runtime.environment.run('tasks.create', () => 'never');
    expect(runtime.pending.count()).toBe(1);
    await expect(call).rejects.toThrow(/offline/);
    expect(runtime.pending.count()).toBe(0);
  });

  it('counts a scenario switch for its whole duration', async () => {
    const runtime = await boot();
    const seen: PendingOperation[][] = [];
    runtime.pending.subscribe((ops) => seen.push([...ops]));
    const load = runtime.scenarios.load('viewer');
    expect(runtime.pending.count()).toBe(1);
    expect(runtime.pending.list()[0]?.kind).toBe('scenario');
    let progressWhilePending = false;
    const off = runtime.scenarios.subscribeProgress((p) => {
      if (p && runtime.pending.count() > 0) progressWhilePending = true;
    });
    await load;
    off();
    expect(progressWhilePending).toBe(true);
    expect(runtime.pending.count()).toBe(0);
    expect(seen.at(-1)).toEqual([]);
  });

  it('counts a persona switch, which still updates the principal synchronously', async () => {
    const runtime = await boot();
    const other = runtime.session
      .personas()
      .find((p) => p.id !== runtime.session.principal()?.persona.id);
    if (!other) throw new Error('fixture needs two personas');
    const switching = runtime.session.switchActor(other.id);
    expect(runtime.pending.count()).toBe(1);
    expect(runtime.pending.list()[0]).toMatchObject({ kind: 'session' });
    expect(runtime.session.principal()?.persona.id).toBe(other.id);
    await switching;
    expect(runtime.pending.count()).toBe(0);
  });

  it('counts time advances and snapshot restores, and clears on failure', async () => {
    const runtime = await boot();
    const advance = runtime.scenarios.advance({ days: 1 });
    expect(runtime.pending.list()[0]?.kind).toBe('time');
    await advance;
    const saved = await runtime.snapshots.save({ name: 'Before' });
    const restore = runtime.snapshots.restore(saved.id);
    expect(runtime.pending.list()[0]?.kind).toBe('snapshot');
    await restore;
    const missing = runtime.snapshots.restore('snap_missing');
    expect(runtime.pending.count()).toBe(1);
    await expect(missing).rejects.toThrow(/not found/);
    expect(runtime.pending.count()).toBe(0);
  });
});
