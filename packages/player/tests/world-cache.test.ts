// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
  blueprintIdentity,
  definePrototypeFromBlueprint,
  parseBlueprint,
} from '@protoyard/blueprint';
import { parseScenario, type Scenario, SNAPSHOT_MAX_BYTES, type WorldSeed } from '@protoyard/core';
import { SNAPSHOT_MAX_ROWS } from '@protoyard/runtime';
import { createGenerateContext } from '@protoyard/scenarios';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  createIndexedDbWorldCacheStore,
  createMemoryWorldCacheStore,
  createWorldCache,
  validateCachedWorld,
  WORLD_CACHE_MAX_JSON_BYTES,
  WORLD_CACHE_MAX_ROWS,
  type WorldCacheStore,
  withWorldCache,
  worldCacheKey,
} from '../src/cache/index.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const raw = JSON.parse(readFileSync(join(ROOT, 'blueprints/crm.json'), 'utf8'));
const blueprint = parseBlueprint(raw);

const scenario = (seed = 7, id = 'cache-check'): Scenario =>
  parseScenario({
    id,
    name: 'Cache check',
    seed,
    referenceTime: '2026-06-15T12:00:00.000Z',
    density: 'normal',
    organization: { id: 'org_cache', name: 'Cache Org', size: 6, ageDays: 90, subscription: 'pro' },
  });

async function setup(store: WorldCacheStore = createMemoryWorldCacheStore(), maxBytes?: number) {
  const { sha256 } = await blueprintIdentity(blueprint);
  const { definition } = definePrototypeFromBlueprint(blueprint, { namespace: 'bp-cachetest' });
  let clock = 1_000;
  const cache = createWorldCache({ store, now: () => ++clock, ...(maxBytes ? { maxBytes } : {}) });
  return { sha256, definition, cache };
}

const worldOf = (
  definition: {
    generate: (c: ReturnType<typeof createGenerateContext>) => Promise<WorldSeed> | WorldSeed;
  },
  s: Scenario
) => Promise.resolve(definition.generate(createGenerateContext(s)));

const opened: WorldCacheStore[] = [];
afterEach(() => {
  for (const store of opened.splice(0)) store.close();
});

describe('world cache', () => {
  it('uses the snapshot import limits', () => {
    expect(WORLD_CACHE_MAX_JSON_BYTES).toBe(SNAPSHOT_MAX_BYTES);
    expect(WORLD_CACHE_MAX_ROWS).toBe(SNAPSHOT_MAX_ROWS);
  });

  it('returns a stored world byte for byte, and misses on any key change', async () => {
    const { sha256, definition, cache } = await setup();
    const s = scenario();
    const key = await worldCacheKey(sha256, s, definition.generatorVersion ?? 0);
    expect(await cache.get(key)).toBeNull();
    const world = await worldOf(definition, s);
    await cache.put(key, world);
    const cached = await cache.get(key);
    expect(JSON.stringify(cached)).toBe(JSON.stringify(world));
    expect(cache.stats).toMatchObject({ hits: 1, misses: 1, writes: 1, rejected: 0 });

    const variants = [
      await worldCacheKey(sha256, scenario(8), definition.generatorVersion ?? 0),
      await worldCacheKey(sha256, scenario(7, 'other-id'), definition.generatorVersion ?? 0),
      await worldCacheKey(sha256, { ...s, density: 'sparse' }, definition.generatorVersion ?? 0),
      await worldCacheKey(sha256, s, (definition.generatorVersion ?? 0) + 1),
      await worldCacheKey('0'.repeat(64), s, definition.generatorVersion ?? 0),
    ];
    for (const variant of variants) expect(await cache.get(variant)).toBeNull();
  });

  it('serves generate from the cache, and regenerates when the generator version changes', async () => {
    const { sha256, definition, cache } = await setup();
    const generate = vi.fn(definition.generate);
    const wrapped = withWorldCache({ ...definition, generate }, { blueprintSha256: sha256, cache });
    const first = await worldOf(wrapped, scenario());
    await cache.idle();
    const second = await worldOf(wrapped, scenario());
    expect(generate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(second).not.toBe(first);

    const bumped = withWorldCache(
      { ...definition, generate, generatorVersion: (definition.generatorVersion ?? 0) + 1 },
      { blueprintSha256: sha256, cache }
    );
    await worldOf(bumped, scenario());
    await cache.idle();
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('also caches generateWorld, the path the runtime prefers when a definition has it', async () => {
    const { sha256, definition, cache } = await setup();
    const generate = vi.fn(definition.generate);
    const generateWorld = vi.fn(async (s: Scenario) =>
      definition.generate(createGenerateContext(s))
    );
    const wrapped = withWorldCache(
      { ...definition, generate, generateWorld },
      { blueprintSha256: sha256, cache }
    );
    expect(wrapped.generateWorld).toBeTypeOf('function');
    const first = await wrapped.generateWorld?.(scenario());
    await cache.idle();
    const second = await wrapped.generateWorld?.(scenario());
    expect(generateWorld).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    // A definition without the hook does not gain one.
    expect(
      withWorldCache(definition, { blueprintSha256: sha256, cache }).generateWorld
    ).toBeUndefined();
  });

  it('hands the world to the runtime without waiting for the cache write', async () => {
    const stalled: WorldCacheStore = {
      ...createMemoryWorldCacheStore(),
      put: () => new Promise(() => {}),
    };
    const { sha256, definition, cache } = await setup(stalled);
    const wrapped = withWorldCache(definition, { blueprintSha256: sha256, cache });
    const world = await worldOf(wrapped, scenario());
    expect(world.tables).toBeTruthy();
    expect(cache.stats.writes).toBe(0);
  });

  it('drops corrupt, oversized and invalid entries instead of loading them', async () => {
    const store = createMemoryWorldCacheStore();
    const { sha256, definition, cache } = await setup(store);
    const key = await worldCacheKey(sha256, scenario(), definition.generatorVersion ?? 0);
    const keyText = [
      key.blueprint,
      key.scenarioId,
      key.seed,
      key.generatorVersion,
      key.scenario,
    ].join(':');
    const plant = async (bytes: Uint8Array) => {
      await store.put({ key: keyText, bytes, size: bytes.byteLength, lastUsed: 1 });
      expect(await cache.get(key)).toBeNull();
      expect(await store.get(keyText)).toBeUndefined();
    };
    const rows = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `r${i}` }));
    const world = { organizations: [], personas: [], memberships: [] };
    await plant(new Uint8Array([1, 2, 3, 4]));
    await plant(gzipSync('{ not json'));
    await plant(gzipSync(JSON.stringify({ ...world, tables: { deals: [{ name: 'no id' }] } })));
    await plant(gzipSync(JSON.stringify({ tables: {} })));
    await plant(gzipSync(JSON.stringify({ ...world, tables: { t: rows(SNAPSHOT_MAX_ROWS + 1) } })));
    // A decompression bomb stops at the snapshot byte cap.
    await plant(gzipSync(Buffer.alloc(WORLD_CACHE_MAX_JSON_BYTES + 1024, 0x20)));
    expect(cache.stats.rejected).toBe(6);
    expect(() => validateCachedWorld({ ...world, tables: { t: rows(3) } })).not.toThrow();
  });

  it('evicts the least recently used worlds past the size cap', async () => {
    const store = createMemoryWorldCacheStore();
    const probe = await setup();
    const sample = await worldOf(probe.definition, scenario(1));
    const oneEntry = gzipSync(JSON.stringify(sample)).byteLength;
    const { sha256, definition, cache } = await setup(store, Math.ceil(oneEntry * 2.6));
    const keys = await Promise.all(
      [1, 2, 3].map((seed) =>
        worldCacheKey(sha256, scenario(seed), definition.generatorVersion ?? 0)
      )
    );
    await cache.put(keys[0]!, await worldOf(definition, scenario(1)));
    await cache.put(keys[1]!, await worldOf(definition, scenario(2)));
    expect(await cache.get(keys[0]!)).not.toBeNull(); // seed 1 is now the most recent
    await cache.put(keys[2]!, await worldOf(definition, scenario(3)));
    expect(cache.stats.evictions).toBe(1);
    expect(await cache.get(keys[1]!)).toBeNull(); // seed 2 was least recently used
    expect(await cache.get(keys[0]!)).not.toBeNull();
    expect(await cache.get(keys[2]!)).not.toBeNull();
    const total = (await store.list()).reduce((sum, entry) => sum + entry.size, 0);
    expect(total).toBeLessThanOrEqual(Math.ceil(oneEntry * 2.6));
  });

  it('persists in IndexedDB across cache instances', async () => {
    const indexedDB = new IDBFactory();
    const first = createIndexedDbWorldCacheStore(indexedDB);
    opened.push(first);
    const a = await setup(first);
    const key = await worldCacheKey(a.sha256, scenario(), a.definition.generatorVersion ?? 0);
    const world = await worldOf(a.definition, scenario());
    await a.cache.put(key, world);
    first.close();

    const second = createIndexedDbWorldCacheStore(indexedDB);
    opened.push(second);
    const b = await setup(second);
    expect(JSON.stringify(await b.cache.get(key))).toBe(JSON.stringify(world));
  });

  it('reopens a scenario switch on the real runtime without regenerating', async () => {
    const { sha256, definition, cache } = await setup();
    const generate = vi.fn(definition.generate);
    const wrapped = withWorldCache({ ...definition, generate }, { blueprintSha256: sha256, cache });
    const harness = createHarness(wrapped);
    try {
      const runtime = await harness.boot();
      const tables = Object.keys((await worldOf(definition, scenario())).tables);
      const dump = async () => {
        const db = runtime.db as { table(name: string): { toArray(): Promise<unknown[]> } };
        return JSON.stringify(await Promise.all(tables.map((name) => db.table(name).toArray())));
      };
      const active = runtime.scenarios.active()?.scenario.id;
      expect(active).toBe('active');
      const before = await dump();
      expect(generate).toHaveBeenCalledTimes(1);

      await cache.idle();
      await runtime.scenarios.load('empty');
      await cache.idle();
      expect(generate).toHaveBeenCalledTimes(2);
      await runtime.scenarios.load('active');
      // Back to a scenario generated before: served from the cache, same rows.
      expect(generate).toHaveBeenCalledTimes(2);
      expect(cache.stats.hits).toBe(1);
      expect(await dump()).toBe(before);
    } finally {
      harness.closeAll();
    }
  });
});
