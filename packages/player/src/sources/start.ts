import { type Blueprint, BrandThemeError, readBlueprintShareFragment } from '@protoyard/blueprint';
import { mount, unmount } from 'svelte';
import {
  type ResolvedSource,
  resolveSource,
  type SourceIssue,
  type SourceKind,
} from './resolve.ts';
import SourceError from './SourceError.svelte';

/**
 * Starts the player: resolve the source (`#bp=`, then `?src=`, then the
 * picker), then boot the blueprint, or show an accessible error screen with
 * every issue and a way to open another file. Never a blank page: a brand
 * theme that fails (BrandThemeError) or any other definition error lands on
 * the same screen. A changed `#bp=` fragment reloads the page, so the new
 * blueprint boots on a clean runtime.
 */

export interface StartPlayerOptions {
  target: HTMLElement;
  /** Defaults to `window.location`. */
  location?: Pick<Location, 'hash' | 'search' | 'href'>;
  /** Defaults to `window` (hashchange listener). */
  events?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  fetch?: typeof fetch;
  supportsDeflateRaw?: () => boolean;
  /** Boots a validated blueprint (defaults to `bootPlayer`). */
  boot?: (blueprint: Blueprint, target: HTMLElement) => Promise<unknown>;
  /** Called for a new `#bp=` link (defaults to `location.reload()`); app routes never reload. */
  reload?: () => void;
  /** The bundled demo, loaded only when the picker asks for it. */
  loadDemo?: () => Promise<Blueprint>;
  /** This tab's storage for the last share link (defaults to `sessionStorage`; null disables it). */
  session?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  /** Defaults to `window.history` (moves a `#bp=` link out of the way of app routes). */
  history?: Pick<History, 'replaceState' | 'state'>;
}

/** sessionStorage key of the share link this tab opened (tab-scoped; never sent anywhere). */
export const PLAYER_SHARE_SESSION_KEY = 'protoyard.player.share';

function defaultSession(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export type PlayerState = 'booted' | 'error' | 'picker';

export interface StartedPlayer {
  state: () => PlayerState;
  /** Removes the hashchange listener and any screen this module mounted. */
  stop: () => Promise<void>;
}

/** The boot module (renderer, runtime) as its own chunk, fetched while the source resolves. */
let bootModule: Promise<typeof import('../boot.ts')> | null = null;
const loadBootModule = () => {
  bootModule ??= import('../boot.ts');
  return bootModule;
};

async function defaultBoot(blueprint: Blueprint, target: HTMLElement) {
  const { bootPlayer } = await loadBootModule();
  return bootPlayer({ blueprint, target });
}

async function defaultDemo(): Promise<Blueprint> {
  const [{ parseBlueprint }, demo] = await Promise.all([
    import('@protoyard/blueprint'),
    import('../fixtures/demo.blueprint.json'),
  ]);
  return parseBlueprint(demo.default);
}

/** Turns an exception thrown while defining or booting into issues for the error screen. */
export function bootIssues(error: unknown): SourceIssue[] {
  if (error instanceof BrandThemeError) {
    return [
      {
        code: 'invalid-brand',
        path: ['brand'],
        message: error.message,
        fix: 'Choose another brand color, preset or library theme in the blueprint, then open it again.',
      },
    ];
  }
  const message = error instanceof Error ? error.message : String(error);
  return [
    {
      code: 'boot-failed',
      path: [],
      message: `The prototype could not start: ${message.slice(0, 300)}`,
      fix: 'Check the blueprint, or open another file.',
    },
  ];
}

export async function startPlayer(options: StartPlayerOptions): Promise<StartedPlayer> {
  const { target } = options;
  const loc = options.location ?? window.location;
  const events = options.events ?? window;
  const boot = options.boot ?? defaultBoot;
  // Start downloading the boot chunk now, in parallel with source resolution.
  if (!options.boot) void loadBootModule().catch(() => undefined);
  const reload = options.reload ?? (() => window.location.reload());
  const loadDemo = options.loadDemo ?? defaultDemo;
  let state: PlayerState = 'picker';
  let screen: Record<string, unknown> | null = null;
  const root = document.documentElement;

  const clear = async () => {
    if (screen) await unmount(screen);
    screen = null;
    target.replaceChildren();
  };

  const showError = async (source: SourceKind, label: string, issues: SourceIssue[]) => {
    await clear();
    state = 'error';
    root.dataset.pyReady = 'error';
    screen = mount(SourceError, { target, props: { source, label, issues, onPick: showPicker } });
  };

  const run = async (blueprint: Blueprint, source: SourceKind, label: string) => {
    await clear();
    try {
      await boot(blueprint, target);
      state = 'booted';
    } catch (error) {
      console.error('[protoyard player] could not start the blueprint', error);
      await showError(source, label, bootIssues(error));
    }
  };

  async function showPicker() {
    await clear();
    state = 'picker';
    delete root.dataset.pyReady;
    root.dataset.playerState = 'picker';
    const { default: SourcePicker } = await import('./SourcePicker.svelte');
    screen = mount(SourcePicker, {
      target,
      props: {
        loadDemo,
        onBlueprint: async (blueprint: Blueprint, label: string) => {
          delete root.dataset.playerState;
          // A picked file replaces the tab's last share link on reload.
          remember(null);
          await run(blueprint, 'file', label);
        },
      },
    });
  }

  const session = options.session === undefined ? defaultSession() : options.session;
  const remember = (payload: string | null) => {
    try {
      if (payload === null) session?.removeItem(PLAYER_SHARE_SESSION_KEY);
      else session?.setItem(PLAYER_SHARE_SESSION_KEY, payload);
    } catch {
      // Storage can be full or blocked; the link in the URL still works.
    }
  };
  let savedShare: string | null = null;
  try {
    savedShare = session?.getItem(PLAYER_SHARE_SESSION_KEY) ?? null;
  } catch {
    savedShare = null;
  }
  const resolved: ResolvedSource = await resolveSource({
    hash: loc.hash,
    search: loc.search,
    href: loc.href,
    savedShare,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.supportsDeflateRaw ? { supportsDeflateRaw: options.supportsDeflateRaw } : {}),
  });
  if (resolved.kind === 'blueprint') {
    if (resolved.share) {
      remember(resolved.share.payload);
      // The app's hash router would read `#bp=…` as a route ("Page not found"):
      // keep the link in this tab's storage and open the app at its home route.
      if (resolved.share.from === 'url') {
        const url = new URL(loc.href);
        const history = options.history ?? window.history;
        history.replaceState(history.state, '', `${url.pathname}${url.search}#/`);
      }
    } else if (resolved.source === 'src') {
      remember(null);
    }
    await run(resolved.blueprint, resolved.source, resolved.label);
  } else if (resolved.kind === 'error')
    await showError(resolved.source, resolved.label, resolved.issues);
  else await showPicker();

  // A new share link means a new blueprint: reload so it boots on a clean runtime.
  // App navigation (`#/deals`) also changes the hash and must never reload.
  let lastShare = readBlueprintShareFragment(loc.hash);
  const onHashChange = () => {
    const share = readBlueprintShareFragment(loc.hash);
    if (share === null || share === lastShare) return;
    lastShare = share;
    reload();
  };
  events.addEventListener('hashchange', onHashChange);

  return {
    state: () => state,
    stop: async () => {
      events.removeEventListener('hashchange', onHashChange);
      await clear();
    },
  };
}
