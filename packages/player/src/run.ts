import type { Blueprint } from '@protoyard/blueprint';
import type { BootedPlayer, BootPlayerOptions } from './boot.ts';
import type { EmbedListener, StartEmbedOptions } from './embed/index.ts';
import type { LiveBlueprint, LiveReload, LiveWorld, QuickServeInfo } from './live-reload.ts';
import {
  PLAYER_SHARE_SESSION_KEY,
  type StartedPlayer,
  type StartPlayerOptions,
  startPlayer,
} from './sources/start.ts';

/** Per-boot settings run.ts adds on top of the blueprint and target. */
export type BootExtras = Pick<BootPlayerOptions, 'namespace' | 'generatorVersion' | 'review'>;

export interface RunPlayerOptions {
  window: Window;
  target: HTMLElement;
  /** Defaults to `startPlayer` (tests inject a fake). */
  start?: (options: StartPlayerOptions) => Promise<StartedPlayer>;
  /** Defaults to `bootPlayer` from the lazily loaded boot chunk. */
  boot?: (blueprint: Blueprint, target: HTMLElement, extras?: BootExtras) => Promise<BootedPlayer>;
  /** Defaults to the lazily loaded embed module. */
  loadEmbed?: () => Promise<{ startEmbed(options: StartEmbedOptions): EmbedListener | null }>;
  /**
   * Whether `protoyard quick serve` serves this page (defaults to a same-origin
   * probe on 127.0.0.1 only, in the lazily loaded live-reload module).
   */
  detectQuickServe?: () => Promise<QuickServeInfo | null>;
  /** Defaults to the lazily loaded live-reload module. */
  loadLiveReload?: () => Promise<typeof import('./live-reload.ts')>;
}

export interface RunningPlayer {
  started: StartedPlayer;
  /** The postMessage listener, or null when the page is not framed or no origin is allowed. */
  embed: EmbedListener | null;
  /** Live reload, when `quick serve` serves the page; otherwise null. */
  live: LiveReload | null;
}

async function defaultBoot(
  blueprint: Blueprint,
  target: HTMLElement,
  extras: BootExtras = {}
): Promise<BootedPlayer> {
  const { bootPlayer } = await import('./boot.ts');
  return bootPlayer({ blueprint, target, ...extras });
}

/**
 * Starts the player from its own source (link, adjacent file or picker) and,
 * only when framed, turns on `protoyard-player/1` so an embedding page can
 * load or replace the blueprint. The embed module loads only in a frame.
 *
 * Served by `protoyard quick serve` (a same-origin probe, only on 127.0.0.1),
 * it also mounts review comments on the server's comments API and follows
 * blueprint changes live (live-reload.ts). Elsewhere neither module loads.
 */
export async function runPlayer(options: RunPlayerOptions): Promise<RunningPlayer> {
  const { target } = options;
  const win = options.window;
  const boot = options.boot ?? defaultBoot;
  // Fetch the boot chunk while the source resolves (startPlayer skips its own
  // prefetch when a boot function is passed in).
  if (!options.boot) void import('./boot.ts').catch(() => undefined);
  const loadLive = options.loadLiveReload ?? (() => import('./live-reload.ts'));
  const served: Promise<QuickServeInfo | null> = (
    options.detectQuickServe ??
    (() =>
      win.location?.hostname === '127.0.0.1'
        ? loadLive().then((live) => live.detectQuickServe(win.location))
        : Promise.resolve(null))
  )().catch(() => null);

  let current: BootedPlayer | null = null;
  let shown: LiveBlueprint | null = null;
  const bootInto = async (blueprint: Blueprint, world?: LiveWorld) => {
    const info = await served;
    if (!info) {
      current = await boot(blueprint, target);
      return current;
    }
    // Served by quick: the live-reload module is already loaded (it probed).
    const live = await loadLive();
    const { sha256 } = await live.blueprintIdentity(blueprint);
    // A blueprint this tab re-derived keeps its world across a reload.
    const kept = world ?? live.liveWorldFor(sha256);
    current = await boot(blueprint, target, {
      ...(kept ? { namespace: kept.namespace } : {}),
      ...(kept?.generatorVersion !== undefined ? { generatorVersion: kept.generatorVersion } : {}),
      review: { endpoint: info.comments },
    });
    shown = {
      blueprint,
      sha256,
      namespace: current.namespace,
      ...(current.generatorVersion !== undefined
        ? { generatorVersion: current.generatorVersion }
        : {}),
    };
    return current;
  };
  const start = options.start ?? startPlayer;
  const started = await start({ target, boot: (blueprint) => bootInto(blueprint) });

  let live: LiveReload | null = null;
  const info = await served;
  if (info) {
    const { startLiveReload } = await loadLive();
    live = startLiveReload({
      info,
      origin: win.location.origin,
      shareSessionKey: PLAYER_SHARE_SESSION_KEY,
      current: () => shown,
      apply: async (change) => {
        const previous = current;
        current = null;
        await previous?.destroy();
        await bootInto(change.blueprint, change.world ?? undefined);
      },
      onError: (error) => console.warn('[protoyard player] live reload', error),
    });
  }
  if (!win.parent || win.parent === win) return { started, embed: null, live };

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
  return { started, embed, live };
}
