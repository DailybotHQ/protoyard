import { blueprintIdentity, parseBlueprint } from '@protoyard/blueprint';
import { createPrototypeRuntime } from '@protoyard/runtime';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bootPlayer } from '../src/boot.ts';
import {
  checkRequest,
  connectPlayer,
  createEmbedListener,
  embedderOrigins,
  exactOrigin,
  MAX_MESSAGE_BLUEPRINT_BYTES,
  PLAYER_PROTOCOL,
  PlayerEmbedError,
  type PlayerMessage,
  startEmbed,
} from '../src/embed/index.ts';
import demo from '../src/fixtures/demo.blueprint.json';

/**
 * `protoyard-player/1` (src/embed): origins, message shape, size caps, the
 * untrusted loader on every payload, exactly-once acknowledgements, and the
 * embedding client, with fake windows; then a real boot through startEmbed.
 */

const PLAYER = 'https://player.example';
const SITE = 'https://protoyard.app';
const P = PLAYER_PROTOCOL;

/** A window that records listeners and lets a test deliver messages. */
function fakeWindow() {
  const listeners = new Set<(event: MessageEvent) => void>();
  return {
    listeners,
    addEventListener: (_type: 'message', fn: (event: MessageEvent) => void) => listeners.add(fn),
    removeEventListener: (_type: 'message', fn: (event: MessageEvent) => void) =>
      listeners.delete(fn),
    deliver(event: { source: unknown; origin: string; data: unknown }) {
      for (const fn of [...listeners]) fn(event as unknown as MessageEvent);
    },
  };
}

/** A parent that records every message and its target origin. */
function fakeParent() {
  const sent: { message: PlayerMessage; targetOrigin: string }[] = [];
  return {
    sent,
    postMessage(message: PlayerMessage, targetOrigin: string) {
      sent.push({ message, targetOrigin });
    },
  };
}

const demoBlueprint = parseBlueprint(demo);
const request = (type: string, id: string, blueprint: unknown = demoBlueprint) => ({
  protocol: P,
  type,
  id,
  blueprint,
});

describe('origins', () => {
  it('accepts only exact http(s) origins', () => {
    expect(exactOrigin('https://protoyard.app')).toBe(SITE);
    expect(exactOrigin('https://protoyard.app/')).toBe(SITE);
    expect(exactOrigin('http://localhost:5173')).toBe('http://localhost:5173');
    for (const bad of [
      '*',
      'null',
      '',
      'https://protoyard.app/play',
      'https://protoyard.app?x=1',
      'https://protoyard.app#x',
      'https://user:pw@protoyard.app',
      'ftp://protoyard.app',
      'javascript:alert(1)',
      'HTTPS://Protoyard.app',
      'protoyard.app',
    ]) {
      expect(exactOrigin(bad), bad).toBeNull();
    }
  });

  it('allows its own origin plus ?embedder= origins that also match the build-time allowlist', () => {
    const search =
      '?embedder=https://protoyard.app&embedder=http://localhost:5173&embedder=http://127.0.0.1:4500' +
      '&embedder=https://evil.example&embedder=*&embedder=https://protoyard.app.evil.example' +
      '&embedder=http://protoyard.app&embedder=https://sub.protoyard.app';
    expect(embedderOrigins(search, PLAYER)).toEqual([
      PLAYER,
      SITE,
      'http://localhost:5173',
      'http://127.0.0.1:4500',
    ]);
    expect(embedderOrigins('', 'null')).toEqual([]);
    expect(embedderOrigins('?embedder=https://protoyard.app', 'null')).toEqual([SITE]);
  });
});

describe('checkRequest (shape and size)', () => {
  it('ignores anything that is not a well-formed request with a usable id', () => {
    for (const data of [
      null,
      'load',
      42,
      [request('load', 'a')],
      { ...request('load', 'a'), protocol: 'protoyard-player/2' },
      request('unload', 'a'),
      request('ready', 'a'),
      request('load', ''),
      request('load', 'x'.repeat(65)),
      request('load', 'has space'),
      { protocol: P, type: 'load', blueprint: demoBlueprint },
    ]) {
      expect(checkRequest(data).kind, JSON.stringify(data)?.slice(0, 60)).toBe('ignore');
    }
  });

  it('rejects unknown fields, a missing or non-JSON blueprint, and oversized payloads', () => {
    const codes = (data: unknown, max?: number) => {
      const check = checkRequest(data, max);
      return check.kind === 'reject' ? check.issues.map((i) => i.code) : check.kind;
    };
    expect(codes({ ...request('load', 'a'), script: 'x' })).toEqual(['invalid-message']);
    expect(codes({ protocol: P, type: 'load', id: 'a' })).toEqual(['invalid-message']);
    expect(codes(request('load', 'a', 7))).toEqual(['invalid-message']);
    const cyclic: Record<string, unknown> = { name: 'loop' };
    cyclic.self = cyclic;
    expect(codes(request('load', 'a', cyclic))).toEqual(['invalid-message']);
    expect(codes(request('load', 'a', 'x'.repeat(MAX_MESSAGE_BLUEPRINT_BYTES + 1)))).toEqual([
      'too-large',
    ]);
    expect(codes(request('load', 'a', { notes: 'é'.repeat(200) }), 300)).toEqual(['too-large']);
  });

  it('accepts a blueprint object or its JSON text', () => {
    expect(checkRequest(request('load', 'a')).kind).toBe('request');
    expect(checkRequest(request('replace', 'b:2', JSON.stringify(demoBlueprint))).kind).toBe(
      'request'
    );
  });
});

describe('createEmbedListener', () => {
  function setup(
    apply = vi.fn(async (_bp: unknown, _type: unknown) => ({ namespace: 'bp-test' }))
  ) {
    const win = fakeWindow();
    const parent = fakeParent();
    const listener = createEmbedListener({ window: win, parent, origins: [PLAYER, SITE], apply });
    return { win, parent, listener, apply };
  }

  afterEach(() => vi.useRealTimers());

  it('posts ready to each allowed origin, never to *', () => {
    const { parent, listener } = setup();
    expect(parent.sent).toEqual([
      {
        message: { protocol: P, type: 'ready', accepts: ['load', 'replace'], maxBytes: 262144 },
        targetOrigin: PLAYER,
      },
      {
        message: { protocol: P, type: 'ready', accepts: ['load', 'replace'], maxBytes: 262144 },
        targetOrigin: SITE,
      },
    ]);
    listener.stop();
  });

  it('ignores other windows and other origins without replying', async () => {
    const { win, parent, listener, apply } = setup();
    parent.sent.length = 0;
    win.deliver({ source: {}, origin: SITE, data: request('load', 'a') });
    win.deliver({ source: parent, origin: 'https://evil.example', data: request('load', 'b') });
    win.deliver({ source: parent, origin: SITE, data: { hello: 'world' } });
    await listener.idle();
    expect(apply).not.toHaveBeenCalled();
    expect(parent.sent).toEqual([]);
    listener.stop();
  });

  it('runs a valid blueprint through the untrusted loader and acknowledges loaded to the sender', async () => {
    const { win, parent, listener, apply } = setup();
    parent.sent.length = 0;
    win.deliver({ source: parent, origin: SITE, data: request('load', 'first') });
    await listener.idle();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]?.[1]).toBe('load');
    expect(parent.sent).toEqual([
      {
        message: {
          protocol: P,
          type: 'loaded',
          id: 'first',
          namespace: 'bp-test',
          name: demoBlueprint.name,
        },
        targetOrigin: SITE,
      },
    ]);
    listener.stop();
  });

  it('answers loader issues with error and never runs the blueprint', async () => {
    const { win, parent, listener, apply } = setup();
    const codesFor = async (origin: string, data: unknown) => {
      parent.sent.length = 0;
      win.deliver({ source: parent, origin, data });
      await listener.idle();
      return parent.sent.map(({ message, targetOrigin }) => ({
        type: message.type,
        codes: message.type === 'error' ? [...new Set(message.issues.map((i) => i.code))] : [],
        targetOrigin,
      }));
    };
    expect(await codesFor(SITE, request('load', 'bad', { formatVersion: 1 }))).toEqual([
      { type: 'error', codes: ['invalid-blueprint'], targetOrigin: SITE },
    ]);
    expect(
      await codesFor(
        PLAYER,
        request('replace', 'proto', '{"name":"x","__proto__":{"polluted":true}}')
      )
    ).toEqual([{ type: 'error', codes: ['unsafe-key'], targetOrigin: PLAYER }]);
    expect(await codesFor(SITE, request('load', 'json', '{nope'))).toEqual([
      { type: 'error', codes: ['invalid-json'], targetOrigin: SITE },
    ]);
    expect(apply).not.toHaveBeenCalled();
    expect({} as Record<string, unknown>).not.toHaveProperty('polluted');
    listener.stop();
  });

  it('reports a boot failure as error, never as loaded', async () => {
    const { win, parent, listener } = setup(
      vi.fn(async () => {
        throw new Error('storage unavailable');
      })
    );
    parent.sent.length = 0;
    win.deliver({ source: parent, origin: SITE, data: request('load', 'x') });
    await listener.idle();
    expect(parent.sent).toHaveLength(1);
    const [only] = parent.sent;
    expect(only?.message.type).toBe('error');
    expect(only?.message.type === 'error' && only.message.issues[0]?.code).toBe('boot-failed');
    expect(only?.message.type === 'error' && only.message.issues[0]?.message).toContain(
      'storage unavailable'
    );
    listener.stop();
  });

  it('runs one request at a time and answers a superseded replace', async () => {
    let release: () => void = () => {};
    const apply = vi.fn(
      (_bp: unknown, _type: unknown) =>
        new Promise<{ namespace: string }>((resolve) => {
          release = () => resolve({ namespace: `bp-${apply.mock.calls.length}` });
        })
    );
    const { win, parent, listener } = setup(apply);
    parent.sent.length = 0;
    win.deliver({ source: parent, origin: SITE, data: request('load', 'r1') });
    win.deliver({ source: parent, origin: SITE, data: request('replace', 'r2') });
    win.deliver({ source: parent, origin: SITE, data: request('replace', 'r3') });
    // Validation is async (any kind); still exactly one request runs at a time.
    await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    expect(parent.sent.map((s) => [s.message.type, 'id' in s.message ? s.message.id : ''])).toEqual(
      [['error', 'r2']]
    );
    release();
    await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(2));
    release();
    await listener.idle();
    expect(apply.mock.calls.map((call) => call[1])).toEqual(['load', 'replace']);
    expect(parent.sent.map((s) => [s.message.type, 'id' in s.message ? s.message.id : ''])).toEqual(
      [
        ['error', 'r2'],
        ['loaded', 'r1'],
        ['loaded', 'r3'],
      ]
    );
    listener.stop();
  });

  it('stops listening and replying after stop()', async () => {
    const { win, parent, listener, apply } = setup();
    listener.stop();
    parent.sent.length = 0;
    win.deliver({ source: parent, origin: SITE, data: request('load', 'late') });
    await listener.idle();
    expect(win.listeners.size).toBe(0);
    expect(apply).not.toHaveBeenCalled();
    expect(parent.sent).toEqual([]);
  });
});

describe('connectPlayer (embedding client)', () => {
  it('refuses a wildcard or non-origin playerOrigin', () => {
    const frame = { contentWindow: { postMessage() {} } };
    for (const playerOrigin of ['*', 'https://protoyard.app/play', 'protoyard.app']) {
      expect(
        () => connectPlayer({ frame, playerOrigin, window: fakeWindow() }),
        playerOrigin
      ).toThrow(PlayerEmbedError);
    }
  });

  /** A host page and a framed player, wired the way browsers deliver messages. */
  function wired(apply = vi.fn(async () => ({ namespace: 'bp-wired' }))) {
    const host = fakeWindow();
    const playerWindow = fakeWindow();
    const posted: string[] = [];
    // What the player sees as window.parent: posting delivers to the host.
    const parent = {
      postMessage(message: PlayerMessage, targetOrigin: string) {
        posted.push(targetOrigin);
        if (targetOrigin === SITE)
          host.deliver({ source: frameWindow, origin: PLAYER, data: message });
      },
    };
    // What the host sees as iframe.contentWindow: posting delivers to the player.
    const frameWindow = {
      postMessage(message: unknown, targetOrigin: string) {
        posted.push(targetOrigin);
        if (targetOrigin === PLAYER)
          playerWindow.deliver({ source: parent, origin: SITE, data: message });
      },
    };
    const connection = connectPlayer({
      frame: { contentWindow: frameWindow },
      playerOrigin: PLAYER,
      window: host,
      timeoutMs: 5_000,
    });
    const listener = createEmbedListener({ window: playerWindow, parent, origins: [SITE], apply });
    return { connection, listener, host, frameWindow, posted, apply };
  }

  it('resolves ready, load and replace end to end, and rejects with the player issues', async () => {
    const { connection, listener, posted } = wired();
    await expect(connection.ready).resolves.toMatchObject({ type: 'ready', maxBytes: 262144 });
    await expect(connection.load(demoBlueprint)).resolves.toEqual({
      namespace: 'bp-wired',
      name: demoBlueprint.name,
    });
    await expect(connection.replace(JSON.stringify(demoBlueprint))).resolves.toMatchObject({
      namespace: 'bp-wired',
    });
    const refused = connection.load({ formatVersion: 1 });
    await expect(refused).rejects.toBeInstanceOf(PlayerEmbedError);
    const error = (await refused.catch((e: unknown) => e)) as PlayerEmbedError;
    expect(error.issues.length).toBeGreaterThan(0);
    expect(error.issues.every((i) => i.code === 'invalid-blueprint' && Array.isArray(i.path))).toBe(
      true
    );
    expect(posted.every((origin) => origin !== '*')).toBe(true);
    connection.close();
    listener.stop();
  });

  it('ignores messages from other windows or origins and times out', async () => {
    vi.useFakeTimers();
    const host = fakeWindow();
    const frameWindow = { postMessage() {} };
    const connection = connectPlayer({
      frame: { contentWindow: frameWindow },
      playerOrigin: PLAYER,
      window: host,
      timeoutMs: 1_000,
    });
    const ready = { protocol: P, type: 'ready', accepts: ['load'], maxBytes: 1 };
    host.deliver({ source: {}, origin: PLAYER, data: ready });
    host.deliver({ source: frameWindow, origin: SITE, data: ready });
    const pending = connection.load(demoBlueprint);
    const readyResult = expect(connection.ready).rejects.toThrow(/ready in time/);
    const loadResult = expect(pending).rejects.toThrow(/did not answer load/);
    await vi.advanceTimersByTimeAsync(1_001);
    await readyResult;
    await loadResult;
    connection.close();
    await expect(connection.load(demoBlueprint)).rejects.toThrow(/closed/);
    vi.useRealTimers();
  });
});

describe('startEmbed', () => {
  const booted: { destroy(): Promise<void> }[] = [];
  afterEach(async () => {
    for (const b of booted.splice(0)) await b.destroy();
    document.body.replaceChildren();
  });

  it('does nothing in a top-level page', () => {
    const win = { ...fakeWindow(), location: { search: `?embedder=${SITE}`, origin: PLAYER } };
    (win as unknown as { parent: unknown }).parent = win;
    expect(startEmbed({ window: win as unknown as Window, boot: vi.fn() })).toBeNull();
  });

  it('boots a real prototype on load and swaps it on replace', async () => {
    const win = fakeWindow();
    const parent = fakeParent();
    const frame = Object.assign(win, {
      parent,
      location: { search: `?embedder=${SITE}`, origin: PLAYER },
    }) as unknown as Window;
    const indexedDB = new IDBFactory();
    const boot = vi.fn(async (blueprint: Parameters<typeof bootPlayer>[0]['blueprint']) => {
      const target = document.body.appendChild(document.createElement('div'));
      const player = await bootPlayer({
        blueprint,
        target,
        createRuntime: (definition, options) =>
          createPrototypeRuntime(definition, {
            ...options,
            indexedDB,
            IDBKeyRange,
            sleep: async () => {},
          }),
      });
      booted.push(player);
      return player;
    });
    const listener = startEmbed({ window: frame, boot });
    expect(listener).not.toBeNull();
    expect(parent.sent.map((s) => [s.message.type, s.targetOrigin])).toEqual([
      ['ready', PLAYER],
      ['ready', SITE],
    ]);

    win.deliver({ source: parent, origin: SITE, data: request('load', 'one') });
    await listener?.idle();
    const first = parent.sent.at(-1)?.message;
    expect(first).toMatchObject({ type: 'loaded', id: 'one' });
    expect(first?.type === 'loaded' && first.namespace).toBe(
      (await blueprintIdentity(demoBlueprint)).namespace
    );

    const edited = { ...demoBlueprint, name: `${demoBlueprint.name} (edited)` };
    win.deliver({ source: parent, origin: SITE, data: request('replace', 'two', edited) });
    await listener?.idle();
    const second = parent.sent.at(-1)?.message;
    expect(second).toMatchObject({ type: 'loaded', id: 'two', name: edited.name });
    expect(second?.type === 'loaded' && second.namespace).not.toBe(
      first?.type === 'loaded' && first.namespace
    );
    expect(boot).toHaveBeenCalledTimes(2);
    listener?.stop();
  }, 120_000);
});
