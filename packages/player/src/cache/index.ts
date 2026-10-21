import { canonicalJson } from '@protoyard/blueprint';
import type { GenerateContext, PrototypeDefinition, Scenario, WorldSeed } from '@protoyard/core';
import { Dexie, type Table } from 'dexie';

/**
 * A content-addressed cache of generated worlds (ADR-030). A world
 * is a pure function of the blueprint, the scenario and the generator version,
 * so the player keeps compressed copies and reopens a scenario switch, a reset
 * or a variant of the same blueprint without regenerating. Everything read
 * back is untrusted: entries are size-capped, validated against the snapshot
 * limits and dropped when they do not parse. The cache is an optimization:
 * when it fails, generation runs as if it were empty.
 */

/** IndexedDB database the player keeps cached worlds in (one per origin). */
export const PLAYER_WORLD_CACHE_DATABASE = 'protoyard.player.worlds';
/** Default cap on the compressed bytes kept; least recently used entries go first. */
export const DEFAULT_WORLD_CACHE_MAX_BYTES = 48 * 1024 * 1024;
/** A cached world may not inflate past this (the snapshot import cap, `SNAPSHOT_MAX_BYTES`). */
export const WORLD_CACHE_MAX_JSON_BYTES = 25 * 1024 * 1024;
/** Rows a cached world may hold (the snapshot import cap, `SNAPSHOT_MAX_ROWS`). */
export const WORLD_CACHE_MAX_ROWS = 250_000;

export interface WorldCacheKey {
  /** `blueprintIdentity(blueprint).sha256`. */
  blueprint: string;
  scenarioId: string;
  seed: number;
  generatorVersion: number;
  /** Digest of the whole resolved scenario (density, reference time, organization…). */
  scenario: string;
}

export interface WorldCacheEntry {
  key: string;
  /** gzip of the world's JSON. */
  bytes: Uint8Array;
  size: number;
  lastUsed: number;
}

/** Where entries live: IndexedDB in the browser, memory in tests or when storage is blocked. */
export interface WorldCacheStore {
  get(key: string): Promise<WorldCacheEntry | undefined>;
  put(entry: WorldCacheEntry): Promise<void>;
  touch(key: string, lastUsed: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Every entry's key, size and last use, without the bytes. */
  list(): Promise<Pick<WorldCacheEntry, 'key' | 'size' | 'lastUsed'>[]>;
  close(): void;
}

export interface WorldCacheStats {
  hits: number;
  misses: number;
  writes: number;
  evictions: number;
  /** Entries dropped because they failed to inflate, parse or validate. */
  rejected: number;
}

export interface WorldCache {
  get(key: WorldCacheKey): Promise<WorldSeed | null>;
  put(key: WorldCacheKey, world: WorldSeed): Promise<void>;
  /** Resolves when every write started so far has finished (tests, page unload). */
  idle(): Promise<void>;
  readonly stats: Readonly<WorldCacheStats>;
}

export interface WorldCacheOptions {
  store: WorldCacheStore;
  maxBytes?: number;
  /** Clock for LRU order (tests). */
  now?: () => number;
}

class WorldCacheDatabase extends Dexie {
  worlds!: Table<WorldCacheEntry, string>;

  constructor(indexedDB?: IDBFactory) {
    super(PLAYER_WORLD_CACHE_DATABASE, indexedDB ? { indexedDB } : undefined);
    this.version(1).stores({ worlds: 'key,lastUsed' });
  }
}

/** The IndexedDB store; throws when IndexedDB is unavailable (use the memory store then). */
export function createIndexedDbWorldCacheStore(indexedDB?: IDBFactory): WorldCacheStore {
  const factory = indexedDB ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (!factory) throw new Error('IndexedDB is unavailable.');
  const db = new WorldCacheDatabase(factory);
  return {
    get: (key) => db.worlds.get(key),
    put: async (entry) => {
      await db.worlds.put(entry);
    },
    touch: async (key, lastUsed) => {
      await db.worlds.update(key, { lastUsed });
    },
    delete: (key) => db.worlds.delete(key),
    list: async () => {
      const rows: Pick<WorldCacheEntry, 'key' | 'size' | 'lastUsed'>[] = [];
      await db.worlds.each(({ key, size, lastUsed }) => {
        rows.push({ key, size, lastUsed });
      });
      return rows;
    },
    close: () => db.close(),
  };
}

export function createMemoryWorldCacheStore(): WorldCacheStore {
  const entries = new Map<string, WorldCacheEntry>();
  return {
    get: async (key) => entries.get(key),
    put: async (entry) => {
      entries.set(entry.key, entry);
    },
    touch: async (key, lastUsed) => {
      const entry = entries.get(key);
      if (entry) entries.set(key, { ...entry, lastUsed });
    },
    delete: async (key) => {
      entries.delete(key);
    },
    list: async () =>
      [...entries.values()].map(({ key, size, lastUsed }) => ({ key, size, lastUsed })),
    close: () => entries.clear(),
  };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The cache key for a world: the blueprint identity, the scenario and the generator version. */
export async function worldCacheKey(
  blueprintSha256: string,
  scenario: Scenario,
  generatorVersion: number
): Promise<WorldCacheKey> {
  return {
    blueprint: blueprintSha256,
    scenarioId: scenario.id,
    seed: scenario.seed,
    generatorVersion,
    scenario: (await sha256Hex(canonicalJson(scenario))).slice(0, 32),
  };
}

const keyString = (key: WorldCacheKey) =>
  [key.blueprint, key.scenarioId, key.seed, key.generatorVersion, key.scenario].join(':');

function streamOf(bytes: Uint8Array<ArrayBuffer>): ReadableStream<BufferSource> {
  return new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/** Reads a stream into one buffer, or null past `cap` bytes (the read stops there). */
async function collect(
  stream: ReadableStream<Uint8Array>,
  cap: number
): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Bytes fed to the compressor per task, so a large world never blocks the main thread. */
const COMPRESS_SLICE = 64 * 1024;

/** Lets the browser run other tasks (input, rendering) between slices. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function compress(world: WorldSeed): Promise<Uint8Array<ArrayBuffer> | null> {
  const json = new TextEncoder().encode(JSON.stringify(world));
  if (json.byteLength > WORLD_CACHE_MAX_JSON_BYTES) return null;
  const stream = new CompressionStream('gzip');
  const output = collect(stream.readable, Number.POSITIVE_INFINITY);
  const writer = stream.writable.getWriter();
  // One write for the whole world compressed a massive world in a single 150 ms
  // main-thread task; slices keep every task short.
  for (let offset = 0; offset < json.byteLength; offset += COMPRESS_SLICE) {
    await writer.write(json.subarray(offset, offset + COMPRESS_SLICE));
    await nextTask();
  }
  await writer.close();
  return output;
}

async function inflate(bytes: Uint8Array): Promise<unknown> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const json = await collect(
    streamOf(copy).pipeThrough(new DecompressionStream('gzip')),
    WORLD_CACHE_MAX_JSON_BYTES
  );
  if (!json) throw new Error('Cached world is larger than the snapshot limit.');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(json)) as unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Checks a value read back from storage is a world the runtime can load:
 * the WorldSeed shape, rows that are plain objects with a string or number
 * id, and no more rows than a snapshot import allows.
 */
export function validateCachedWorld(value: unknown): WorldSeed {
  if (!isRecord(value)) throw new Error('Cached world is not an object.');
  for (const list of ['organizations', 'personas', 'memberships'] as const) {
    if (!Array.isArray(value[list]) || !value[list].every(isRecord)) {
      throw new Error(`Cached world has an invalid ${list} list.`);
    }
  }
  if (
    value.events !== undefined &&
    (!Array.isArray(value.events) || !value.events.every(isRecord))
  ) {
    throw new Error('Cached world has an invalid events list.');
  }
  if (!isRecord(value.tables)) throw new Error('Cached world has no tables.');
  let rows = 0;
  for (const [name, table] of Object.entries(value.tables)) {
    if (!Array.isArray(table)) throw new Error(`Cached table ${name} is not a list.`);
    rows += table.length;
    if (rows > WORLD_CACHE_MAX_ROWS) {
      throw new Error(`Cached world has more than ${WORLD_CACHE_MAX_ROWS} rows.`);
    }
    for (const row of table) {
      if (!isRecord(row) || !['string', 'number'].includes(typeof row.id)) {
        throw new Error(`Cached table ${name} has a row without a valid id.`);
      }
    }
  }
  return value as unknown as WorldSeed;
}

export function createWorldCache(options: WorldCacheOptions): WorldCache {
  const { store } = options;
  const maxBytes = options.maxBytes ?? DEFAULT_WORLD_CACHE_MAX_BYTES;
  const now = options.now ?? (() => Date.now());
  const stats: WorldCacheStats = { hits: 0, misses: 0, writes: 0, evictions: 0, rejected: 0 };
  const pending = new Set<Promise<void>>();

  async function evict(): Promise<void> {
    const entries = (await store.list()).sort((a, b) => a.lastUsed - b.lastUsed);
    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    for (const entry of entries) {
      if (total <= maxBytes) break;
      await store.delete(entry.key);
      total -= entry.size;
      stats.evictions += 1;
    }
  }

  return {
    stats,
    async get(key) {
      const id = keyString(key);
      let entry: WorldCacheEntry | undefined;
      try {
        entry = await store.get(id);
      } catch {
        stats.misses += 1;
        return null;
      }
      if (!entry) {
        stats.misses += 1;
        return null;
      }
      try {
        const world = validateCachedWorld(await inflate(entry.bytes));
        stats.hits += 1;
        await store.touch(id, now()).catch(() => undefined);
        return world;
      } catch {
        stats.rejected += 1;
        stats.misses += 1;
        await store.delete(id).catch(() => undefined);
        return null;
      }
    },
    put(key, world) {
      const write = (async () => {
        try {
          const bytes = await compress(world);
          if (!bytes || bytes.byteLength > maxBytes) return;
          await store.put({ key: keyString(key), bytes, size: bytes.byteLength, lastUsed: now() });
          stats.writes += 1;
          await evict();
        } catch {
          // A full or blocked store only means the next open regenerates.
        }
      })();
      pending.add(write);
      void write.finally(() => pending.delete(write));
      return write;
    },
    async idle() {
      while (pending.size > 0) await Promise.all([...pending]);
    },
  };
}

export interface WithWorldCacheOptions {
  /** `blueprintIdentity(blueprint).sha256`. */
  blueprintSha256: string;
  cache: WorldCache;
}

/**
 * Serves `definition.generate` from the cache when the same blueprint,
 * scenario and generator version were generated before, and stores what it
 * generates otherwise. The runtime contract is unchanged.
 */
export function withWorldCache(
  definition: PrototypeDefinition,
  options: WithWorldCacheOptions
): PrototypeDefinition {
  const generatorVersion = definition.generatorVersion ?? 0;
  const cached = async (scenario: Scenario, make: () => Promise<WorldSeed>): Promise<WorldSeed> => {
    const key = await worldCacheKey(options.blueprintSha256, scenario, generatorVersion);
    const hit = await options.cache.get(key);
    if (hit) return hit;
    const world = await make();
    // Not awaited: the world loads now and is compressed and stored in the background.
    void options.cache.put(key, world);
    return world;
  };
  return {
    ...definition,
    async generate(context: GenerateContext): Promise<WorldSeed> {
      return cached(context.scenario, async () => definition.generate(context));
    },
    // The runtime prefers generateWorld when a definition has one, so the cache must wrap it too.
    ...(definition.generateWorld
      ? {
          async generateWorld(scenario: Scenario): Promise<WorldSeed> {
            return cached(scenario, async () => {
              const world = await definition.generateWorld?.(scenario);
              if (!world) throw new Error('generateWorld returned no world');
              return world;
            });
          },
        }
      : {}),
  };
}

/** The browser cache: IndexedDB when available, otherwise memory for this page only. */
export function createPlayerWorldCache(indexedDB?: IDBFactory): WorldCache {
  let store: WorldCacheStore;
  try {
    store = createIndexedDbWorldCacheStore(indexedDB);
  } catch {
    store = createMemoryWorldCacheStore();
  }
  return createWorldCache({ store });
}
