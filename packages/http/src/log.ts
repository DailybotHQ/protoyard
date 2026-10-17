/** One request as DevTools shows it. Bodies are truncated previews, never live objects. */
export interface NetworkLogEntry {
  id: number;
  /** Simulated time of the request (the prototype's clock). */
  at: string;
  method: string;
  url: string;
  /** Matched route key (`GET /deals/:id`), or null for 404/405. */
  route: string | null;
  /** Null when the request never got a response (offline). */
  status: number | null;
  /** Wall-clock duration, including simulated latency. */
  durationMs: number;
  requestBody?: string;
  responseBody?: string;
  /** Set for offline/network failures and handler crashes. */
  error?: string;
}

export interface NetworkLog {
  entries(): readonly NetworkLogEntry[];
  subscribe(listener: (entries: readonly NetworkLogEntry[]) => void): () => void;
  clear(): void;
}

export const DEFAULT_LOG_SIZE = 200;
const PREVIEW_CHARS = 2_000;

export function preview(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text === undefined) return undefined;
  return text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}…` : text;
}

/** Ring buffer: keeps the newest `size` entries, oldest first. */
export function createNetworkLog(size = DEFAULT_LOG_SIZE) {
  let entries: NetworkLogEntry[] = [];
  let nextId = 1;
  const listeners = new Set<(entries: readonly NetworkLogEntry[]) => void>();
  const emit = () => {
    for (const listener of [...listeners]) {
      try {
        listener(entries);
      } catch {
        // A broken DevTools panel must not break the app's requests.
      }
    }
  };
  const log: NetworkLog & { add(entry: Omit<NetworkLogEntry, 'id'>): NetworkLogEntry } = {
    entries: () => entries,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clear() {
      entries = [];
      emit();
    },
    add(entry) {
      const full = { id: nextId++, ...entry };
      entries = [...entries.slice(Math.max(0, entries.length - size + 1)), full];
      emit();
      return full;
    },
  };
  return log;
}
