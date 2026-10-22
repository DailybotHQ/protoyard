/**
 * Transports for presenter sync. Pure factory helpers; the BroadcastChannel
 * path is optional when the host lacks the API (tests use memory).
 */
import {
  type PresenterMessage,
  parsePresenterMessage,
  presenterChannelName,
  sanitizeNamespace,
} from './protocol.ts';

export type PresenterTransport = {
  readonly name: string;
  post(message: PresenterMessage): void;
  subscribe(handler: (message: PresenterMessage) => void): () => void;
  close(): void;
};

/** In-memory bus for unit tests (same process, no DOM). */
export function createMemoryPresenterTransport(namespace = 'test'): PresenterTransport {
  const name = presenterChannelName(namespace);
  const listeners = new Set<(message: PresenterMessage) => void>();
  return {
    name,
    post(message) {
      const copy = structuredClone(message);
      for (const listener of [...listeners]) listener(copy);
    },
    subscribe(handler) {
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },
    close() {
      listeners.clear();
    },
  };
}

/**
 * BroadcastChannel transport when available. Returns null when the host has
 * no BroadcastChannel (callers fall back to in-page presenter mode).
 */
export function createBroadcastPresenterTransport(
  namespace: string,
  channelFactory: new (name: string) => BroadcastChannel = typeof BroadcastChannel !== 'undefined'
    ? BroadcastChannel
    : (undefined as unknown as new (
        name: string
      ) => BroadcastChannel)
): PresenterTransport | null {
  if (typeof channelFactory !== 'function') return null;
  const name = presenterChannelName(sanitizeNamespace(namespace));
  let channel: BroadcastChannel;
  try {
    channel = new channelFactory(name);
  } catch {
    return null;
  }
  const listeners = new Set<(message: PresenterMessage) => void>();
  const onMessage = (event: MessageEvent) => {
    const parsed = parsePresenterMessage(event.data);
    if (!parsed) return;
    for (const listener of [...listeners]) listener(parsed);
  };
  channel.addEventListener('message', onMessage);
  return {
    name,
    post(message) {
      try {
        channel.postMessage(message);
      } catch {
        // Closed or structured-clone failure — drop silently.
      }
    },
    subscribe(handler) {
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },
    close() {
      listeners.clear();
      channel.removeEventListener('message', onMessage);
      try {
        channel.close();
      } catch {
        // already closed
      }
    },
  };
}
