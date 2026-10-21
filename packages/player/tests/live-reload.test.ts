import {
  type Blueprint,
  blueprintIdentity,
  latestSchemaVersion,
  parseBlueprint,
} from '@protoyard/blueprint';
import { createPrototypeRuntime } from '@protoyard/runtime';
import { configure } from '@testing-library/svelte';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type BootedPlayer, bootPlayer } from '../src/boot.ts';
import demo from '../src/fixtures/demo.blueprint.json';
import {
  classifyBlueprintChange,
  detectQuickServe,
  LIVE_NAMESPACES_KEY,
  type LiveChange,
  liveWorldFor,
  rememberLiveWorld,
  startLiveReload,
} from '../src/live-reload.ts';
import { PLAYER_SHARE_SESSION_KEY } from '../src/sources/start.ts';

configure({ asyncUtilTimeout: 10_000 });

/**
 * Live reload for a player served by `protoyard quick serve`: detection by a
 * same-origin probe on 127.0.0.1, the safe/destructive decision, the tab's
 * namespace memory, the event handling, and an in-place re-derive that keeps
 * the rows of the world it reopens.
 */

const base = parseBlueprint(demo);

/** `next` as `quick iterate` writes it: `previous` (without history) appended to history. */
function iterated(
  previous: Blueprint,
  change: (draft: Record<string, unknown>) => void
): Blueprint {
  const { history, ...before } = previous;
  const draft = structuredClone(before) as Record<string, unknown>;
  change(draft);
  return parseBlueprint({
    ...draft,
    history: [
      ...history,
      { schemaVersion: latestSchemaVersion(previous), blueprint: structuredClone(before) },
    ],
  });
}

const addCustomerEmail = (draft: Record<string, unknown>) => {
  const entities = draft.entities as { name: string; fields: unknown[] }[];
  entities
    .find((entity) => entity.name === 'customer')
    ?.fields.push({ name: 'email', kind: 'email', label: 'Email' });
};

const withoutVehicles = (draft: Record<string, unknown>) => {
  draft.entities = (draft.entities as { name: string }[]).filter((e) => e.name !== 'vehicle');
  draft.roles = (draft.roles as { permissions: Record<string, unknown> }[]).map((role) => ({
    ...role,
    permissions: Object.fromEntries(
      Object.entries(role.permissions).filter(([key]) => key !== 'vehicle')
    ),
  }));
  draft.screens = ((draft.screens as { entity?: string }[] | undefined) ?? []).filter(
    (screen) => screen.entity !== 'vehicle'
  );
};

/** A sessionStorage stand-in. */
function memorySession() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    map,
  };
}

describe('classifyBlueprintChange', () => {
  it('re-derives in place for copy changes and for an added field with its history', () => {
    expect(
      classifyBlueprintChange(
        base,
        iterated(base, (d) => {
          d.name = 'Renamed';
        })
      )
    ).toBe('safe');
    expect(classifyBlueprintChange(base, iterated(base, addCustomerEmail))).toBe('safe');
  });

  it('starts a fresh world for a drop, or a storage change without its history', () => {
    expect(classifyBlueprintChange(base, iterated(base, withoutVehicles))).toBe('destructive');
    const noHistory = structuredClone(demo) as Record<string, unknown>;
    addCustomerEmail(noHistory);
    expect(classifyBlueprintChange(base, parseBlueprint(noHistory))).toBe('destructive');
  });
});

describe('detectQuickServe', () => {
  const info = { protocol: 1, events: '/__protoyard/events', comments: '/api/comments' };
  const reply = (body: unknown, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status }));
  const local = { hostname: '127.0.0.1', origin: 'http://127.0.0.1:4180' };

  it('probes only on 127.0.0.1, at the same origin, without credentials', async () => {
    const fetch = reply(info);
    expect(
      await detectQuickServe({ hostname: 'protoyard.app', origin: 'https://protoyard.app' }, fetch)
    ).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(await detectQuickServe(local, fetch)).toEqual(info);
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4180/__protoyard/serve.json',
      expect.objectContaining({ cache: 'no-store', credentials: 'omit' })
    );
  });

  it('is null for a missing server, a failed fetch or an unexpected answer', async () => {
    expect(await detectQuickServe(local, reply({}, 404))).toBeNull();
    expect(
      await detectQuickServe(local, async () => {
        throw new TypeError('offline');
      })
    ).toBeNull();
    for (const bad of [
      { ...info, protocol: 2 },
      { ...info, events: 'https://elsewhere.example/events' },
      { ...info, comments: '//elsewhere.example/api' },
      'not an object',
    ]) {
      expect(await detectQuickServe(local, reply(bad)), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('the tab’s live worlds', () => {
  const sha = (n: number) => n.toString(16).padStart(64, '0');

  it('remembers re-derived blueprints, newest first, bounded and validated', () => {
    const session = memorySession();
    rememberLiveWorld(sha(1), { namespace: 'bp-aaaa', generatorVersion: 42 }, session);
    expect(liveWorldFor(sha(1), session)).toEqual({ namespace: 'bp-aaaa', generatorVersion: 42 });
    expect(liveWorldFor(sha(2), session)).toBeNull();
    rememberLiveWorld('not-a-sha', { namespace: 'bp-aaaa' }, session);
    rememberLiveWorld(sha(3), { namespace: 'Not A Namespace' }, session);
    expect(liveWorldFor(sha(3), session)).toBeNull();
    for (let n = 10; n < 60; n++) rememberLiveWorld(sha(n), { namespace: 'bp-bbbb' }, session);
    const stored = JSON.parse(session.getItem(LIVE_NAMESPACES_KEY) ?? '[]') as unknown[];
    expect(stored).toHaveLength(32);
    expect(liveWorldFor(sha(59), session)).toEqual({ namespace: 'bp-bbbb' });
    session.setItem(LIVE_NAMESPACES_KEY, '{broken');
    expect(liveWorldFor(sha(59), session)).toBeNull();
  });
});

describe('startLiveReload', () => {
  /** An EventSource stand-in the test drives. */
  function fakeSource() {
    const sources: { url: string; emit: (type: string, data: unknown) => void; closed: boolean }[] =
      [];
    class Source {
      listeners = new Map<string, (event: MessageEvent<string>) => void>();
      closed = false;
      constructor(public url: string) {
        sources.push({
          url,
          emit: (type, data) =>
            this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent<string>),
          get closed() {
            return false;
          },
        });
      }
      addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
        this.listeners.set(type, listener);
      }
      close() {
        this.closed = true;
      }
    }
    return { Source, sources };
  }

  async function setup(next: Blueprint) {
    const current = { blueprint: base, ...(await blueprintIdentity(base)) };
    const shown = { blueprint: base, sha256: current.sha256, namespace: current.namespace };
    const nextIdentity = await blueprintIdentity(next);
    const text = JSON.stringify(next);
    const fetch = vi.fn(async () => new Response(text));
    const applied: LiveChange[] = [];
    const errors: unknown[] = [];
    const session = memorySession();
    const { Source, sources } = fakeSource();
    let done!: () => void;
    const settled = new Promise<void>((resolve) => {
      done = resolve;
    });
    const live = startLiveReload({
      info: { protocol: 1, events: '/__protoyard/events', comments: '/api/comments' },
      origin: 'http://127.0.0.1:4180',
      current: () => shown,
      apply: async (change) => {
        applied.push(change);
        done();
      },
      fetch,
      EventSource: Source as never,
      session,
      shareSessionKey: PLAYER_SHARE_SESSION_KEY,
      onError: (error) => {
        errors.push(error);
        done();
      },
    });
    const emit = (data: Record<string, unknown>) =>
      sources[0]?.emit('blueprint', {
        file: 'base',
        path: '/gym/blueprint.json',
        sha256: nextIdentity.sha256,
        previous: shown.sha256,
        ...data,
      });
    return { shown, nextIdentity, fetch, applied, errors, session, sources, settled, emit, live };
  }

  it('subscribes on the same origin and re-derives a safe change in the current namespace', async () => {
    const next = iterated(base, addCustomerEmail);
    const t = await setup(next);
    expect(t.sources[0]?.url).toBe('http://127.0.0.1:4180/__protoyard/events');
    t.emit({});
    await t.settled;
    expect(t.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4180/gym/blueprint.json',
      expect.objectContaining({ cache: 'no-store', credentials: 'omit' })
    );
    expect(t.applied).toEqual([
      {
        kind: 'safe',
        blueprint: next,
        sha256: t.nextIdentity.sha256,
        world: { namespace: t.shown.namespace },
      },
    ]);
    // A reload keeps the same world and shows the new blueprint.
    expect(liveWorldFor(t.nextIdentity.sha256, t.session)).toEqual({
      namespace: t.shown.namespace,
    });
    expect(t.session.getItem(PLAYER_SHARE_SESSION_KEY)).toEqual(expect.any(String));
  });

  it('boots a destructive change as a fresh world', async () => {
    const t = await setup(iterated(base, withoutVehicles));
    t.emit({});
    await t.settled;
    expect(t.applied).toMatchObject([{ kind: 'destructive', world: null }]);
    expect(liveWorldFor(t.nextIdentity.sha256, t.session)).toBeNull();
  });

  it('ignores another file’s change, a foreign path and a stale hash', async () => {
    const t = await setup(iterated(base, addCustomerEmail));
    t.emit({ previous: 'f'.repeat(64) });
    t.emit({ path: 'https://elsewhere.example/blueprint.json' });
    t.emit({ path: '//elsewhere.example/blueprint.json' });
    t.emit({ sha256: 'e'.repeat(64) }); // The file was rewritten again: its own event follows.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(t.applied).toEqual([]);
    // Only the stale-hash event fetched (its path was fine); nothing applied.
    expect(t.fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the current world when the changed file is not a valid blueprint', async () => {
    const t = await setup(base);
    t.fetch.mockImplementationOnce(async () => new Response('{"formatVersion": 1}'));
    t.emit({});
    await t.settled;
    expect(t.applied).toEqual([]);
    expect(String(t.errors[0])).toMatch(/not valid/);
  });
});

describe('re-deriving in place', () => {
  let booted: BootedPlayer | undefined;
  afterEach(async () => {
    await booted?.destroy();
    booted = undefined;
    document.body.replaceChildren();
    performance.clearMarks();
  });

  it('keeps every row when a safe change reopens the same namespace', async () => {
    const indexedDB = new IDBFactory();
    const bootOn = async (
      blueprint: Blueprint,
      world?: { namespace: string; generatorVersion: number | undefined }
    ) => {
      const target = document.body.appendChild(document.createElement('div'));
      booted = await bootPlayer({
        blueprint,
        target,
        search: '',
        ...(world ? { namespace: world.namespace } : {}),
        ...(world?.generatorVersion !== undefined
          ? { generatorVersion: world.generatorVersion }
          : {}),
        createRuntime: (definition, options) =>
          createPrototypeRuntime(definition, {
            ...options,
            indexedDB,
            IDBKeyRange,
            sleep: async () => {},
          }),
      });
      return booted;
    };
    type Db = {
      table(name: string): {
        count(): Promise<number>;
        add(row: object): Promise<unknown>;
        get(id: string): Promise<Record<string, unknown> | undefined>;
      };
    };

    const first = await bootOn(base);
    const db = first.runtime!.db as Db;
    await db.table('customers').add({
      id: 'cus_live_reload',
      name: 'Juniper Example',
      phone: '555-0100',
      serviceAddress: '1 Example Way',
      createdAt: '2026-10-20T00:00:00.000Z',
      updatedAt: '2026-10-20T00:00:00.000Z',
    });
    const before = await db.table('customers').count();
    const world = { namespace: first.namespace, generatorVersion: first.generatorVersion };
    expect(world.generatorVersion).toEqual(expect.any(Number));
    await first.destroy();
    booted = undefined;

    const next = iterated(base, addCustomerEmail);
    expect(classifyBlueprintChange(base, next)).toBe('safe');
    const second = await bootOn(next, world);
    expect(second.namespace).toBe(world.namespace);
    // The reopened world keeps the version that built it, so it is not rebuilt.
    expect(second.generatorVersion).toBe(world.generatorVersion);
    expect(second.runtime!.scenarios.staleWorld()).toBeNull();
    expect(second.runtime!.manifest.storage.schemaVersion).toBe(2);
    const after = second.runtime!.db as Db;
    expect(await after.table('customers').count()).toBe(before);
    expect(await after.table('customers').get('cus_live_reload')).toMatchObject({
      name: 'Juniper Example',
    });
  });

  it('mounts the review UI on the http adapter when quick serve hosts comments', async () => {
    const target = document.body.appendChild(document.createElement('div'));
    const indexedDB = new IDBFactory();
    booted = await bootPlayer({
      blueprint: base,
      target,
      search: '',
      review: { endpoint: '/api/comments' },
      createRuntime: (definition, options) =>
        createPrototypeRuntime(definition, {
          ...options,
          indexedDB,
          IDBKeyRange,
          sleep: async () => {},
        }),
    });
    expect(booted.runtime!.manifest.build.review).toEqual({
      enabled: true,
      adapter: 'http',
      endpoint: '/api/comments',
    });
  });
});
