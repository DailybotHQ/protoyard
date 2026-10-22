import type { AnyBlueprint } from '@protoyard/blueprint';
import { createEmbedListener, type EmbedListener, type EmbedParent } from './listener.ts';
import { embedderOrigins } from './origins.ts';
import type { PlayerRequestType } from './protocol.ts';

export { connectPlayer, type PlayerConnection, PlayerEmbedError } from './client.ts';
export { createEmbedListener, type EmbedListener } from './listener.ts';
export { DEFAULT_ALLOWLIST, embedderOrigins, exactOrigin } from './origins.ts';
export {
  checkRequest,
  isPlayerMessage,
  MAX_MESSAGE_BLUEPRINT_BYTES,
  PLAYER_PROTOCOL,
  type PlayerIssue,
  type PlayerMessage,
  type PlayerRequestType,
} from './protocol.ts';

/** Something `startEmbed` can tear down before running the next blueprint. */
export interface RunningPrototype {
  namespace: string;
  destroy(): Promise<void>;
}

export interface StartEmbedOptions {
  window: Window;
  /**
   * Swaps the running prototype for a validated blueprint, when the caller
   * owns what is running (the player's run.ts, which live reload also swaps):
   * it tears down the current prototype itself, so the embed keeps no copy.
   */
  replace?(blueprint: AnyBlueprint, type: PlayerRequestType): Promise<RunningPrototype>;
  /** Without `replace`: boots a validated blueprint (in the player: `bootPlayer`). */
  boot?(blueprint: AnyBlueprint, type: PlayerRequestType): Promise<RunningPrototype>;
  /** Without `replace`: what is running now, if anything, torn down before each boot. */
  current?: RunningPrototype | null;
}

/**
 * Turns the embed protocol on for a framed player: listens to its parent
 * on the allowed origins and swaps the running prototype on each accepted
 * `load` or `replace`. Returns null (and listens to nothing) when the page is
 * not framed, so a top-level player never accepts messages.
 */
export function startEmbed(options: StartEmbedOptions): EmbedListener | null {
  const win = options.window;
  if (!win.parent || win.parent === win) return null;
  const origins = embedderOrigins(win.location.search, win.location.origin);
  if (origins.length === 0) return null;
  const { replace, boot } = options;
  if (!replace && !boot) throw new Error('startEmbed needs replace() or boot().');
  let current = options.current ?? null;
  return createEmbedListener({
    window: win,
    parent: win.parent as unknown as EmbedParent,
    origins,
    async apply(blueprint, type) {
      if (replace) return { namespace: (await replace(blueprint, type)).namespace };
      await current?.destroy();
      current = null;
      current = await (boot as NonNullable<typeof boot>)(blueprint, type);
      return { namespace: current.namespace };
    },
  });
}
