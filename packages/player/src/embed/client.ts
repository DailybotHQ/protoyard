import {
  isPlayerMessage,
  PLAYER_PROTOCOL,
  type PlayerIssue,
  type PlayerMessage,
  type PlayerRequestType,
} from './protocol.ts';

/**
 * The embedding side of `protoyard-player/1`, for pages that frame the
 * player (protoyard.app/play, `protoyard quick` iterate):
 *
 *   const player = connectPlayer({ frame: iframe, playerOrigin: 'https://protoyard.app' });
 *   await player.ready;
 *   const { namespace } = await player.load(blueprint);
 *   await player.replace(editedBlueprint); // live iterate
 *
 * The frame's URL must name this page's origin in `?embedder=`. Messages are
 * accepted only from the frame's window at `playerOrigin`.
 */

export class PlayerEmbedError extends Error {
  readonly issues: PlayerIssue[];
  constructor(message: string, issues: PlayerIssue[] = []) {
    super(message);
    this.name = 'PlayerEmbedError';
    this.issues = issues;
  }
}

/** The host window surface the client needs (tests pass a fake). */
export interface ClientWindow {
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

export interface ConnectPlayerOptions {
  /** The iframe running the player (or anything exposing its window). */
  frame: { contentWindow: { postMessage(message: unknown, targetOrigin: string): void } | null };
  /** The player's exact origin; never `*`. */
  playerOrigin: string;
  window?: ClientWindow;
  /** How long `ready` and each request may take (default 30 s). */
  timeoutMs?: number;
}

export interface PlayerConnection {
  /** Resolves with the player's `ready` message. */
  ready: Promise<Extract<PlayerMessage, { type: 'ready' }>>;
  load(blueprint: unknown): Promise<{ namespace: string; name: string }>;
  replace(blueprint: unknown): Promise<{ namespace: string; name: string }>;
  close(): void;
}

export function connectPlayer(options: ConnectPlayerOptions): PlayerConnection {
  const { playerOrigin } = options;
  if (playerOrigin === '*' || !/^https?:\/\/[^/]+$/.test(playerOrigin)) {
    throw new PlayerEmbedError(
      `playerOrigin must be an exact http(s) origin, got "${playerOrigin}".`
    );
  }
  const host = options.window ?? (globalThis as unknown as ClientWindow);
  const timeoutMs = options.timeoutMs ?? 30_000;
  const waiting = new Map<
    string,
    { resolve(value: { namespace: string; name: string }): void; reject(error: Error): void }
  >();
  let sequence = 0;
  let closed = false;
  let markReady: (message: Extract<PlayerMessage, { type: 'ready' }>) => void = () => {};
  let failReady: (error: Error) => void = () => {};
  const ready = new Promise<Extract<PlayerMessage, { type: 'ready' }>>((resolve, reject) => {
    markReady = resolve;
    failReady = reject;
  });
  const readyTimer = setTimeout(
    () => failReady(new PlayerEmbedError('The player did not report ready in time.')),
    timeoutMs
  );

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== playerOrigin) return;
    if (!options.frame.contentWindow || event.source !== (options.frame.contentWindow as unknown))
      return;
    const data: unknown = event.data;
    if (!isPlayerMessage(data)) return;
    if (data.type === 'ready') {
      clearTimeout(readyTimer);
      markReady(data);
      return;
    }
    const entry = waiting.get(data.id);
    if (!entry) return;
    waiting.delete(data.id);
    if (data.type === 'loaded') entry.resolve({ namespace: data.namespace, name: data.name });
    else
      entry.reject(
        new PlayerEmbedError(
          data.issues[0]?.message ?? 'The player refused the blueprint.',
          data.issues
        )
      );
  };
  host.addEventListener('message', onMessage);

  function send(type: PlayerRequestType, blueprint: unknown) {
    if (closed) return Promise.reject(new PlayerEmbedError('The connection is closed.'));
    const target = options.frame.contentWindow;
    if (!target) return Promise.reject(new PlayerEmbedError('The player frame has no window yet.'));
    sequence += 1;
    const id = `req-${sequence}`;
    return new Promise<{ namespace: string; name: string }>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new PlayerEmbedError(`The player did not answer ${type} in time.`));
      }, timeoutMs);
      waiting.set(id, {
        resolve(value) {
          clearTimeout(timer);
          resolve(value);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        },
      });
      target.postMessage({ protocol: PLAYER_PROTOCOL, type, id, blueprint }, playerOrigin);
    });
  }

  return {
    ready,
    load: (blueprint) => send('load', blueprint),
    replace: (blueprint) => send('replace', blueprint),
    close() {
      closed = true;
      clearTimeout(readyTimer);
      host.removeEventListener('message', onMessage);
      for (const entry of waiting.values())
        entry.reject(new PlayerEmbedError('The connection is closed.'));
      waiting.clear();
    },
  };
}
