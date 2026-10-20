import type { Blueprint } from '@protoyard/blueprint';
import type { BootedPlayer } from './boot.ts';
import type { EmbedListener, StartEmbedOptions } from './embed/index.ts';
import { type StartedPlayer, type StartPlayerOptions, startPlayer } from './sources/start.ts';

export interface RunPlayerOptions {
  window: Window;
  target: HTMLElement;
  /** Defaults to `startPlayer` (tests inject a fake). */
  start?: (options: StartPlayerOptions) => Promise<StartedPlayer>;
  /** Defaults to `bootPlayer` from the lazily loaded boot chunk. */
  boot?: (blueprint: Blueprint, target: HTMLElement) => Promise<BootedPlayer>;
  /** Defaults to the lazily loaded embed module. */
  loadEmbed?: () => Promise<{ startEmbed(options: StartEmbedOptions): EmbedListener | null }>;
}

export interface RunningPlayer {
  started: StartedPlayer;
  /** The postMessage listener, or null when the page is not framed or no origin is allowed. */
  embed: EmbedListener | null;
}

async function defaultBoot(blueprint: Blueprint, target: HTMLElement): Promise<BootedPlayer> {
  const { bootPlayer } = await import('./boot.ts');
  return bootPlayer({ blueprint, target });
}

/**
 * Starts the player from its own source (link, adjacent file or picker) and,
 * only when framed, turns on `protoyard-player/1` so an embedding page can
 * load or replace the blueprint. The embed module loads only in a frame.
 */
export async function runPlayer(options: RunPlayerOptions): Promise<RunningPlayer> {
  const { target } = options;
  const win = options.window;
  const boot = options.boot ?? defaultBoot;
  // Fetch the boot chunk while the source resolves (startPlayer skips its own
  // prefetch when a boot function is passed in).
  if (!options.boot) void import('./boot.ts').catch(() => undefined);
  let current: BootedPlayer | null = null;
  const bootInto = async (blueprint: Blueprint) => {
    current = await boot(blueprint, target);
    return current;
  };
  const start = options.start ?? startPlayer;
  const started = await start({ target, boot: bootInto });
  if (!win.parent || win.parent === win) return { started, embed: null };

  const loadEmbed = options.loadEmbed ?? (() => import('./embed/index.ts'));
  const { startEmbed } = await loadEmbed();
  const embed = startEmbed({
    window: win,
    current,
    boot: async (blueprint) => {
      // Clear the picker or error screen startPlayer may have mounted.
      await started.stop();
      return bootInto(blueprint);
    },
  });
  return { started, embed };
}
