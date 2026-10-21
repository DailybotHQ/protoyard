import { parseBlueprint } from '@protoyard/blueprint';
import { describe, expect, it, vi } from 'vitest';
import type { BootedPlayer } from '../src/boot.ts';
import type { StartEmbedOptions } from '../src/embed/index.ts';
import demo from '../src/fixtures/demo.blueprint.json';
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
  const boot = vi.fn(async () => (boot.mock.calls.length === 1 ? first : second));
  const stop = vi.fn(async () => {});
  // The fake startPlayer boots its own source through the boot it is given.
  const start = vi.fn(async (options: StartPlayerOptions) => {
    await options.boot?.(blueprint, options.target);
    return { state: () => 'booted' as const, stop };
  });
  const startEmbed = vi.fn((_options: StartEmbedOptions) => ({ stop: () => {} }) as never);
  const loadEmbed = vi.fn(async () => ({ startEmbed }));
  return { target, win, first, second, boot, stop, start, startEmbed, loadEmbed };
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

  it('hands the running prototype to the embed listener and swaps it on a request', async () => {
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
    expect(options.current).toBe(s.first);

    const next = await options.boot(blueprint, 'replace');
    // The picker or error screen startPlayer owns is cleared before the new boot.
    expect(s.stop).toHaveBeenCalledTimes(1);
    expect(next).toBe(s.second);
    expect(s.boot).toHaveBeenCalledTimes(2);
  });
});
