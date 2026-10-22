import { describe, expect, it, vi } from 'vitest';
import { onClockTick } from '../src/clock-tick.ts';
import { createFakeRuntime } from './fixtures/fake-runtime.ts';

async function flushMicrotasks() {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  await Promise.resolve();
}

describe('onClockTick', () => {
  it('runs on registration and coalesces same-turn changes to the latest simulated time', async () => {
    const runtime = createFakeRuntime();
    const ticks: number[] = [];
    const stop = onClockTick((now) => ticks.push(now.getTime()), { runtime });

    await flushMicrotasks();
    expect(ticks).toEqual([Date.parse('2026-10-16T10:00:00Z')]);

    runtime.clock.preview({ days: 1 });
    runtime.clock.preview({ hours: 2 });
    await flushMicrotasks();
    expect(ticks).toEqual([Date.parse('2026-10-16T10:00:00Z'), Date.parse('2026-10-17T12:00:00Z')]);
    stop();
  });

  it('does not overlap async handlers and runs the latest queued time afterward', async () => {
    const runtime = createFakeRuntime();
    let releaseFirst: (() => void) | undefined;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const ticks: number[] = [];
    const stop = onClockTick(
      async (now) => {
        ticks.push(now.getTime());
        if (ticks.length === 1) await first;
      },
      { runtime }
    );
    await flushMicrotasks();
    runtime.clock.preview({ days: 1 });
    runtime.clock.preview({ days: 1 });
    await flushMicrotasks();
    expect(ticks).toHaveLength(1);

    releaseFirst?.();
    await flushMicrotasks();
    expect(ticks).toEqual([Date.parse('2026-10-16T10:00:00Z'), Date.parse('2026-10-18T10:00:00Z')]);
    stop();
  });

  it('does not repeat a successfully handled instant and can retry after an offline failure', async () => {
    const runtime = createFakeRuntime();
    const errors: unknown[] = [];
    const ticks: number[] = [];
    let attempts = 0;
    const stop = onClockTick(
      async (now) => {
        ticks.push(now.getTime());
        attempts++;
        if (attempts === 1) throw new Error('offline');
      },
      { runtime, onError: (error) => errors.push(error) }
    );
    await flushMicrotasks();
    expect(errors).toHaveLength(1);

    runtime.clock.setTime(runtime.clock.now());
    await flushMicrotasks();
    expect(ticks).toHaveLength(2);

    runtime.clock.setTime(runtime.clock.now());
    await flushMicrotasks();
    expect(ticks).toHaveLength(2);

    runtime.clock.preview({ minutes: 1 });
    await flushMicrotasks();
    expect(ticks).toHaveLength(3);
    stop();
  });

  it('drops an initial tick that is queued when unsubscribed', async () => {
    const runtime = createFakeRuntime();
    const handler = vi.fn();
    const stop = onClockTick(handler, { runtime });
    stop();
    await flushMicrotasks();
    expect(handler).not.toHaveBeenCalled();
  });
});
