import { BrandThemeError, encodeBlueprintShare, parseBlueprint } from '@protoyard/blueprint';
import { configure, fireEvent, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import demo from '../src/fixtures/demo.blueprint.json';
import {
  bootIssues,
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
  it('accepts relative .json paths inside the player folder', () => {
    for (const src of [
      './blueprint.json',
      'blueprint.json',
      './ideas/idea-1.json',
      'blueprint.json?v=2',
    ]) {
      const result = resolveSrcUrl(src, HREF);
      expect('url' in result, src).toBe(true);
      if ('url' in result) expect(result.url.origin).toBe('https://player.example');
    }
  });

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

  it('loads ?src from the same origin without credentials leaving it', async () => {
    const fetch = vi.fn(async () => jsonResponse(demoJson));
    const result = await resolveSource({
      hash: '',
      search: '?src=./blueprint.json',
      href: HREF,
      fetch,
    });
    expect(result).toMatchObject({ kind: 'blueprint', source: 'src', label: 'blueprint.json' });
    expect(fetch).toHaveBeenCalledWith('https://player.example/play/blueprint.json', {
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-cache',
    });
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

  it('opens a blueprint embedded by a single-file export, after #bp= and before ?src', async () => {
    const fetch = vi.fn();
    const embedded = JSON.stringify(blueprint);
    const result = await resolveSource({
      hash: '',
      search: '?src=./blueprint.json',
      href: HREF,
      embedded,
      fetch,
    });
    expect(result).toMatchObject({ kind: 'blueprint', source: 'embedded' });
    if (result.kind === 'blueprint') expect(result.blueprint.name).toBe(blueprint.name);
    expect(fetch).not.toHaveBeenCalled();
    // An explicit share link still wins.
    const shared = await resolveSource({
      hash: await shareHash(),
      search: '',
      href: HREF,
      embedded,
    });
    expect(shared).toMatchObject({ source: 'share' });
    // Embedded text is untrusted like any source.
    const bad = await resolveSource({
      hash: '',
      search: '',
      href: HREF,
      embedded: '{"__proto__":{}}',
    });
    expect(bad).toMatchObject({ kind: 'error', source: 'embedded' });
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

  it('falls back to the picker when there is no source', async () => {
    expect(await resolveSource({ hash: '', search: '', href: HREF })).toEqual({ kind: 'picker' });
    expect(await resolveSource({ hash: '#/settings', search: '?devtools=0', href: HREF })).toEqual({
      kind: 'picker',
    });
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

  it('reopens the remembered blueprint on a reload at an app route, without touching the route', async () => {
    const payload = (await shareHash()).slice('#bp='.length);
    const tab = tabState({ [PLAYER_SHARE_SESSION_KEY]: payload });
    const boot = vi.fn(async () => undefined);
    started = await startPlayer({
      target: target(),
      location: { hash: '#/workspaces', search: '', href: `${HREF}#/workspaces` },
      events: fakeEvents(),
      boot,
      session: tab.session,
      history: tab.history,
    });
    expect(started.state()).toBe('booted');
    expect((boot.mock.calls[0] as unknown[])[0]).toMatchObject({ name: blueprint.name });
    expect(tab.replaced).toEqual([]);
  });

  it('lets ?src win and forget the link, and falls back to the picker for a stale saved link', async () => {
    const payload = (await shareHash()).slice('#bp='.length);
    const tab = tabState({ [PLAYER_SHARE_SESSION_KEY]: payload });
    started = await startPlayer({
      target: target(),
      location: { hash: '', search: '?src=./blueprint.json', href: `${HREF}?src=./blueprint.json` },
      events: fakeEvents(),
      fetch: async () => jsonResponse(demoJson),
      boot: vi.fn(async () => undefined),
      session: tab.session,
      history: tab.history,
    });
    expect(tab.values.has(PLAYER_SHARE_SESSION_KEY)).toBe(false);
    await started.stop();

    const stale = tabState({ [PLAYER_SHARE_SESSION_KEY]: '1.%%%broken' });
    started = await startPlayer({
      target: target(),
      location: { hash: '', search: '', href: HREF },
      events: fakeEvents(),
      boot: vi.fn(),
      session: stale.session,
      history: stale.history,
    });
    expect(started.state()).toBe('picker');
  });
});

describe('startPlayer', () => {
  const target = () => document.body.appendChild(document.createElement('div'));

  it('boots a share link and reloads only for a different share link, never for app routes', async () => {
    const boot = vi.fn(async () => undefined);
    const reload = vi.fn();
    const events = fakeEvents();
    const location = { hash: await shareHash(), search: '', href: HREF };
    started = await startPlayer({ target: target(), location, events, boot, reload });
    expect(started.state()).toBe('booted');
    expect(boot).toHaveBeenCalledTimes(1);
    expect((boot.mock.calls[0] as unknown[])[0]).toMatchObject({ name: blueprint.name });

    events.fire();
    expect(reload).not.toHaveBeenCalled();
    // In-app navigation changes the hash but keeps the blueprint.
    location.hash = '#/workspaces';
    events.fire();
    location.hash = '#/workspaces/w-1';
    events.fire();
    expect(reload).not.toHaveBeenCalled();
    location.hash = '#bp=1.other';
    events.fire();
    expect(reload).toHaveBeenCalledTimes(1);
    events.fire();
    expect(reload).toHaveBeenCalledTimes(1);
  });

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

  it('routes a BrandThemeError at definition time to the error screen', async () => {
    started = await startPlayer({
      target: target(),
      location: { hash: await shareHash(), search: '', href: HREF },
      events: fakeEvents(),
      boot: async () => {
        throw new BrandThemeError('Unknown library theme "no-such-theme" (closest: nord).');
      },
    });
    expect(started.state()).toBe('error');
    expect(await screen.findByText(/Unknown library theme "no-such-theme"/)).toBeTruthy();
    expect(screen.getByText('invalid-brand')).toBeTruthy();
    expect(bootIssues(new Error('boom'))[0]).toMatchObject({ code: 'boot-failed' });
  });

  it('offers the picker, rejects an invalid file in place, then boots a valid one', {
    timeout: 30_000,
  }, async () => {
    const boot = vi.fn(async () => undefined);
    started = await startPlayer({
      target: target(),
      location: { hash: '', search: '', href: HREF },
      events: fakeEvents(),
      boot,
    });
    expect(started.state()).toBe('picker');
    expect(await screen.findByRole('heading', { name: 'Open a blueprint' })).toBeTruthy();
    expect(document.documentElement.dataset.playerState).toBe('picker');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();

    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['{}'], 'empty.json', { type: 'application/json' })],
    });
    await fireEvent.change(input);
    expect(await screen.findByText(/empty\.json could not be opened/)).toBeTruthy();
    expect(boot).not.toHaveBeenCalled();

    const again = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(again.disabled).toBe(false);
    Object.defineProperty(again, 'files', {
      configurable: true,
      value: [new File([demoJson], 'blueprint.json', { type: 'application/json' })],
    });
    await fireEvent.change(again);
    await waitFor(() => expect(boot).toHaveBeenCalledTimes(1));
    expect(started.state()).toBe('booted');
  });

  it('opens the bundled demo from the picker, and the error screen leads back to the picker', {
    timeout: 30_000,
  }, async () => {
    const boot = vi.fn(async () => undefined);
    started = await startPlayer({
      target: target(),
      location: { hash: '#bp=1.%%%', search: '', href: HREF },
      events: fakeEvents(),
      boot,
      loadDemo: async () => blueprint,
    });
    expect(started.state()).toBe('error');
    await fireEvent.click(await screen.findByRole('button', { name: 'Open a blueprint file' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Open the demo blueprint' }));
    await waitFor(() => expect(boot).toHaveBeenCalledWith(blueprint, expect.any(HTMLElement)));
  });
});
