import { parseBlueprint } from '@protoyard/blueprint';
import { describe, expect, it, vi } from 'vitest';
import type { BootedPlayer } from '../src/boot.ts';
import type { StartEmbedOptions } from '../src/embed/index.ts';
import demo from '../src/fixtures/demo.blueprint.json';
import type { StartLiveReloadOptions } from '../src/live-reload.ts';
import { runPlayer } from '../src/run.ts';
import type { StartPlayerOptions } from '../src/sources/start.ts';

const blueprint = parseBlueprint(demo);

function booted(namespace: string): BootedPlayer {
  return {
    namespace,
    generatorVersion: undefined,
    runtime: null,
    error: null,
    destroy: vi.fn(async () => {}),
  };
}

function setup(framed: boolean) {
  const target = document.createElement('div');
  const win = { parent: framed ? {} : null } as unknown as Window;
  if (!framed) (win as unknown as { parent: Window }).parent = win;
  const first = booted('bp-first');
  const second = booted('bp-second');
  const boot = vi.fn(
    async (
      _bp: { name: string },
      _target?: HTMLElement,
      _extras?: unknown
    ): Promise<BootedPlayer> => (boot.mock.calls.length === 1 ? first : second)
  );
  const stop = vi.fn(async () => {});
  const showBootError = vi.fn(async (_error: unknown, _label: string) => {});
  const clearScreen = vi.fn(async () => {});
  // The fake startPlayer boots its own source through the boot it is given.
  const start = vi.fn(async (options: StartPlayerOptions) => {
    await options.boot?.(blueprint, options.target);
    return { state: () => 'booted' as const, stop, showBootError, clearScreen };
  });
  const startEmbed = vi.fn((_options: StartEmbedOptions) => ({ stop: () => {} }) as never);
  const loadEmbed = vi.fn(async () => ({ startEmbed }));
  return {
    target,
    win,
    first,
    second,
    boot,
    stop,
    showBootError,
    clearScreen,
    start,
    startEmbed,
    loadEmbed,
  };
}

describe('runPlayer', () => {
  it('never loads the embed module when the player is not framed', async () => {
    const s = setup(false);
    const running = await runPlayer({
      window: s.win,
      target: s.target,
      start: s.start,
      boot: s.boot,
      loadEmbed: s.loadEmbed,
    });
    expect(running.embed).toBeNull();
    expect(s.loadEmbed).not.toHaveBeenCalled();
    expect(s.boot).toHaveBeenCalledTimes(1);
  });

  it('lets the embed swap the running prototype through run.ts, tearing each down once', async () => {
    const s = setup(true);
    await runPlayer({
      window: s.win,
      target: s.target,
      start: s.start,
      boot: s.boot,
      loadEmbed: s.loadEmbed,
    });
    expect(s.startEmbed).toHaveBeenCalledTimes(1);
    const options = s.startEmbed.mock.calls[0]?.[0] as StartEmbedOptions;
    expect(options.window).toBe(s.win);
    // run.ts owns what runs: the embed gets no copy of it.
    expect(options.current).toBeUndefined();

    const next = await options.replace!(blueprint, 'replace');
    // The picker or error screen startPlayer owns is cleared before the new boot.
    expect(s.stop).toHaveBeenCalledTimes(1);
    expect(next).toBe(s.second);
    expect(s.first.destroy).toHaveBeenCalledTimes(1);
    expect(s.boot).toHaveBeenCalledTimes(2);
  });
});

/** A fake live-reload module that records the options run.ts passes it. */
function fakeLive() {
  const state: { options: StartLiveReloadOptions | null } = { options: null };
  const module = {
    detectQuickServe: vi.fn(async () => null),
    blueprintIdentity: vi.fn(async (bp: { name: string }) => ({ sha256: `sha-${bp.name}` })),
    liveWorldFor: vi.fn(() => null),
    startLiveReload: vi.fn((options: StartLiveReloadOptions) => {
      state.options = options;
      return { close: () => {} };
    }),
  };
  return { state, load: async () => module as unknown as typeof import('../src/live-reload.ts') };
}

const info = { protocol: 1 as const, events: '/__protoyard/events' };
const change = (name: string) => {
  const next = parseBlueprint({ ...demo, name });
  return { kind: 'safe' as const, blueprint: next, sha256: `sha-${name}`, world: null };
};

describe('runPlayer served by quick serve', () => {
  it('keeps one running prototype across live reload and embed requests (each destroyed once)', async () => {
    const s = setup(true);
    const third = booted('bp-third');
    s.boot.mockImplementation(async () =>
      s.boot.mock.calls.length === 1 ? s.first : s.boot.mock.calls.length === 2 ? s.second : third
    );
    const live = fakeLive();
    await runPlayer({
      window: { ...s.win, location: { origin: 'http://127.0.0.1:4180' } } as unknown as Window,
      target: s.target,
      start: s.start,
      boot: s.boot,
      loadEmbed: s.loadEmbed,
      detectQuickServe: async () => info,
      loadLiveReload: live.load,
    });
    // Live reload swaps first → second…
    await live.state.options!.apply(change('Second') as never);
    // …then the embedder replaces whatever runs now: second, never first again.
    const options = s.startEmbed.mock.calls[0]?.[0] as StartEmbedOptions;
    await options.replace!(blueprint, 'replace');
    expect(s.first.destroy).toHaveBeenCalledTimes(1);
    expect(s.second.destroy).toHaveBeenCalledTimes(1);
    expect(third.destroy).not.toHaveBeenCalled();
    expect(s.boot).toHaveBeenCalledTimes(3);
  });

  it('runs concurrent swaps one at a time, in order', async () => {
    const s = setup(true);
    const order: string[] = [];
    let n = 0;
    s.boot.mockImplementation(async (bp: { name: string }) => {
      n += 1;
      const mine = booted(`bp-${n}`);
      order.push(`boot ${bp.name}`);
      (mine.destroy as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        order.push(`destroy ${mine.namespace}`);
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
      return mine;
    });
    const live = fakeLive();
    await runPlayer({
      window: { ...s.win, location: { origin: 'http://127.0.0.1:4180' } } as unknown as Window,
      target: s.target,
      start: s.start,
      boot: s.boot,
      loadEmbed: s.loadEmbed,
      detectQuickServe: async () => info,
      loadLiveReload: live.load,
    });
    const options = s.startEmbed.mock.calls[0]?.[0] as StartEmbedOptions;
    await Promise.all([
      live.state.options!.apply(change('Live') as never),
      options.replace!(parseBlueprint({ ...demo, name: 'Embedded' }), 'replace'),
    ]);
    expect(order).toEqual([
      `boot ${blueprint.name}`,
      'destroy bp-1',
      'boot Live',
      'destroy bp-2',
      'boot Embedded',
    ]);
  });

  it('shows the error screen, never a blank page, when a live-reload boot fails', async () => {
    const s = setup(false);
    const failure = new Error('brand cannot be resolved');
    s.boot.mockImplementation(async () => {
      if (s.boot.mock.calls.length === 1) return s.first;
      throw failure;
    });
    const live = fakeLive();
    await runPlayer({
      window: { ...s.win, location: { origin: 'http://127.0.0.1:4180' } } as unknown as Window,
      target: s.target,
      start: s.start,
      boot: s.boot,
      loadEmbed: s.loadEmbed,
      detectQuickServe: async () => info,
      loadLiveReload: live.load,
    });
    const broken = change('Broken');
    await expect(live.state.options!.apply(broken as never)).rejects.toBe(failure);
    expect(s.showBootError).toHaveBeenCalledWith(failure, 'Broken');
    // The next change (whose `previous` is the broken one) still applies into the same world.
    expect(live.state.options!.current()).toMatchObject({
      sha256: 'sha-Broken',
      namespace: 'bp-first',
    });
    s.boot.mockImplementation(async () => s.second);
    await live.state.options!.apply(change('Fixed') as never);
    // The error screen is cleared before the fixed blueprint boots.
    expect(s.clearScreen).toHaveBeenCalled();
    expect(live.state.options!.current()).toMatchObject({ sha256: 'sha-Fixed' });
  });
});
