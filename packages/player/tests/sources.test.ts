import { encodeBlueprintShare, parseBlueprint } from '@protoyard/blueprint';
import { configure, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import demo from '../src/fixtures/demo.blueprint.json';
import {
  EMBEDDED_BLUEPRINT_ID,
  loadBlueprintFromFile,
  readEmbeddedBlueprint,
  resolveSource,
  resolveSrcUrl,
  type StartedPlayer,
  startPlayer,
} from '../src/sources/index.ts';
import { PLAYER_SHARE_SESSION_KEY } from '../src/sources/start.ts';

configure({ asyncUtilTimeout: 10_000 });

const HREF = 'https://player.example/play/index.html';
const blueprint = parseBlueprint(demo);
const demoJson = JSON.stringify(demo);
let started: StartedPlayer | undefined;

afterEach(async () => {
  await started?.stop();
  started = undefined;
  document.body.replaceChildren();
  delete document.documentElement.dataset.pyReady;
  delete document.documentElement.dataset.playerState;
  sessionStorage.clear();
});

/** A sessionStorage stand-in plus a history stub that records URL replacements. */
function tabState(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const replaced: string[] = [];
  return {
    values,
    replaced,
    session: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    },
    history: {
      state: null,
      replaceState: (_state: unknown, _title: string, url?: string | URL | null) =>
        void replaced.push(String(url)),
    },
  };
}

function jsonResponse(body: string, init: ResponseInit = {}) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

async function shareHash() {
  return `#bp=${await encodeBlueprintShare(blueprint)}`;
}

function fakeEvents() {
  const target = new EventTarget();
  return {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    fire: () => target.dispatchEvent(new Event('hashchange')),
  };
}

describe('resolveSrcUrl', () => {
  it('rejects absolute, cross-origin, root-relative, escaping and non-JSON sources', () => {
    for (const src of [
      'https://elsewhere.example/blueprint.json',
      'HTTP://player.example/play/blueprint.json',
      '//elsewhere.example/blueprint.json',
      'javascript:alert(1)',
      'data:application/json,{}',
      '/play/blueprint.json',
      '../blueprint.json',
      './a/../../blueprint.json',
      '.\\blueprint.json',
      './blueprint.txt',
      '',
      `./${'a'.repeat(600)}.json`,
    ]) {
      const result = resolveSrcUrl(src, HREF);
      expect('issue' in result, src).toBe(true);
      if ('issue' in result) expect(result.issue.code).toBe('unsafe-src');
    }
  });
});

describe('resolveSource', () => {
  it('opens a #bp= share link first, ahead of ?src', async () => {
    const fetch = vi.fn();
    const result = await resolveSource({
      hash: await shareHash(),
      search: '?src=./blueprint.json',
      href: HREF,
      fetch,
    });
    expect(result).toMatchObject({ kind: 'blueprint', source: 'share' });
    if (result.kind === 'blueprint') expect(result.blueprint.name).toBe(blueprint.name);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports a broken or unsupported share link with issues and fixes', async () => {
    const broken = await resolveSource({ hash: '#bp=1.%%%', search: '', href: HREF });
    expect(broken).toMatchObject({ kind: 'error', source: 'share' });
    if (broken.kind === 'error') expect(broken.issues[0]).toMatchObject({ code: 'invalid-link' });
    const old = await resolveSource({
      hash: await shareHash(),
      search: '',
      href: HREF,
      supportsDeflateRaw: () => false,
    });
    expect(old).toMatchObject({ kind: 'error', issues: [{ code: 'unsupported-browser' }] });
    if (old.kind === 'error')
      expect(old.issues[0]?.message).toMatch(/Chrome 103\+, Safari 16\.4\+, Firefox 113\+/);
  });

  it('never fetches a refused ?src, and reports failed, oversized and invalid files', async () => {
    const fetch = vi.fn(async () => jsonResponse(demoJson));
    const refused = await resolveSource({
      hash: '',
      search: '?src=https://elsewhere.example/b.json',
      href: HREF,
      fetch,
    });
    expect(refused).toMatchObject({ kind: 'error', issues: [{ code: 'unsafe-src' }] });
    expect(fetch).not.toHaveBeenCalled();

    const cases: [Response | Error, string][] = [
      [new Response('missing', { status: 404 }), 'fetch-failed'],
      [new Error('offline'), 'fetch-failed'],
      // The transport cap is the document loader's (1 MiB, any kind)…
      [jsonResponse('{}', { headers: { 'content-length': String(1024 * 1024 + 1) } }), 'too-large'],
      [jsonResponse('x'.repeat(1024 * 1024 + 1)), 'too-large'],
      // …and the app loader still refuses an app over its own 256 KB.
      [jsonResponse('x'.repeat(300 * 1024)), 'too-large'],
      [jsonResponse('{not json'), 'invalid-json'],
      [jsonResponse(JSON.stringify({ ...demo, entities: [] })), 'invalid-blueprint'],
    ];
    for (const [response, code] of cases) {
      const result = await resolveSource({
        hash: '',
        search: '?src=./blueprint.json',
        href: HREF,
        fetch: async () => {
          if (response instanceof Error) throw response;
          return response;
        },
      });
      expect(result.kind, code).toBe('error');
      if (result.kind === 'error')
        expect(
          result.issues.map((issue) => issue.code),
          code
        ).toContain(code);
    }
  });

  it('reads only an inert JSON script with the exact id', () => {
    const doc = document.implementation.createHTMLDocument('x');
    expect(readEmbeddedBlueprint(doc)).toBeNull();
    doc.body.innerHTML = `<div id="${EMBEDDED_BLUEPRINT_ID}">{}</div>`;
    expect(readEmbeddedBlueprint(doc)).toBeNull();
    doc.body.innerHTML = `<script id="${EMBEDDED_BLUEPRINT_ID}" type="module">{}</script>`;
    expect(readEmbeddedBlueprint(doc)).toBeNull();
    doc.body.innerHTML = `<script id="${EMBEDDED_BLUEPRINT_ID}" type="application/json">{"a":1}</script>`;
    expect(readEmbeddedBlueprint(doc)).toBe('{"a":1}');
    expect(readEmbeddedBlueprint(undefined)).toBeNull();
  });
});

describe('loadBlueprintFromFile', () => {
  it('loads a valid file, and refuses oversized or invalid ones before running anything', async () => {
    const valid = await loadBlueprintFromFile(new File([demoJson], 'blueprint.json'));
    expect('blueprint' in valid).toBe(true);
    // Over the 1 MiB document cap: refused before the file is read.
    const big = new File(['x'.repeat(1024 * 1024 + 1)], 'big.json');
    const text = vi.spyOn(big, 'text');
    expect(await loadBlueprintFromFile(big)).toMatchObject({ issues: [{ code: 'too-large' }] });
    expect(text).not.toHaveBeenCalled();
    expect(await loadBlueprintFromFile(new File(['[1, 2'], 'bad.json'))).toMatchObject({
      issues: [{ code: 'invalid-json' }],
    });
  });
});

describe('share links and app routes', () => {
  const target = () => document.body.appendChild(document.createElement('div'));

  it('remembers a #bp= link for this tab and opens the app at its home route', async () => {
    const tab = tabState();
    const hash = await shareHash();
    started = await startPlayer({
      target: target(),
      location: { hash, search: '?devtools=0', href: `${HREF}?devtools=0${hash}` },
      events: fakeEvents(),
      boot: vi.fn(async () => undefined),
      session: tab.session,
      history: tab.history,
    });
    expect(started.state()).toBe('booted');
    expect(tab.values.get(PLAYER_SHARE_SESSION_KEY)).toBe(hash.slice('#bp='.length));
    expect(tab.replaced).toEqual(['/play/index.html?devtools=0#/']);
  });
});

describe('startPlayer', () => {
  const target = () => document.body.appendChild(document.createElement('div'));

  it('shows an accessible error screen with every issue, as text, never a blank page', async () => {
    const hostile = JSON.stringify({ ...demo, '<img src=x onerror=alert(1)>': true });
    const el = target();
    started = await startPlayer({
      target: el,
      location: { hash: '', search: '?src=./blueprint.json', href: HREF },
      events: fakeEvents(),
      fetch: async () => jsonResponse(hostile),
      boot: vi.fn(),
    });
    expect(started.state()).toBe('error');
    const heading = await screen.findByRole('heading', {
      name: /blueprint\.json could not be opened/,
    });
    expect(document.activeElement).toBe(heading);
    expect(document.documentElement.dataset.pyReady).toBe('error');
    expect(screen.getByRole('list', { name: 'Problems found' }).textContent).toMatch(
      /Unrecognized key/
    );
    expect(el.querySelector('img')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open a blueprint file' })).toBeTruthy();
  });
});
