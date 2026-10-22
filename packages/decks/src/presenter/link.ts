/**
 * Bidirectional presenter position link over a transport. Pure aside from the
 * transport's post/subscribe. Echoes are ignored via a generation token held
 * only in memory (not on the wire).
 */
import { type PresenterMessage, presenterMessage } from './protocol.ts';
import type { PresenterTransport } from './transport.ts';

export type PresenterPosition = {
  slideId: string;
  step: number;
};

export type PresenterLink = {
  /** Publish the local position to peers. */
  publish(position: PresenterPosition, type?: 'sync' | 'hello'): void;
  /** Ask peers for their position. */
  request(): void;
  destroy(): void;
};

export type PresenterLinkOptions = {
  transport: PresenterTransport;
  /** Called when a peer sends a sync/hello with a different position. */
  onRemote: (position: PresenterPosition, message: PresenterMessage) => void;
  /** Initial identity for hello/request when no position is known yet. */
  initial?: PresenterPosition;
};

/**
 * Wire a transport to position callbacks. Malformed messages never reach
 * `onRemote` (the transport already filters via parsePresenterMessage).
 */
export function createPresenterLink(options: PresenterLinkOptions): PresenterLink {
  let lastPublished: PresenterPosition | null = options.initial ?? null;
  let alive = true;

  const unsubscribe = options.transport.subscribe((message) => {
    if (!alive) return;
    if (message.type === 'request') {
      if (lastPublished) {
        options.transport.post(presenterMessage('sync', lastPublished.slideId, lastPublished.step));
      }
      return;
    }
    // hello and sync both carry position
    if (
      lastPublished &&
      lastPublished.slideId === message.slideId &&
      lastPublished.step === message.step
    ) {
      return; // echo / already applied
    }
    const position = { slideId: message.slideId, step: message.step };
    lastPublished = position;
    options.onRemote(position, message);
  });

  return {
    publish(position, type = 'sync') {
      if (!alive) return;
      lastPublished = position;
      options.transport.post(presenterMessage(type, position.slideId, position.step));
    },
    request() {
      if (!alive) return;
      const pos = lastPublished ?? { slideId: 'intro', step: 0 };
      options.transport.post(presenterMessage('request', pos.slideId, pos.step));
    },
    destroy() {
      alive = false;
      unsubscribe();
      options.transport.close();
    },
  };
}
