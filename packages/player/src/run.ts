import type { AnyBlueprint } from '@protoyard/blueprint';
import type { BootedPlayer } from './boot.ts';
import { type RunningPlayer, type RunPlayerCoreOptions, runPlayerWith } from './run-core.ts';
import { type BootExtras, bootByKind } from './sources/boot-any.ts';
import { type StartedPlayer, type StartPlayerOptions, startPlayer } from './sources/start.ts';

/**
 * index.html's player loop (run-core.ts) with its defaults: `startPlayer`,
 * and `bootByKind` (`bootPlayer`, a lazy boot chunk, for apps; `bootKind`, a
 * lazy kind chunk, for decks, pages and docs), prefetched once the source
 * resolves unless a custom `boot` is given.
 */

export type { BootExtras, RunningPlayer };

export interface RunPlayerOptions
  extends Omit<RunPlayerCoreOptions, 'start' | 'boot' | 'prefetch'> {
  /** Defaults to `startPlayer` (tests inject a fake). */
  start?: (options: StartPlayerOptions) => Promise<StartedPlayer>;
  /** Defaults to `bootByKind`. */
  boot?: RunPlayerCoreOptions['boot'];
}

const defaultBoot = (blueprint: AnyBlueprint, target: HTMLElement, extras: BootExtras = {}) =>
  bootByKind(blueprint, target, extras) as Promise<BootedPlayer>;

export function runPlayer(options: RunPlayerOptions): Promise<RunningPlayer> {
  return runPlayerWith({
    ...options,
    start: options.start ?? startPlayer,
    boot: options.boot ?? defaultBoot,
    prefetch: !options.boot,
  });
}
