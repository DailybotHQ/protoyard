// @vitest-environment node
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blueprintIdentity, paintStreamedBlueprint } from '@protoyard/blueprint';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type BlueprintChange,
  type BlueprintDraft,
  createQuickEventHub,
  QUICK_DRAFT_INTERVAL_MS,
  QUICK_DRAFTS_PREFIX,
  QUICK_EVENTS_PATH,
  readBlueprintDraft,
  readBlueprintIdentity,
  watchBlueprints,
} from '../src/lib/quick/events.ts';
import { createWorkspace, type TempWorkspace } from './helpers.ts';

/**
 * Progressive painting under `quick serve`: while a deck, page or doc is still
 * being written, the watcher announces the identity of the part that has
 * arrived (a `draft` event, never content), at a bounded rate while writes
 * keep coming; the complete blueprint then gets its usual `blueprint` event
 * with the last complete identity as `previous`. Apps never draft.
 */

const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const deckText = `${JSON.stringify(
  JSON.parse(readFileSync(join(REPO, 'blueprints/decks/everything.json'), 'utf8')),
  null,
  2
)}\n`;
const appText = readFileSync(join(REPO, 'blueprints/quick/analytics.json'), 'utf8');
const partIdentity = async (text: string) => {
  const painted = await paintStreamedBlueprint(text);
  if (!painted) throw new Error('nothing to paint');
  return (await blueprintIdentity(painted.blueprint)).sha256;
};

let ws: TempWorkspace;
beforeEach(() => {
  ws = createWorkspace();
});
afterEach(() => ws.cleanup());

function writeAtomic(path: string, text: string) {
  writeFileSync(`${path}.tmp`, text);
  renameSync(`${path}.tmp`, path);
}

async function fakeWatch(file: string, options: { debounceMs?: number; maxWaitMs?: number } = {}) {
  const listeners = new Map<string, (name: string | null) => void>();
  const changes: BlueprintChange[] = [];
  const drafts: BlueprintDraft[] = [];
  const watcher = await watchBlueprints({
    files: [{ id: 'base', file, path: '/idea/blueprint.json' }],
    debounceMs: options.debounceMs ?? 20,
    ...(options.maxWaitMs !== undefined ? { maxWaitMs: options.maxWaitMs } : {}),
    onChange: (change) => changes.push(change),
    onDraft: (draft) => drafts.push(draft),
    watchDir: (dir, listener) => {
      listeners.set(dir, listener);
      return { close: () => listeners.delete(dir) };
    },
  });
  const fire = () => {
    for (const listener of listeners.values()) listener('blueprint.json');
  };
  return { watcher, changes, drafts, fire };
}
const DRAFT_PATH = '/__protoyard/drafts/base.json';
const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

describe('readBlueprintDraft', () => {
  it('names the part of a truncated deck that validates, and nothing for an app or a complete file', async () => {
    const dir = join(ws.root, 'idea');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'blueprint.json');
    const part = deckText.slice(0, Math.floor(deckText.length / 2));
    writeFileSync(file, part);
    const painted = await paintStreamedBlueprint(part);
    expect(await readBlueprintDraft(file)).toEqual({
      sha256: await partIdentity(part),
      json: painted?.json,
    });
    writeFileSync(file, deckText);
    expect(await readBlueprintDraft(file)).toBeNull();
    writeFileSync(file, appText.slice(0, Math.floor(appText.length / 2)));
    expect(await readBlueprintDraft(file)).toBeNull();
    expect(await readBlueprintDraft(join(dir, 'missing.json'))).toBeNull();
  });
});

describe('watchBlueprints drafts', () => {
  it('announces each new draft, then the complete blueprint against the last complete identity', async () => {
    const dir = join(ws.root, 'idea');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'blueprint.json');
    const startText = deckText.slice(0, Math.floor(deckText.length * 0.2));
    // The exploration starts from a complete (shorter) deck.
    const start = await paintStreamedBlueprint(startText);
    writeFileSync(file, JSON.stringify(start?.blueprint));
    const base = (await readBlueprintIdentity(file))?.sha256;
    const t = await fakeWatch(file);

    const half = deckText.slice(0, Math.floor(deckText.length / 2));
    writeFileSync(file, half);
    t.fire();
    await settle();
    writeFileSync(file, half); // Same draft again: no second event.
    t.fire();
    await settle();
    const more = deckText.slice(0, Math.floor(deckText.length * 0.8));
    writeFileSync(file, more);
    t.fire();
    await settle();
    expect(t.drafts).toEqual([
      { file: 'base', path: DRAFT_PATH, sha256: await partIdentity(half), base },
      { file: 'base', path: DRAFT_PATH, sha256: await partIdentity(more), base },
    ]);
    // The watcher holds the latest draft's JSON for the hub to serve.
    expect(t.watcher.draft('base')).toBe((await paintStreamedBlueprint(more))?.json);
    expect(t.changes).toEqual([]);
    expect(t.watcher.current()).toEqual({ base });

    writeAtomic(file, deckText);
    t.fire();
    await settle();
    const done = await readBlueprintIdentity(file);
    expect(t.watcher.draft('base')).toBeNull();
    expect(t.changes).toEqual([
      {
        file: 'base',
        path: '/idea/blueprint.json',
        sha256: done?.sha256,
        previous: base,
        namespace: done?.namespace,
      },
    ]);
    t.watcher.close();
  });

  it('replaces a draft on screen even when the finished blueprint equals the one before', async () => {
    const dir = join(ws.root, 'idea');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'blueprint.json');
    writeFileSync(file, deckText);
    const base = (await readBlueprintIdentity(file))?.sha256;
    const t = await fakeWatch(file);
    writeFileSync(file, deckText.slice(0, Math.floor(deckText.length / 2)));
    t.fire();
    await settle();
    expect(t.drafts).toHaveLength(1);
    writeAtomic(file, deckText);
    t.fire();
    await settle();
    expect(t.changes).toMatchObject([{ sha256: base, previous: base }]);
    // Settled again: an identical rewrite stays quiet.
    writeAtomic(file, `${deckText}\n`);
    t.fire();
    await settle();
    expect(t.changes).toHaveLength(1);
    t.watcher.close();
  });

  it('never drafts an app', async () => {
    const dir = join(ws.root, 'idea');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'blueprint.json');
    writeFileSync(file, appText);
    const t = await fakeWatch(file);
    writeFileSync(file, appText.slice(0, Math.floor(appText.length * 0.7)));
    t.fire();
    await settle();
    expect(t.drafts).toEqual([]);
    expect(t.changes).toEqual([]);
    t.watcher.close();
  });

  it('still reads a file that keeps changing, at most once per interval', async () => {
    expect(QUICK_DRAFT_INTERVAL_MS).toBe(400);
    const dir = join(ws.root, 'idea');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'blueprint.json');
    writeFileSync(file, deckText);
    const t = await fakeWatch(file, { debounceMs: 40, maxWaitMs: 120 });
    // A write every 10 ms for ~400 ms: a plain 40 ms debounce would never fire.
    const step = Math.ceil(deckText.length / 40);
    const started = performance.now();
    for (let i = 1; i <= 40; i += 1) {
      writeFileSync(file, deckText.slice(0, Math.min(deckText.length - 2, i * step)));
      t.fire();
      await settle(10);
    }
    const elapsed = performance.now() - started;
    const during = t.drafts.length;
    expect(during).toBeGreaterThanOrEqual(1);
    // At most one read per 120 ms window (plus the one in flight), however slow the machine.
    expect(during).toBeLessThanOrEqual(Math.ceil(elapsed / 120) + 1);
    await settle(100);
    t.watcher.close();
  });
});

describe('the event hub', () => {
  function stream() {
    const written: string[] = [];
    let status = 0;
    let headers: Record<string, string> = {};
    const response = {
      writeHead: (code: number, head: Record<string, string>) => {
        status = code;
        headers = head;
        return response;
      },
      write: (chunk: string) => written.push(chunk),
      end: (chunk?: string) => {
        if (chunk !== undefined) written.push(chunk);
      },
      on: () => response,
    } as unknown as ServerResponse;
    return { response, written, status: () => status, headers: () => headers };
  }
  const get = (method = 'GET', origin?: string) =>
    ({
      method,
      headers: { host: '127.0.0.1:4180', ...(origin ? { origin } : {}) },
      on: () => undefined,
    }) as unknown as IncomingMessage;

  it('frames a draft as its own event type with identities and a path only', () => {
    const hub = createQuickEventHub({
      current: () => ({ base: null }),
      commentsPath: '/api/comments',
    });
    const s = stream();
    expect(hub.route(get(), s.response, QUICK_EVENTS_PATH)).toBe(true);
    const draft = { file: 'base', path: DRAFT_PATH, sha256: 'a'.repeat(64), base: 'b'.repeat(64) };
    hub.publishDraft(draft);
    expect(s.written.at(-1)).toBe(`event: draft\ndata: ${JSON.stringify(draft)}\n\n`);
    hub.close();
  });

  it('serves the current draft JSON, same origin only, and 404 for none or a bad id', () => {
    const drafts: Record<string, string> = { base: '{"kind":"deck"}' };
    const hub = createQuickEventHub({
      current: () => ({ base: null }),
      commentsPath: '/api/comments',
      draft: (id) => drafts[id] ?? null,
    });
    const ok = stream();
    expect(hub.route(get(), ok.response, DRAFT_PATH)).toBe(true);
    expect(ok.status()).toBe(200);
    expect(ok.headers()).toMatchObject({ 'Cache-Control': 'no-store' });
    expect(ok.written.join('')).toBe('{"kind":"deck"}');
    for (const path of [
      `${QUICK_DRAFTS_PREFIX}v1.json`,
      `${QUICK_DRAFTS_PREFIX}..%2Fquick.json`,
      `${QUICK_DRAFTS_PREFIX}base.txt`,
    ]) {
      const missing = stream();
      hub.route(get(), missing.response, path);
      expect(missing.status(), path).toBe(404);
    }
    const foreign = stream();
    hub.route(get('GET', 'http://elsewhere.example'), foreign.response, DRAFT_PATH);
    expect(foreign.status()).toBe(403);
    const post = stream();
    hub.route(get('POST'), post.response, DRAFT_PATH);
    expect(post.status()).toBe(405);
    hub.close();
  });
});
