import { type FSWatcher, watch } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { blueprintIdentity, parseBlueprint } from '@protoyard/blueprint';

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
 *
 * The server binds 127.0.0.1 and checks the Host header (quick serve), and
 * these routes also refuse a cross-origin request.
 */

export const QUICK_EVENTS_PROTOCOL = 1;
export const QUICK_EVENTS_PATH = '/__protoyard/events';
export const QUICK_SERVE_INFO_PATH = '/__protoyard/serve.json';
/** Writes that land within this window are one change. */
export const QUICK_EVENTS_DEBOUNCE_MS = 150;
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

/** Reads one blueprint file and returns its identity, or null when it is missing or invalid. */
export async function readBlueprintIdentity(
  file: string
): Promise<{ sha256: string; namespace: string } | null> {
  const info = await lstat(file).catch(() => undefined);
  if (!info?.isFile() || info.isSymbolicLink() || info.size > MAX_BLUEPRINT_BYTES) return null;
  try {
    const blueprint = parseBlueprint(JSON.parse(await readFile(file, 'utf8')) as unknown);
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
  const names = (await readdir(join(dir, 'history')).catch(() => [] as string[]))
    .filter((name) => /^\d{4}\.json$/.test(name))
    .sort()
    .reverse()
    .slice(0, limit);
  const namespaces: string[] = [];
  for (const name of names) {
    const path = join(dir, 'history', name);
    const info = await lstat(path).catch(() => undefined);
    if (!info?.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024) continue;
    try {
      const entry = JSON.parse(await readFile(path, 'utf8')) as { before?: { text?: unknown } };
      if (typeof entry.before?.text !== 'string') continue;
      const blueprint = parseBlueprint(JSON.parse(entry.before.text) as unknown);
      namespaces.push((await blueprintIdentity(blueprint)).namespace);
    } catch {
      // A damaged entry only loses its namespace; quick undo reports it.
    }
  }
  return namespaces;
}

export interface BlueprintWatcher {
  /** The latest identity per watched file id. */
  current(): Record<string, string | null>;
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
  debounceMs?: number;
  /** Injected for tests; defaults to `fs.watch`. */
  watchDir?: (dir: string, listener: (name: string | null) => void) => { close(): void };
}): Promise<BlueprintWatcher> {
  const debounceMs = options.debounceMs ?? QUICK_EVENTS_DEBOUNCE_MS;
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
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const settle = (entry: WatchedBlueprint) => {
    clearTimeout(timers.get(entry.id));
    timers.set(
      entry.id,
      setTimeout(() => {
        timers.delete(entry.id);
        void readBlueprintIdentity(entry.file).then((identity) => {
          if (!identity) return;
          const previous = state.get(entry.id) ?? null;
          if (identity.sha256 === previous) return;
          state.set(entry.id, identity.sha256);
          options.onChange({
            file: entry.id,
            path: entry.path,
            sha256: identity.sha256,
            previous,
            namespace: identity.namespace,
          });
        });
      }, debounceMs)
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
  clients(): number;
  close(): void;
}

export function createQuickEventHub(options: {
  /** The current identity per watched file id (for `hello`). */
  current: () => Record<string, string | null>;
  /** The comments API base the player should use. */
  commentsPath: string;
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
    clients: () => streams.size,
    close() {
      clearInterval(heartbeat);
      for (const stream of streams) stream.end();
      streams.clear();
    },
  };
}
