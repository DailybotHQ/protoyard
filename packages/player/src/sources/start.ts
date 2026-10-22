import type { AnyBlueprint } from '@protoyard/blueprint';
import { bootByKind, prefetchBoot } from './boot-any.ts';
import { type StartedPlayer, type StartPlayerCoreOptions, startPlayerWith } from './start-core.ts';

/**
 * Starts index.html's player (start-core.ts): any blueprint, booted by kind
 * (`bootByKind`), with the resolved blueprint's boot chunk prefetched unless a
 * custom `boot` is given.
 */

export {
  bootIssues,
  PLAYER_SHARE_SESSION_KEY,
  type PlayerState,
  type StartedPlayer,
} from './start-core.ts';

export interface StartPlayerOptions extends Omit<StartPlayerCoreOptions, 'boot'> {
  /** Boots a validated blueprint of any kind (defaults to `bootByKind`). */
  boot?: StartPlayerCoreOptions['boot'];
}

const defaultBoot = (blueprint: AnyBlueprint, target: HTMLElement) => bootByKind(blueprint, target);

export function startPlayer(options: StartPlayerOptions): Promise<StartedPlayer> {
  return startPlayerWith({
    ...options,
    boot: options.boot ?? defaultBoot,
    prefetch: options.prefetch ?? !options.boot,
    prefetchBoot: options.prefetchBoot ?? prefetchBoot,
  });
}
