import {
  type Blueprint,
  blueprintIdentity,
  deriveDatabaseVersions,
  diffBlueprints,
  encodeBlueprintShare,
  loadUntrustedBlueprint,
  MigrationError,
} from '@protoyard/blueprint';

/** Re-exported for run.ts, so the entry chunk never imports identity code itself. */
export { blueprintIdentity };

/**
 * Live reload for a player served by `protoyard quick serve` (lazy: run.ts
 * loads it only on 127.0.0.1). The server describes itself at
 * `/__protoyard/serve.json` and pushes server-sent events on
 * `/__protoyard/events` when the exploration's blueprint changes. An event
 * carries identities and a same-origin path, never content: the player
 * fetches the file and reads it as untrusted input, like any source.
 *
 * - **Safe change** (no table or field dropped, and the new blueprint's
 *   database versions extend the old ones, as `quick iterate` records them):
 *   the player re-derives in place in the SAME storage namespace, so the
 *   runtime upgrades the database and every row stays. It also keeps the
 *   world's generator version: otherwise the runtime would treat the stored
 *   world as stale and rebuild it. New entities therefore start empty until
 *   the scenario is reset (DevTools).
 * - **Destructive change** (a drop, or a history that does not extend the
 *   old one): it boots the new blueprint in its own namespace, a fresh world.
 *
 * The tab remembers which namespace a re-derived blueprint uses
 * (sessionStorage), so a reload keeps the same world, and it keeps the tab's
 * saved share link current, so a reload shows the new blueprint.
 */

export const QUICK_SERVE_INFO_PATH = '/__protoyard/serve.json';
export const QUICK_SERVE_PROTOCOL = 1;
/** sessionStorage: blueprint identity → the world it was re-derived into. */
export const LIVE_NAMESPACES_KEY = 'protoyard.player.live-namespaces';
const LIVE_NAMESPACES_MAX = 32;
const MAX_BLUEPRINT_BYTES = 256 * 1024;
const SAME_ORIGIN_JSON = /^\/(?!\/)[A-Za-z0-9._~\-/%]{1,240}\.json$/;
const SHA256 = /^[0-9a-f]{64}$/;
const NAMESPACE = /^(?:bp|keep)-[a-z0-9-]+$/;

export interface QuickServeInfo {
  protocol: typeof QUICK_SERVE_PROTOCOL;
  /** Same-origin event stream path. */
  events: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Asks the page's own origin whether `quick serve` serves it. Only on
 * 127.0.0.1 (where quick serve always binds); anything unexpected is null.
 */
export async function detectQuickServe(
  location: Pick<Location, 'hostname' | 'origin'>,
  fetchImpl: FetchLike = fetch,
  timeoutMs = 1500
): Promise<QuickServeInfo | null> {
  if (location.hostname !== '127.0.0.1') return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(new URL(QUICK_SERVE_INFO_PATH, location.origin).href, {
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const info = (await response.json()) as Partial<QuickServeInfo>;
    if (
      info.protocol !== QUICK_SERVE_PROTOCOL ||
      typeof info.events !== 'string' ||
      !/^\/__protoyard\/[a-z-]+$/.test(info.events)
    ) {
      return null;
    }
    // The comments endpoint is fixed in boot.ts, never taken from this answer.
    return { protocol: QUICK_SERVE_PROTOCOL, events: info.events };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type BlueprintChangeKind = 'safe' | 'destructive';

/**
 * Whether a world built from `previous` can open `next` in place: no drop,
 * and `next`'s database versions start with every version of `previous` (so
 * Dexie upgrades the stored data instead of failing to open it).
 */
export function classifyBlueprintChange(previous: Blueprint, next: Blueprint): BlueprintChangeKind {
  let migration: ReturnType<typeof diffBlueprints>;
  try {
    migration = diffBlueprints(previous, next);
  } catch (error) {
    if (error instanceof MigrationError) return 'destructive';
    throw error;
  }
  let before: ReturnType<typeof deriveDatabaseVersions>;
  let after: ReturnType<typeof deriveDatabaseVersions>;
  try {
    before = deriveDatabaseVersions(previous);
    after = deriveDatabaseVersions(next);
  } catch {
    return 'destructive';
  }
  const extends_ =
    after.length >= before.length &&
    before.every(
      (version, index) =>
        after[index]?.version === version.version &&
        JSON.stringify(after[index]?.stores) === JSON.stringify(version.stores)
    );
  if (!extends_) return 'destructive';
  // Storage changed: the history must add the upgrade, or there is nothing to run.
  if (migration !== null && after.length === before.length) return 'destructive';
  // Labels, screens, brand or an added version: the stored rows open as they are.
  return 'safe';
}

type SessionLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultSession(): SessionLike | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** A world a re-derived blueprint keeps: its namespace and the generator version that built it. */
export interface LiveWorld {
  namespace: string;
  /** Undefined for a world built without a prototype generator version. */
  generatorVersion?: number;
}

type LiveEntry = [string, string, number | null];

function readEntries(session: SessionLike | null): LiveEntry[] {
  try {
    const parsed = JSON.parse(session?.getItem(LIVE_NAMESPACES_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is LiveEntry =>
        Array.isArray(entry) &&
        typeof entry[0] === 'string' &&
        SHA256.test(entry[0]) &&
        typeof entry[1] === 'string' &&
        NAMESPACE.test(entry[1]) &&
        (entry[2] === null || Number.isSafeInteger(entry[2]))
    );
  } catch {
    return [];
  }
}

/** The world this tab re-derived `sha256` into, or null (use its own content namespace). */
export function liveWorldFor(
  sha256: string,
  session: SessionLike | null = defaultSession()
): LiveWorld | null {
  const entry = readEntries(session).find(([key]) => key === sha256);
  if (!entry) return null;
  return entry[2] === null
    ? { namespace: entry[1] }
    : { namespace: entry[1], generatorVersion: entry[2] };
}

/** Remembers, for this tab only, that `sha256` runs in `world`. */
export function rememberLiveWorld(
  sha256: string,
  world: LiveWorld,
  session: SessionLike | null = defaultSession()
): void {
  if (!SHA256.test(sha256) || !NAMESPACE.test(world.namespace)) return;
  const entries = [
    [sha256, world.namespace, world.generatorVersion ?? null] as LiveEntry,
    ...readEntries(session).filter(([key]) => key !== sha256),
  ].slice(0, LIVE_NAMESPACES_MAX);
  try {
    session?.setItem(LIVE_NAMESPACES_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or blocked: a reload opens the content namespace instead.
  }
}

export interface LiveBlueprint {
  blueprint: Blueprint;
  /** Identity sha256 of `blueprint`. */
  sha256: string;
  /** The storage namespace its world lives in. */
  namespace: string;
  /** The generator version its world was built with (kept across safe changes). */
  generatorVersion?: number;
}

export interface LiveChange {
  kind: BlueprintChangeKind;
  blueprint: Blueprint;
  sha256: string;
  /** For a safe change, the world to re-derive into (the current one); null starts fresh. */
  world: LiveWorld | null;
}

interface EventSourceLike {
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
}

export interface StartLiveReloadOptions {
  info: QuickServeInfo;
  origin: string;
  /** What the player shows now, or null while nothing is booted. */
  current: () => LiveBlueprint | null;
  /** Replaces the running prototype; resolves when the new one is ready. */
  apply: (change: LiveChange) => Promise<void>;
  fetch?: FetchLike;
  EventSource?: new (url: string) => EventSourceLike;
  session?: SessionLike | null;
  /**
   * The sessionStorage key of the tab's saved share link (`PLAYER_SHARE_SESSION_KEY`,
   * passed in so this lazy chunk does not split the sources module off the entry).
   */
  shareSessionKey: string;
  /**
   * Reports a change that could not be applied. The player (run.ts) has then
   * shown its error screen; the world's data stays, and the next change applies.
   */
  onError?: (error: unknown) => void;
}

export interface LiveReload {
  close(): void;
}

/** Subscribes to `quick serve` events and applies changes to the blueprint on screen. */
export function startLiveReload(options: StartLiveReloadOptions): LiveReload {
  const fetchImpl = options.fetch ?? fetch;
  const session = options.session === undefined ? defaultSession() : options.session;
  const Source =
    options.EventSource ??
    (globalThis as unknown as { EventSource: new (url: string) => EventSourceLike }).EventSource;
  const source = new Source(new URL(options.info.events, options.origin).href);
  // One change at a time, in order: a burst of writes never interleaves boots.
  let queue = Promise.resolve();

  const handle = async (data: string) => {
    const event = JSON.parse(data) as { path?: unknown; sha256?: unknown; previous?: unknown };
    const shown = options.current();
    if (!shown || event.previous !== shown.sha256) return; // Another file of the exploration.
    if (typeof event.sha256 !== 'string' || !SHA256.test(event.sha256)) return;
    if (typeof event.path !== 'string' || !SAME_ORIGIN_JSON.test(event.path)) return;
    const response = await fetchImpl(new URL(event.path, options.origin).href, {
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!response.ok)
      throw new Error(`The changed blueprint could not be read (${response.status}).`);
    const text = await response.text();
    if (text.length > MAX_BLUEPRINT_BYTES) throw new Error('The changed blueprint is too large.');
    const loaded = loadUntrustedBlueprint(text);
    if (!loaded.success) throw new Error('The changed blueprint is not valid; keeping this one.');
    const identity = await blueprintIdentity(loaded.blueprint);
    // A newer write already replaced it: its own event follows.
    if (identity.sha256 !== event.sha256) return;
    const kind = classifyBlueprintChange(shown.blueprint, loaded.blueprint);
    const world: LiveWorld | null =
      kind === 'safe'
        ? {
            namespace: shown.namespace,
            ...(shown.generatorVersion !== undefined
              ? { generatorVersion: shown.generatorVersion }
              : {}),
          }
        : null;
    if (world) rememberLiveWorld(identity.sha256, world, session);
    try {
      session?.setItem(options.shareSessionKey, await encodeBlueprintShare(loaded.blueprint));
    } catch {
      // Too large for a link, or storage blocked: a reload falls back to the launcher.
    }
    await options.apply({ kind, blueprint: loaded.blueprint, sha256: identity.sha256, world });
  };

  source.addEventListener('blueprint', (message) => {
    queue = queue.then(() => handle(message.data)).catch((error) => options.onError?.(error));
  });
  return { close: () => source.close() };
}
