import { type Blueprint, loadUntrustedBlueprint } from '@protoyard/blueprint';
import {
  checkRequest,
  MAX_MESSAGE_BLUEPRINT_BYTES,
  PLAYER_PROTOCOL,
  type PlayerIssue,
  type PlayerMessage,
  type PlayerRequest,
  type PlayerRequestType,
  playerIssue,
} from './protocol.ts';

/** The window surface the listener needs (tests pass a fake). */
export interface EmbedWindow {
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

/** The parent the player answers; `postMessage` always names an exact origin. */
export interface EmbedParent {
  postMessage(message: PlayerMessage, targetOrigin: string): void;
}

export interface EmbedListenerOptions {
  window: EmbedWindow;
  parent: EmbedParent;
  /** Exact origins allowed to send requests (see `embedderOrigins`). */
  origins: readonly string[];
  /**
   * Runs a validated blueprint. Resolves with what the parent is told; a
   * throw is reported as `boot-failed`, never as success.
   */
  apply(blueprint: Blueprint, type: PlayerRequestType): Promise<{ namespace: string }>;
  maxBytes?: number;
}

export interface EmbedListener {
  /** Settles when no request is running or waiting (tests). */
  idle(): Promise<void>;
  stop(): void;
}

interface Pending {
  request: PlayerRequest;
  origin: string;
}

/**
 * Listens for `protoyard-player/1` requests from the parent window and
 * answers each one exactly once. Requests run one at a time; while one runs,
 * only the newest waiting request is kept (live iterate sends many
 * `replace`s), and the dropped one is answered `superseded`.
 */
export function createEmbedListener(options: EmbedListenerOptions): EmbedListener {
  const origins = new Set(options.origins);
  const maxBytes = options.maxBytes ?? MAX_MESSAGE_BLUEPRINT_BYTES;
  let running: Promise<void> | null = null;
  let waiting: Pending | null = null;
  let stopped = false;

  const reply = (message: PlayerMessage, origin: string) => {
    if (!stopped) options.parent.postMessage(message, origin);
  };
  const fail = (id: string, issues: PlayerIssue[], origin: string) =>
    reply({ protocol: PLAYER_PROTOCOL, type: 'error', id, issues }, origin);

  async function run({ request, origin }: Pending): Promise<void> {
    const loaded = loadUntrustedBlueprint(request.blueprint, { maxBytes });
    if (!loaded.success) {
      fail(request.id, loaded.issues, origin);
      return;
    }
    try {
      const { namespace } = await options.apply(loaded.blueprint, request.type);
      reply(
        {
          protocol: PLAYER_PROTOCOL,
          type: 'loaded',
          id: request.id,
          namespace,
          name: loaded.blueprint.name,
        },
        origin
      );
    } catch (error) {
      fail(
        request.id,
        [
          playerIssue(
            'boot-failed',
            `The blueprint is valid but the prototype did not start: ${error instanceof Error ? error.message : String(error)}`.slice(
              0,
              500
            ),
            'Check the blueprint in `protoyard blueprint validate`, then send it again.'
          ),
        ],
        origin
      );
    }
  }

  function drain(): void {
    if (running || !waiting || stopped) return;
    const next = waiting;
    waiting = null;
    running = run(next).finally(() => {
      running = null;
      drain();
    });
  }

  const onMessage = (event: MessageEvent) => {
    if (stopped) return;
    // Only the parent, and only from an allowed origin: everything else is ignored.
    if (event.source !== (options.parent as unknown)) return;
    if (!origins.has(event.origin)) return;
    const check = checkRequest(event.data, maxBytes);
    if (check.kind === 'ignore') return;
    if (check.kind === 'reject') {
      fail(check.id, check.issues, event.origin);
      return;
    }
    if (waiting) {
      fail(
        waiting.request.id,
        [
          playerIssue(
            'superseded',
            'A newer blueprint arrived before this one started.',
            'Nothing to do: the newest blueprint is the one that runs.'
          ),
        ],
        waiting.origin
      );
    }
    waiting = { request: check.request, origin: event.origin };
    drain();
  };

  options.window.addEventListener('message', onMessage);
  for (const origin of origins) {
    reply(
      { protocol: PLAYER_PROTOCOL, type: 'ready', accepts: ['load', 'replace'], maxBytes },
      origin
    );
  }

  return {
    async idle() {
      while (running || waiting) await (running ?? Promise.resolve());
    },
    stop() {
      stopped = true;
      waiting = null;
      options.window.removeEventListener('message', onMessage);
    },
  };
}
