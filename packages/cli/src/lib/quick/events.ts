import { type FSWatcher, watch } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { blueprintIdentity, paintStreamedBlueprint } from '@protoyard/blueprint';
import { parseQuickBlueprint } from './blueprint-kind.ts';
import { historyBlueprints } from './history.ts';

/**
 * Live reload for `protoyard quick serve`: the server watches an exploration's
 * blueprint files and tells open players, over server-sent events, when one
 * changed. The channel carries identities and same-origin paths, never the
 * blueprint: the player fetches the file itself and reads it as untrusted
 * input, like any source.
 *
 * - `GET /__protoyard/serve.json` describes the server (`{ protocol, events,
 *   comments }`), so a launcher-marked player can check it is really served
 *   by `quick serve` before it subscribes or posts comments.
 * - `GET /__protoyard/events` is the event stream. A `hello` event lists the
 *   current identity of every watched blueprint; each change is ONE
 *   `blueprint` event `{ file, path, sha256, previous }` after the writes
 *   settle (debounced), and only when the identity really changed.
 * - While a deck, page or doc blueprint is still being written (its JSON is
 *   truncated), the server finds the part that has arrived and already
 *   validates (`paintStreamedBlueprint`), serves that JSON at
 *   `/__protoyard/drafts/<file id>.json`, and sends a `draft` event
 *   `{ file, path, sha256, base }` with that path, so a player can paint it
 *   progressively. The player reads the draft as untrusted input like any
 *   blueprint and checks its identity. `base` is the last complete identity it
 *   grows from; the `blueprint` event that follows still has that complete
 *   identity as `previous`. A burst of writes yields at most one read per
 *   {@link QUICK_DRAFT_INTERVAL_MS}.
 *
 * The server binds 127.0.0.1 and checks the Host header (quick serve), and
 * these routes also refuse a cross-origin request.
 */

export const QUICK_EVENTS_PROTOCOL = 1;
export const QUICK_EVENTS_PATH = '/__protoyard/events';
export const QUICK_SERVE_INFO_PATH = '/__protoyard/serve.json';
/** Where the current draft of a watched file is served (`<prefix><file id>.json`). */
export const QUICK_DRAFTS_PREFIX = '/__protoyard/drafts/';
/** Writes that land within this window are one change. */
export const QUICK_EVENTS_DEBOUNCE_MS = 150;
/** While writes keep coming (a streamed blueprint), the file is still read this often. */
export const QUICK_DRAFT_INTERVAL_MS = 400;
/** A comment line keeps idle connections open through proxies and sleep. */
const HEARTBEAT_MS = 25_000;
const MAX_CLIENTS = 32;
const MAX_BLUEPRINT_BYTES = 2 * 1024 * 1024;

export interface WatchedBlueprint {
  /** `base` for the exploration, or a variant id (`v1`…). */
  id: string;
  /** The file on disk. */
  file: string;
  /** Its same-origin URL path on the server (for the player to fetch). */
  path: string;
}

export interface BlueprintChange {
  file: string;
  path: string;
  /** Identity (canonical content sha256) of the new blueprint. */
  sha256: string;
  /** Identity before the change, so a player knows whether it is showing this file. */
  previous: string | null;
  /** The new blueprint's storage namespace (`bp-…`), for the comments allowlist. */
  namespace: string;
}

/** A partial blueprint the watcher announced: what has arrived of a streamed deck, page or doc. */
export interface BlueprintDraft {
  file: string;
  /** Same-origin path of the draft JSON (`/__protoyard/drafts/<file id>.json`). */
  path: string;
  /** Identity of the part that has arrived (the player recomputes it from the file). */
  sha256: string;
  /** The last complete identity of this file, which the draft grows from. */
  base: string | null;
}

async function readBlueprintText(file: string): Promise<string | null> {
  const info = await lstat(file).catch(() => undefined);
  if (!info?.isFile() || info.isSymbolicLink() || info.size > MAX_BLUEPRINT_BYTES) return null;
  return readFile(file, 'utf8').catch(() => null);
}

/**
 * The part of a truncated deck, page or doc blueprint that already validates
 * (its JSON and identity), or null (complete, an app, nothing paintable yet).
 */
export async function readBlueprintDraft(
  file: string
): Promise<{ sha256: string; json: string } | null> {
  const text = await readBlueprintText(file);
  if (text === null) return null;
  try {
    const painted = await paintStreamedBlueprint(text);
    if (!painted || painted.complete) return null;
    return { sha256: (await blueprintIdentity(painted.blueprint)).sha256, json: painted.json };
  } catch {
    return null;
  }
}

/** Reads one blueprint file and returns its identity, or null when it is missing or invalid. */
export async function readBlueprintIdentity(
  file: string
): Promise<{ sha256: string; namespace: string } | null> {
  const info = await lstat(file).catch(() => undefined);
  if (!info?.isFile() || info.isSymbolicLink() || info.size > MAX_BLUEPRINT_BYTES) return null;
  try {
    const blueprint = await parseQuickBlueprint(
      JSON.parse(await readFile(file, 'utf8')) as unknown
    );
    return await blueprintIdentity(blueprint);
  } catch {
    // Mid-write or invalid: no event. The next settled write is read again.
    return null;
  }
}

/**
 * Storage namespaces of the blueprints an exploration had before each
 * `quick iterate` (its `history/NNNN.json` entries), newest first and capped.
 * A player that kept its world across a change still writes comments there.
 */
export async function historyNamespaces(dir: string, limit = 64): Promise<string[]> {
  return (await historyBlueprints(dir, limit)).map((entry) => entry.namespace);
}

export interface BlueprintWatcher {
  /** The latest identity per watched file id. */
  current(): Record<string, string | null>;
  /** The JSON of a file's current draft, or null when it has none (complete, or never drafted). */
  draft(id: string): string | null;
  close(): void;
}

/**
 * Watches the blueprint files' folders (atomic writes replace the file, so a
 * watch on the file itself would go stale) and calls `onChange` once per
 * settled change whose identity differs from the last one seen.
 */
export async function watchBlueprints(options: {
  files: readonly WatchedBlueprint[];
  onChange: (change: BlueprintChange) => void;
  /** A streamed deck, page or doc grew: the part that has arrived validates (progressive painting). */
  onDraft?: (draft: BlueprintDraft) => void;
  debounceMs?: number;
  /** Longest wait while writes keep coming (default {@link QUICK_DRAFT_INTERVAL_MS}). */
  maxWaitMs?: number;
  /** Injected for tests; defaults to `Date.now`. */
  now?: () => number;
  /** Injected for tests; defaults to `fs.watch`. */
  watchDir?: (dir: string, listener: (name: string | null) => void) => { close(): void };
}): Promise<BlueprintWatcher> {
  const debounceMs = options.debounceMs ?? QUICK_EVENTS_DEBOUNCE_MS;
  const maxWaitMs = Math.max(options.maxWaitMs ?? QUICK_DRAFT_INTERVAL_MS, debounceMs);
  const now = options.now ?? Date.now;
  const watchDir =
    options.watchDir ??
    ((dir: string, listener: (name: string | null) => void) => {
      const watcher: FSWatcher = watch(dir, { persistent: false }, (_event, name) =>
        listener(name === null ? null : String(name))
      );
      watcher.on('error', () => undefined);
      return watcher;
    });
  const state = new Map<string, string | null>();
  for (const entry of options.files) {
    state.set(entry.id, (await readBlueprintIdentity(entry.file))?.sha256 ?? null);
  }
  /** The last draft announced per file (cleared once the file is complete again). */
  const drafts = new Map<string, { sha256: string; json: string }>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** When the oldest unread write of a file arrived (bounds the debounce while writes keep coming). */
  const pendingSince = new Map<string, number>();
  const read = async (entry: WatchedBlueprint) => {
    const identity = await readBlueprintIdentity(entry.file);
    const previous = state.get(entry.id) ?? null;
    if (identity) {
      // A complete blueprint that matches the last one still replaces a draft on screen.
      if (identity.sha256 === previous && !drafts.has(entry.id)) return;
      drafts.delete(entry.id);
      state.set(entry.id, identity.sha256);
      options.onChange({
        file: entry.id,
        path: entry.path,
        sha256: identity.sha256,
        previous,
        namespace: identity.namespace,
      });
      return;
    }
    if (!options.onDraft) return;
    const draft = await readBlueprintDraft(entry.file);
    if (!draft || drafts.get(entry.id)?.sha256 === draft.sha256) return;
    drafts.set(entry.id, draft);
    options.onDraft({
      file: entry.id,
      path: `${QUICK_DRAFTS_PREFIX}${encodeURIComponent(entry.id)}.json`,
      sha256: draft.sha256,
      base: previous,
    });
  };
  const settle = (entry: WatchedBlueprint) => {
    clearTimeout(timers.get(entry.id));
    const since = pendingSince.get(entry.id) ?? now();
    pendingSince.set(entry.id, since);
    const delay = Math.max(0, Math.min(debounceMs, since + maxWaitMs - now()));
    timers.set(
      entry.id,
      setTimeout(() => {
        timers.delete(entry.id);
        pendingSince.delete(entry.id);
        void read(entry);
      }, delay)
    );
  };
  const byDir = new Map<string, WatchedBlueprint[]>();
  for (const entry of options.files) {
    const dir = join(entry.file, '..');
    byDir.set(dir, [...(byDir.get(dir) ?? []), entry]);
  }
  const watchers = [...byDir].map(([dir, entries]) =>
    watchDir(dir, (name) => {
      for (const entry of entries) {
        // Some platforms omit the name; then any change in the folder counts.
        if (name === null || name === 'blueprint.json' || entry.file.endsWith(`/${name}`)) {
          settle(entry);
        }
      }
    })
  );
  return {
    current: () => Object.fromEntries(state),
    draft: (id) => drafts.get(id)?.json ?? null,
    close() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      for (const watcher of watchers) watcher.close();
    },
  };
}

/** One server-sent event frame; data is a single JSON line. */
export function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Same-origin only: no Origin header (same-origin GET/EventSource) or the server's own. */
function sameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  return origin === `http://${request.headers.host ?? ''}`;
}

export interface QuickEventHub {
  /** Handles `/__protoyard/*`; returns false for any other path. */
  route(request: IncomingMessage, response: ServerResponse, pathname: string): boolean;
  /** Sends one `blueprint` event to every open stream. */
  publish(change: BlueprintChange): void;
  /** Sends one `draft` event (a streamed blueprint grew) to every open stream. */
  publishDraft(draft: BlueprintDraft): void;
  clients(): number;
  close(): void;
}

export function createQuickEventHub(options: {
  /** The current identity per watched file id (for `hello`). */
  current: () => Record<string, string | null>;
  /** The comments API base the player should use. */
  commentsPath: string;
  /** The JSON of a watched file's current draft (progressive painting); none without it. */
  draft?: (id: string) => string | null;
}): QuickEventHub {
  const streams = new Set<ServerResponse>();
  const heartbeat = setInterval(() => {
    for (const stream of streams) stream.write(': keep-alive\n\n');
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  return {
    route(request, response, pathname) {
      if (!pathname.startsWith('/__protoyard/')) return false;
      const refuse = (status: number, message: string) => {
        response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(message);
        return true;
      };
      if (request.method !== 'GET' && request.method !== 'HEAD')
        return refuse(405, 'Method not allowed.');
      if (!sameOrigin(request)) return refuse(403, 'Cross-origin requests are refused.');
      if (pathname === QUICK_SERVE_INFO_PATH) {
        response.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        response.end(
          JSON.stringify({
            protocol: QUICK_EVENTS_PROTOCOL,
            events: QUICK_EVENTS_PATH,
            comments: options.commentsPath,
          })
        );
        return true;
      }
      if (pathname.startsWith(QUICK_DRAFTS_PREFIX)) {
        const id = /^([a-z0-9-]{1,40})\.json$/.exec(
          pathname.slice(QUICK_DRAFTS_PREFIX.length)
        )?.[1];
        const json = id ? (options.draft?.(id) ?? null) : null;
        if (json === null) return refuse(404, 'No draft.');
        response.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(request.method === 'HEAD' ? undefined : json);
        return true;
      }
      if (pathname !== QUICK_EVENTS_PATH) return refuse(404, 'Not found.');
      if (streams.size >= MAX_CLIENTS) return refuse(503, 'Too many live-reload connections.');
      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      });
      response.write(`retry: 2000\n\n`);
      response.write(
        sseFrame('hello', { protocol: QUICK_EVENTS_PROTOCOL, blueprints: options.current() })
      );
      streams.add(response);
      const drop = () => streams.delete(response);
      request.on('close', drop);
      response.on('close', drop);
      return true;
    },
    publish(change) {
      const frame = sseFrame('blueprint', {
        file: change.file,
        path: change.path,
        sha256: change.sha256,
        previous: change.previous,
      });
      for (const stream of streams) stream.write(frame);
    },
    publishDraft(draft) {
      const frame = sseFrame('draft', {
        file: draft.file,
        path: draft.path,
        sha256: draft.sha256,
        base: draft.base,
      });
      for (const stream of streams) stream.write(frame);
    },
    clients: () => streams.size,
    close() {
      clearInterval(heartbeat);
      for (const stream of streams) stream.end();
      streams.clear();
    },
  };
}
