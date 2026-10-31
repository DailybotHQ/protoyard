// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AnyBlueprint,
  blueprintIdentity,
  type DeckBlueprint,
  paintStreamedBlueprint,
  parseAnyBlueprint,
} from '@protoyard/blueprint';
import { describe, expect, it, vi } from 'vitest';
import {
  committedIdentity,
  LIVE_NAMESPACES_KEY,
  type LiveBlueprint,
  type LiveChange,
  startLiveReload,
} from '../src/live-reload.ts';
import { PLAYER_SHARE_SESSION_KEY } from '../src/sources/start.ts';

/**
 * Progressive painting under `quick serve`: a `draft` event names the part of
 * a deck, page or doc that has arrived and the path the server serves it at;
 * the player reads it as untrusted input, checks its identity, paints it in
 * the same world, never touches the share link or the remembered worlds, and
 * the complete blueprint's event (whose `previous` is the draft's base)
 * replaces it.
 */

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const deckText = `${JSON.stringify(
  JSON.parse(readFileSync(join(ROOT, 'blueprints/decks/everything.json'), 'utf8')),
  null,
  2
)}\n`;

function memorySession() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    store,
  };
}

function fakeSource() {
  const listeners = new Map<string, (event: MessageEvent<string>) => void>();
  class Source {
    url: string;
    constructor(url: string) {
      this.url = url;
    }
    addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
      listeners.set(type, listener);
    }
    close() {}
  }
  const emit = (type: string, data: unknown) =>
    listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  return { Source, emit };
}

async function setup(start: AnyBlueprint) {
  const identity = await blueprintIdentity(start);
  let shown: LiveBlueprint = { blueprint: start, sha256: identity.sha256, namespace: 'bp-world' };
  const applied: LiveChange[] = [];
  const errors: unknown[] = [];
  const session = memorySession();
  /** What the fake server serves, by path. */
  const files = new Map<string, string>();
  const fetch = vi.fn(async (url: string) => {
    const text = files.get(new URL(url).pathname);
    return text === undefined ? new Response('No draft.', { status: 404 }) : new Response(text);
  });
  const { Source, emit } = fakeSource();
  startLiveReload({
    info: { protocol: 1, events: '/__protoyard/events' },
    origin: 'http://127.0.0.1:4180',
    current: () => shown,
    // Like run.ts: what is shown follows the applied change (a draft keeps its base).
    apply: async (change) => {
      applied.push(change);
      shown = {
        blueprint: change.blueprint,
        sha256: change.sha256,
        namespace: change.world?.namespace ?? 'bp-fresh',
        ...(change.draft ? { base: change.draft.base } : {}),
      };
    },
    fetch,
    EventSource: Source as never,
    session,
    shareSessionKey: PLAYER_SHARE_SESSION_KEY,
    onError: (error) => errors.push(error),
  });
  /** Serves the part of `text` that has arrived, as `quick serve` does, and announces it. */
  const draft = async (text: string, base: unknown = identity.sha256) => {
    const painted = await paintStreamedBlueprint(text);
    if (!painted || painted.complete) throw new Error('expected a partial blueprint');
    files.set(DRAFT_PATH, painted.json);
    const sha256 = (await blueprintIdentity(painted.blueprint)).sha256;
    emit('draft', { file: 'base', path: DRAFT_PATH, sha256, base });
    return { sha256, blueprint: painted.blueprint };
  };
  const idle = () => new Promise((resolve) => setTimeout(resolve, 150));
  return {
    emit,
    applied,
    errors,
    session,
    fetch,
    files,
    draft,
    idle,
    shown: () => shown,
    base: identity.sha256,
  };
}

const DRAFT_PATH = '/__protoyard/drafts/base.json';
const slides = (blueprint: AnyBlueprint | undefined) =>
  (blueprint as DeckBlueprint | undefined)?.deck.slides.length ?? 0;

describe('progressive painting in the player', () => {
  it('paints each draft in the same world, then the complete blueprint replaces it', async () => {
    const complete = await parseAnyBlueprint(JSON.parse(deckText));
    // The deck on screen: an earlier, shorter state of the same file.
    const earlier = await paintStreamedBlueprint(
      deckText.slice(0, Math.floor(deckText.length * 0.2))
    );
    if (!earlier) throw new Error('expected an early partial deck');
    const t = await setup(earlier.blueprint);

    const first = await t.draft(deckText.slice(0, Math.floor(deckText.length * 0.4)));
    await vi.waitFor(() => expect(t.applied).toHaveLength(1));
    expect(t.fetch).toHaveBeenCalledWith(
      `http://127.0.0.1:4180${DRAFT_PATH}`,
      expect.objectContaining({ cache: 'no-store', credentials: 'omit' })
    );
    expect(t.applied[0]).toMatchObject({
      kind: 'safe',
      sha256: first.sha256,
      world: { namespace: 'bp-world' },
      draft: { base: t.base },
    });
    expect(committedIdentity(t.shown())).toBe(t.base);

    await t.draft(deckText.slice(0, Math.floor(deckText.length * 0.8)));
    await vi.waitFor(() => expect(t.applied).toHaveLength(2));
    expect(slides(t.applied[1]?.blueprint)).toBeGreaterThan(slides(t.applied[0]?.blueprint));
    // Drafts never touch the share link or the remembered worlds.
    expect(t.session.store.has(PLAYER_SHARE_SESSION_KEY)).toBe(false);
    expect(t.session.store.has(LIVE_NAMESPACES_KEY)).toBe(false);

    t.files.set('/deck/blueprint.json', deckText);
    const done = await blueprintIdentity(complete);
    t.emit('blueprint', {
      file: 'base',
      path: '/deck/blueprint.json',
      sha256: done.sha256,
      previous: t.base,
    });
    await vi.waitFor(() => expect(t.applied).toHaveLength(3));
    expect(t.applied[2]).toMatchObject({
      kind: 'safe',
      sha256: done.sha256,
      world: { namespace: 'bp-world' },
    });
    expect(t.applied[2]?.draft).toBeUndefined();
    expect(t.shown().base).toBeUndefined();
    expect(t.session.store.has(PLAYER_SHARE_SESSION_KEY)).toBe(true);
    expect(t.errors).toEqual([]);
  });

  it('ignores a draft of another base, a stale hash, a foreign path or a missing draft', async () => {
    const t = await setup(await parseAnyBlueprint(JSON.parse(deckText)));
    const half = deckText.slice(0, Math.floor(deckText.length / 2));
    await t.draft(half, 'f'.repeat(64));
    await t.draft(half, null);
    const { sha256 } = await t.draft(half, 'f'.repeat(64));
    const event = { file: 'base', path: DRAFT_PATH, sha256, base: t.base };
    t.emit('draft', { ...event, path: '//elsewhere.example/blueprint.json' });
    t.emit('draft', { ...event, sha256: 'e'.repeat(64) }); // More arrived since.
    await t.idle();
    t.files.delete(DRAFT_PATH); // Complete by now: the server has no draft.
    t.emit('draft', event);
    await t.idle();
    expect(t.applied).toEqual([]);
    expect(t.errors).toEqual([]);
  });

  it('never paints a draft into an app world, nor an app as a draft', async () => {
    const appText = readFileSync(join(ROOT, 'blueprints/crm.json'), 'utf8');
    const app = await parseAnyBlueprint(JSON.parse(appText));
    const t = await setup(app);
    await t.draft(deckText.slice(0, Math.floor(deckText.length / 2)));
    await t.idle();
    expect(t.applied).toEqual([]);

    const deck = await setup(await parseAnyBlueprint(JSON.parse(deckText)));
    deck.files.set(DRAFT_PATH, appText);
    deck.emit('draft', {
      file: 'base',
      path: DRAFT_PATH,
      sha256: (await blueprintIdentity(app)).sha256,
      base: deck.base,
    });
    await deck.idle();
    expect(deck.applied).toEqual([]);
  });
});
