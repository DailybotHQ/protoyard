import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type AnyBlueprint,
  type Blueprint,
  loadUntrustedDocument,
  parseBlueprint,
} from '@protoyard/blueprint';
import { createKindServices } from '@protoyard/blueprint/kinds';
import { createPrototypeRuntime } from '@protoyard/runtime';
import { configure } from '@testing-library/svelte';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BootedPlayer } from '../src/boot.ts';
import { createEmbedListener } from '../src/embed/listener.ts';
import { PLAYER_PROTOCOL } from '../src/embed/protocol.ts';
import demo from '../src/fixtures/demo.blueprint.json';
import { createDeferredStateHost } from '../src/kinds/deferred-host.ts';
import { createMountEmbed } from '../src/kinds/mount-embed.ts';
import { classifyBlueprintChange, type StartLiveReloadOptions } from '../src/live-reload.ts';
import { runPlayer } from '../src/run.ts';
import { bootByKind } from '../src/sources/boot-any.ts';
import { startPlayer } from '../src/sources/start.ts';

configure({ asyncUtilTimeout: 10_000 });

/**
 * The player routes by blueprint kind (ADR-036): apps through `boot.ts`,
 * decks, pages and docs through `boot-kind.ts`, so a kind never imports the
 * app boot (CRUD shell, Faker, world worker). The two boot modules are mocked
 * to record what loads; the real `bootKind` runs through `vi.importActual`.
 */
const loads = vi.hoisted(() => ({ app: 0, kind: 0 }));
const fakeBooted = vi.hoisted(
  () => (namespace: string) =>
    ({
      namespace,
      generatorVersion: undefined,
      runtime: null,
      error: null,
      destroy: vi.fn(async () => {}),
    }) as unknown as BootedPlayer
);
vi.mock('../src/boot.ts', () => {
  loads.app += 1;
  return {
    QUICK_REVIEW_ENDPOINT: '/api/comments',
    bootPlayer: vi.fn(async () => fakeBooted('bp-app')),
  };
});
vi.mock('../src/boot-kind.ts', () => {
  loads.kind += 1;
  return { bootKind: vi.fn(async () => fakeBooted('bp-kind')) };
});

const FIXTURES = join(import.meta.dirname, '../../blueprint/tests/fixtures/kinds');
async function kind(name: string): Promise<AnyBlueprint> {
  const loaded = await loadUntrustedDocument(readFileSync(join(FIXTURES, name), 'utf8'));
  if (!loaded.success) throw new Error(JSON.stringify(loaded.issues));
  return loaded.blueprint;
}
const app: Blueprint = parseBlueprint(demo);

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('bootByKind', () => {
  it('boots decks, pages and docs through boot-kind and never imports boot.ts', async () => {
    const target = document.createElement('div');
    for (const name of ['intro.deck.json', 'landing.page.json', 'quarterly-report.doc.json']) {
      const booted = await bootByKind(await kind(name), target, { review: true });
      expect(booted.namespace).toBe('bp-kind');
    }
    expect(loads.app).toBe(0);
    const { bootKind } = await import('../src/boot-kind.ts');
    expect(bootKind).toHaveBeenCalledTimes(3);
    expect(vi.mocked(bootKind).mock.calls[0]?.[0]).toMatchObject({ target, review: true });
  });

  it('still boots an app through boot.ts', async () => {
    const booted = await bootByKind(app, document.createElement('div'));
    expect(booted.namespace).toBe('bp-app');
    expect(loads.app).toBe(1);
    const { bootPlayer } = await import('../src/boot.ts');
    expect(bootPlayer).toHaveBeenCalledWith(expect.objectContaining({ blueprint: app }));
  });
});

describe('startPlayer with a content kind', () => {
  it('resolves an embedded deck through the document loader and boots it by kind', async () => {
    const before = loads.app;
    const target = document.body.appendChild(document.createElement('div'));
    const started = await startPlayer({
      target,
      location: { hash: '', search: '', href: 'http://127.0.0.1:4000/index.html' },
      events: { addEventListener: () => {}, removeEventListener: () => {} },
      embedded: readFileSync(join(FIXTURES, 'intro.deck.json'), 'utf8'),
      session: null,
      // index.html's boot strategy (main.ts): route every kind.
      boot: bootByKind,
      // Vitest's mocker can hand the real module to the first of two concurrent
      // dynamic imports (prefetch + boot); without the prefetch the boot is the
      // one import, so the routed module is what this test observes.
      prefetch: false,
    });
    expect(started.state()).toBe('booted');
    const { bootKind } = await import('../src/boot-kind.ts');
    expect(vi.mocked(bootKind).mock.calls.at(-1)?.[0].blueprint).toMatchObject({ kind: 'deck' });
    // The kind chunk booted the deck: boot.ts never loaded here.
    expect(loads.app).toBe(before);
    await started.stop();
  });
});

describe('runPlayer swaps across kinds', () => {
  it('tears an app down exactly once when live reload swaps it for a deck', async () => {
    const deck = await kind('intro.deck.json');
    const target = document.createElement('div');
    const state: { options: StartLiveReloadOptions | null } = { options: null };
    const live = {
      detectQuickServe: vi.fn(async () => null),
      blueprintIdentity: vi.fn(async (bp: { name: string }) => ({ sha256: `sha-${bp.name}` })),
      liveWorldFor: vi.fn(() => null),
      startLiveReload: vi.fn((options: StartLiveReloadOptions) => {
        state.options = options;
        return { close: () => {} };
      }),
    };
    const stop = vi.fn(async () => {});
    const start = vi.fn(
      async (options: { boot?: (bp: AnyBlueprint, target: HTMLElement) => Promise<unknown> }) => {
        await options.boot?.(app, target);
        return {
          state: () => 'booted' as const,
          stop,
          showBootError: vi.fn(async () => {}),
          clearScreen: vi.fn(async () => {}),
        };
      }
    );
    await runPlayer({
      window: { parent: null, location: { origin: 'http://127.0.0.1:4180' } } as unknown as Window,
      target,
      boot: bootByKind,
      start: start as never,
      detectQuickServe: async () => ({ protocol: 1 as const, events: '/__protoyard/events' }),
      loadLiveReload: async () => live as unknown as typeof import('../src/live-reload.ts'),
    });
    const { bootPlayer } = await import('../src/boot.ts');
    const { bootKind } = await import('../src/boot-kind.ts');
    const appMount = await vi.mocked(bootPlayer).mock.results[0]?.value;
    expect(appMount).toBeDefined();

    await state.options!.apply({
      kind: classifyBlueprintChange(app, deck),
      blueprint: deck,
      sha256: 'sha-deck',
      world: null,
    });
    expect(appMount.destroy).toHaveBeenCalledTimes(1);
    expect(bootKind).toHaveBeenCalledTimes(1);
    expect(vi.mocked(bootKind).mock.calls[0]?.[0]).toMatchObject({ review: true });
  });

  it('keeps the world between content kinds and starts fresh to or from an app', async () => {
    const deck = await kind('intro.deck.json');
    const page = await kind('landing.page.json');
    expect(classifyBlueprintChange(app, deck)).toBe('destructive');
    expect(classifyBlueprintChange(deck, app)).toBe('destructive');
    expect(classifyBlueprintChange(deck, page)).toBe('safe');
    expect(classifyBlueprintChange(app, app)).toBe('safe');
  });
});

describe('embed listener', () => {
  it('accepts a deck over protoyard-player/1 and answers loaded', async () => {
    const deckJson = JSON.parse(readFileSync(join(FIXTURES, 'intro.deck.json'), 'utf8')) as unknown;
    const sent: unknown[] = [];
    const listeners = new Set<(event: MessageEvent) => void>();
    const parent = { postMessage: (message: unknown) => sent.push(message) };
    const apply = vi.fn(async (_bp: AnyBlueprint) => ({ namespace: 'bp-deck' }));
    const listener = createEmbedListener({
      window: {
        addEventListener: (_t: string, l: (event: MessageEvent) => void) => listeners.add(l),
        removeEventListener: (_t: string, l: (event: MessageEvent) => void) => listeners.delete(l),
      } as never,
      parent: parent as never,
      origins: ['http://127.0.0.1:4000'],
      apply,
    });
    for (const l of listeners) {
      l({
        source: parent,
        origin: 'http://127.0.0.1:4000',
        data: { protocol: PLAYER_PROTOCOL, type: 'load', id: 'd1', blueprint: deckJson },
      } as unknown as MessageEvent);
    }
    await listener.idle();
    expect(apply.mock.calls[0]?.[0]).toMatchObject({ kind: 'deck' });
    expect(sent.filter((m) => (m as { type?: string }).type !== 'ready')).toEqual([
      expect.objectContaining({ type: 'loaded', id: 'd1', namespace: 'bp-deck' }),
    ]);
    listener.stop();
  });
});

describe('mountEmbed (embed-app blocks)', () => {
  const location = { origin: 'http://127.0.0.1:4000', href: 'http://127.0.0.1:4000/deck.html' };

  it('frames this player and loads an app blueprint into it, removing the frame on cleanup', async () => {
    vi.stubGlobal('location', location);
    const load = vi.fn(async () => ({ namespace: 'bp-embedded', name: 'x' }));
    const close = vi.fn();
    const connect = vi.fn(() => ({
      ready: Promise.resolve({}) as never,
      load,
      replace: load,
      close,
    }));
    const target = document.body.appendChild(document.createElement('div'));
    const cleanup = await createMountEmbed({ connect: connect as never })(target, demo);
    const frame = target.querySelector('iframe') as HTMLIFrameElement;
    expect(frame.src).toBe('http://127.0.0.1:4000/index.html?devtools=0');
    expect(frame.title).toBe(app.name);
    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({ frame, playerOrigin: location.origin })
    );
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ name: app.name }));
    (cleanup as () => void)();
    expect(close).toHaveBeenCalledTimes(1);
    expect(target.querySelector('iframe')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('refuses a deck, page or doc (one level, apps only) before framing anything', async () => {
    vi.stubGlobal('location', location);
    const connect = vi.fn();
    const target = document.createElement('div');
    const deckJson = JSON.parse(readFileSync(join(FIXTURES, 'intro.deck.json'), 'utf8')) as unknown;
    await expect(
      createMountEmbed({ connect: connect as never })(target, deckJson as never)
    ).rejects.toThrow();
    expect(connect).not.toHaveBeenCalled();
    expect(target.querySelector('iframe')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('refuses to frame a player on another origin or outside http(s)', async () => {
    vi.stubGlobal('location', location);
    const mount = createMountEmbed({
      connect: vi.fn() as never,
      playerUrl: () => new URL('https://elsewhere.example/index.html'),
    });
    await expect(mount(document.createElement('div'), demo)).rejects.toThrow(/one origin/);
    vi.unstubAllGlobals();
  });
});

describe('deferred block-state host', () => {
  it('waits for the persistent host, then attaches early subscribers with the stored state', async () => {
    let resolve!: (value: { blockStates: never }) => void;
    const states = new Map<string, unknown>([['doc/poll', { votes: { presenter: ['a'] } }]]);
    const subscribers = new Map<string, (state: unknown) => void>();
    const real = {
      read: (key: string) => states.get(key),
      dispatch: vi.fn(async () => ({ votes: {} })),
      subscribe: vi.fn((key: string, listener: (state: unknown) => void) => {
        subscribers.set(key, listener);
        return () => subscribers.delete(key);
      }),
    };
    const host = createDeferredStateHost(
      new Promise((r) => {
        resolve = r as never;
      })
    );
    const heard: unknown[] = [];
    const off = host.subscribe('doc/poll', (state) => heard.push(state));
    expect(host.read('doc/poll')).toBeUndefined();
    const dispatched = host.dispatch('doc/poll', {} as never, { type: 'vote' });
    resolve({ blockStates: real as never });
    await host.ready;
    expect(heard).toEqual([{ votes: { presenter: ['a'] } }]);
    expect(host.read('doc/poll')).toEqual({ votes: { presenter: ['a'] } });
    await dispatched;
    expect(real.dispatch).toHaveBeenCalledTimes(1);
    off();
    expect(subscribers.has('doc/poll')).toBe(false);
  });
});

describe('bootKind (real) on fake IndexedDB', () => {
  let booted: BootedPlayer | undefined;
  afterEach(async () => {
    await booted?.destroy();
    booted = undefined;
  });

  async function bootReal(blueprint: AnyBlueprint) {
    const { bootKind } =
      await vi.importActual<typeof import('../src/boot-kind.ts')>('../src/boot-kind.ts');
    const target = document.body.appendChild(document.createElement('div'));
    const indexedDB = new IDBFactory();
    booted = await bootKind({
      blueprint,
      target,
      search: '',
      indexFactory: indexedDB,
      createRuntime: (definition, options) =>
        createPrototypeRuntime(definition, {
          ...options,
          indexedDB,
          IDBKeyRange,
          sleep: async () => {},
        }),
    });
    return { target, booted };
  }

  it('mounts the deck with DeckApp in its own bp- namespace, as the presenter, with the demo badge', async () => {
    const { target, booted: player } = await bootReal(await kind('intro.deck.json'));
    expect(player.error).toBeNull();
    expect(player.namespace).toMatch(/^bp-[a-z2-7]{26}$/);
    expect(player.runtime?.manifest.storage.namespace).toBe(player.namespace);
    expect(player.runtime?.session.principal()?.persona.id).toBe('presenter');
    await vi.waitFor(() => expect(target.querySelector('[data-py-deck-app]')).not.toBeNull());
    expect(document.querySelector('[data-py-demo-badge]')).not.toBeNull();
  });

  it('mounts pages and docs with PageApp and DocApp', async () => {
    const page = await bootReal(await kind('landing.page.json'));
    await vi.waitFor(() => expect(page.target.querySelector('[data-py-page-app]')).not.toBeNull());
    await booted?.destroy();
    booted = undefined;
    const doc = await bootReal(await kind('quarterly-report.doc.json'));
    await vi.waitFor(() => expect(doc.target.querySelector('[data-py-doc-app]')).not.toBeNull());
  });

  it('persists and lists a page form response through the real kind runtime', async () => {
    const page = await kind('landing.page.json');
    const { booted: player } = await bootReal(page);
    const runtime = player.runtime;
    if (!runtime) throw new Error('no runtime');
    const services = await createKindServices(runtime, page as never);
    const saved = await services.responses.submit('waitlist', {
      email: 'rowan@example.com',
      teamSize: 'small',
    });
    expect(saved).toMatchObject({ formId: 'waitlist', personaId: 'presenter' });
    const listed = await services.responses.list('waitlist');
    expect(listed.map((row) => row.id)).toEqual([saved.id]);
    services.destroy();
  });
});
