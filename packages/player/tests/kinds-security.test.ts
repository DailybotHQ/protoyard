import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  type AnyBlueprint,
  encodeBlueprintShare,
  loadUntrustedDocument,
  parseBlueprint,
} from '@protoyard/blueprint';
import { type PrototypeDefinition } from '@protoyard/core';
import { createPrototypeRuntime } from '@protoyard/runtime';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type BootedPlayer } from '../src/boot.ts';
import {
  checkRequest,
  createEmbedListener,
  exactOrigin,
  MAX_MESSAGE_BLUEPRINT_BYTES,
  PLAYER_PROTOCOL,
  type PlayerMessage,
} from '../src/embed/index.ts';
import { kindEntryBoot } from '../src/entries/run-kind.ts';
import demo from '../src/fixtures/demo.blueprint.json';
import { createMountEmbed } from '../src/kinds/mount-embed.ts';
import { loadersFor } from '../src/kinds/renderers.ts';
import { startPlayer } from '../src/sources/start.ts';
import { inlineScripts, PLAYER_FRAME_ANCESTORS } from '../vite.config.ts';
import { ensurePlayerBuild } from './support/serve-dist.ts';

/**
 * The kind threat model at the player (docs/SECURITY.md "Kinds"):
 *
 * 1. the kind renderers (blocks-ui, decks-ui, pages-ui and the player's kind
 *    modules) never turn data into code or HTML;
 * 2. hostile markup in every multiline field renders as inert text: no
 *    elements, handlers or `javascript:` links come out of a deck, page or doc;
 * 3. an oversize, hostile or smuggling source fails at the loader, before the
 *    kind boot or any renderer module loads;
 * 4. `mountEmbed` frames only a valid app from this same origin;
 * 5. each built kind page's CSP is no looser than index.html's.
 */

const loads = vi.hoisted(() => ({ renderers: [] as string[] }));
// Each factory records the renderer module's first load.
vi.mock('@protoyard/decks-ui/app', async (importOriginal) => {
  loads.renderers.push('decks-ui/app');
  return importOriginal();
});
vi.mock('@protoyard/pages-ui/page', async (importOriginal) => {
  loads.renderers.push('pages-ui/page');
  return importOriginal();
});
vi.mock('@protoyard/pages-ui/doc', async (importOriginal) => {
  loads.renderers.push('pages-ui/doc');
  return importOriginal();
});
vi.mock('@protoyard/blocks-ui', async (importOriginal) => {
  loads.renderers.push('blocks-ui');
  return importOriginal();
});

const ROOT = join(import.meta.dirname, '../../..');
const FIXTURES = join(ROOT, 'packages/blueprint/tests/fixtures/kinds');
// biome-ignore lint/suspicious/noExplicitAny: fixtures are edited freely in tests.
type Json = Record<string, any>;
const fixture = (name: string): Json => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));

const PAYLOAD =
  '<script>globalThis.__pyPwned = 1</script><img src=x onerror="globalThis.__pyPwned = 2">';
const LINK = '[click](javascript:globalThis.__pyPwned=3)';

const opened: { destroy(): Promise<void> }[] = [];
afterEach(async () => {
  for (const item of opened.splice(0)) await item.destroy();
  document.body.replaceChildren();
});

function location(search: string, hash = '') {
  return { search, hash, href: `http://localhost:3000/deck.html${search}${hash}` };
}

/** Starts the deck page's real source flow with a counted kind boot. */
async function startDeckPage(options: { search?: string; hash?: string; fetch?: typeof fetch }) {
  const target = document.body.appendChild(document.createElement('div'));
  const loadBoot = vi.fn(async () => import('../src/boot-kind.ts'));
  const started = await startPlayer({
    target,
    location: location(options.search ?? '', options.hash ?? ''),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    boot: kindEntryBoot({ kind: 'deck', window, loadBoot, loaders: loadersFor('deck') }),
    session: null,
    embedded: null,
    reload: () => {},
  });
  opened.push({ destroy: () => started.stop() });
  return { started, target, loadBoot };
}

const respond = (text: string) =>
  vi.fn(async () => new Response(text, { status: 200 })) as unknown as typeof fetch;

describe('hostile sources fail before the kind boot or any renderer loads', () => {
  it('refuses a deck over 1 MiB from ?src=', async () => {
    const big = fixture('intro.deck.json');
    big.deck.slides[0].notes = 'x'.repeat(1024 * 1024);
    const { started, target, loadBoot } = await startDeckPage({
      search: '?src=./big.json',
      fetch: respond(JSON.stringify(big)),
    });
    expect(started.state()).toBe('error');
    expect(target.textContent).toMatch(/larger than|byte limit/);
    expect(loadBoot).not.toHaveBeenCalled();
    expect(loads.renderers).toEqual([]);
  });

  it('refuses a deck that smuggles another deck in an embed-app block', async () => {
    const value = fixture('intro.deck.json');
    value.deck.slides.push({
      id: 'free-one',
      layout: 'free',
      blocks: [
        { type: 'embed-app', id: 'nested', title: 'Nested', app: fixture('intro.deck.json') },
      ],
    });
    value.deck.outline.sections[0].slideIds.push('free-one');
    const { started, loadBoot } = await startDeckPage({
      search: '?src=./smuggle.json',
      fetch: respond(JSON.stringify(value)),
    });
    expect(started.state()).toBe('error');
    expect(loadBoot).not.toHaveBeenCalled();
    expect(loads.renderers).toEqual([]);
  });

  it('refuses a share link carrying a javascript: link or remote media', async () => {
    for (const block of [
      { type: 'cta', actions: [{ label: 'Go', href: 'javascript:alert(1)' }] },
      { type: 'image', src: 'https://evil.example/x.png', alt: 'X', width: 10, height: 10 },
    ]) {
      const value = fixture('intro.deck.json');
      value.deck.slides.push({ id: 'free-one', layout: 'free', blocks: [block] });
      value.deck.outline.sections[0].slideIds.push('free-one');
      const link = await encodeBlueprintShare(value as AnyBlueprint);
      const { started, loadBoot } = await startDeckPage({ hash: `#bp=${link}` });
      expect(started.state(), block.type).toBe('error');
      expect(loadBoot).not.toHaveBeenCalled();
    }
    expect(loads.renderers).toEqual([]);
  });
});

describe('kind renderers never turn data into code or HTML', () => {
  const RENDERER_SOURCES = [
    'packages/blocks-ui/src',
    'packages/decks-ui/src',
    'packages/pages-ui/src',
    'packages/player/src/kinds',
    'packages/player/src/entries',
  ];
  const FORBIDDEN: [string, RegExp][] = [
    ['{@html}', /\{@html\b/],
    ['eval()', /(?<![.\w])eval\s*\(/],
    ['new Function()', /new\s+Function\s*\(/],
    ['innerHTML/outerHTML assignment', /\.(?:inner|outer)HTML\s*=/],
    ['insertAdjacentHTML', /insertAdjacentHTML\s*\(/],
    ['document.write', /\.write(?:ln)?\s*\(/],
    ['srcdoc', /\bsrcdoc\b/],
    ['dynamic import of a computed specifier', /(?<![.\w])import\(\s*(?!['"`]|\))/],
  ];
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sources(path);
      return /\.(ts|js|svelte)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
    });

  it('has no HTML or code sinks in the renderer sources', () => {
    const hits: string[] = [];
    for (const dir of RENDERER_SOURCES) {
      for (const file of sources(join(ROOT, dir))) {
        const text = readFileSync(file, 'utf8');
        for (const [label, pattern] of FORBIDDEN) {
          if (pattern.test(text)) hits.push(`${file.slice(ROOT.length)}: ${label}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});

const runtimeFactory = () => {
  const indexedDB = new IDBFactory();
  return (definition: PrototypeDefinition, options: Parameters<typeof createPrototypeRuntime>[1]) =>
    createPrototypeRuntime(definition, {
      ...options,
      indexedDB,
      IDBKeyRange,
      sleep: async () => {},
    });
};

async function boot(json: Json): Promise<HTMLElement> {
  const loaded = await loadUntrustedDocument(json);
  if (!loaded.success) throw new Error(JSON.stringify(loaded.issues));
  const target = document.body.appendChild(document.createElement('div'));
  const { bootKind } = await import('../src/boot-kind.ts');
  const player: BootedPlayer = await bootKind({
    blueprint: loaded.blueprint,
    loaders: loadersFor((loaded.blueprint as { kind: 'deck' | 'page' | 'doc' }).kind),
    target,
    search: '',
    indexFactory: new IDBFactory(),
    createRuntime: runtimeFactory(),
  });
  opened.push(player);
  expect(player.error).toBeNull();
  return target;
}

/** Nothing in `root` executes: no script-capable elements, handlers or script URLs. */
function expectInert(root: HTMLElement) {
  expect(root.querySelectorAll('script, iframe, object, embed, base, meta, link').length).toBe(0);
  expect(root.querySelectorAll('img[src="x"]').length).toBe(0);
  for (const element of root.querySelectorAll('*')) {
    for (const attribute of element.attributes) {
      expect(attribute.name, element.outerHTML.slice(0, 80)).not.toMatch(/^on/i);
      if (['href', 'src', 'action', 'formaction', 'xlink:href'].includes(attribute.name)) {
        expect(attribute.value.trim().toLowerCase()).not.toMatch(
          /^(?:javascript|vbscript|data:text)/
        );
      }
    }
  }
  expect((globalThis as { __pyPwned?: unknown }).__pyPwned).toBeUndefined();
}

describe('hostile markup in multiline fields renders as inert text', () => {
  it('deck: free-slide markdown, quote, list and code, and code-with-callout source', async () => {
    const value = fixture('intro.deck.json');
    value.deck.slides = [
      {
        id: 'hostile',
        layout: 'free',
        title: 'Hostile',
        notes: `${PAYLOAD}\nNotes`,
        blocks: [
          { type: 'text', markdown: `${PAYLOAD}\n\n${LINK}` },
          { type: 'quote', quote: PAYLOAD },
          { type: 'list', items: [{ text: `${PAYLOAD} ${LINK}` }] },
          { type: 'code', lang: 'html', code: `${PAYLOAD}\n\t<a href="javascript:x">x</a>` },
        ],
      },
      {
        id: 'code',
        layout: 'code-with-callout',
        props: {
          code: { lang: 'html', source: `${PAYLOAD}\n\t<style>*{display:none}</style>` },
          bullets: ['Shown as text'],
        },
      },
    ];
    value.deck.outline = { sections: [{ id: 's', slideIds: ['hostile', 'code'] }] };
    const target = await boot(value);
    await vi.waitFor(
      () => expect(target.querySelector('[data-tx-deck-slide="code"]')).not.toBeNull(),
      {
        timeout: 15_000,
      }
    );
    await vi.waitFor(() => expect(target.textContent).toContain('globalThis.__pyPwned = 1'), {
      timeout: 15_000,
    });
    expect(target.textContent).toContain('<script>');
    expect(target.querySelectorAll('style').length).toBe(0);
    expectInert(target);
  });
});

describe('mountEmbed frames only a valid app from this origin', () => {
  const sameOrigin = () => new URL('./index.html?devtools=0', globalThis.location.href);

  it('refuses every non-app or disguised embed before any frame or connection exists', async () => {
    for (const [_, value] of [
      ['a deck', () => fixture('intro.deck.json')],
      ['a page', () => fixture('landing.page.json')],
      ['a doc', () => fixture('quarterly-report.doc.json')],
      ['an app that claims to be a deck', () => ({ ...structuredClone(demo), kind: 'deck' })],
      ['an app with an unknown kind', () => ({ ...structuredClone(demo), kind: 'Deck' })],
    ] as [string, () => unknown][]) {
      const connect = vi.fn();
      const target = document.body.appendChild(document.createElement('div'));
      const mount = createMountEmbed({ connect: connect as never, playerUrl: sameOrigin });
      await expect(mount(target, value() as Record<string, unknown>)).rejects.toThrow();
      expect(connect).not.toHaveBeenCalled();
      expect(target.querySelector('iframe')).toBeNull();
    }
  });

  it('refuses a player URL on another origin or scheme', async () => {
    for (const url of [
      'https://evil.example/index.html',
      'javascript:alert(1)',
      'data:text/html,x',
    ]) {
      const connect = vi.fn();
      const target = document.body.appendChild(document.createElement('div'));
      const mount = createMountEmbed({ connect: connect as never, playerUrl: () => new URL(url) });
      await expect(mount(target, structuredClone(demo))).rejects.toThrow(/one origin/);
      expect(connect).not.toHaveBeenCalled();
      expect(target.querySelector('iframe')).toBeNull();
    }
  });
});

// --- merged from postmessage.test.ts ---

describe('postmessage', () => {
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
  });

  describe('checkRequest (shape and size)', () => {
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
  });
});

// --- merged from security.test.ts ---

describe('security', () => {
  const DIST = join(ROOT, 'packages/player/dist/app');
  const GUARDED = ['packages/player/src', 'packages/crud/src', 'packages/blueprint/src'];

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sources(path);
      return /\.(ts|js|svelte)$/.test(name) ? [path] : [];
    });
  }

  const FORBIDDEN: [string, RegExp][] = [
    ['{@html}', /\{@html\b/],
    ['eval()', /(?<![.\w])eval\s*\(/],
    ['new Function()', /new\s+Function\s*\(/],
    ['Function()', /(?<![.\w'"`])Function\s*\(/],
    ['innerHTML/outerHTML assignment', /\.(?:inner|outer)HTML\s*=/],
    ['insertAdjacentHTML', /insertAdjacentHTML\s*\(/],
    ['document.write', /document\.write(?:ln)?\s*\(/],
    ['dynamic import of a computed specifier', /(?<![.\w])import\(\s*(?!['"`]|\))/],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the label names the pattern.
    ['dynamic import of a template with ${}', /(?<![.\w])import\(\s*`[^`]*\$\{/],
  ];

  describe('source guard', () => {
    it('player, crud and blueprint never evaluate or inject data as code or HTML', () => {
      const files = GUARDED.flatMap((dir) => sources(join(ROOT, dir)));
      expect(files.length).toBeGreaterThan(100);
      const hits: string[] = [];
      for (const file of files) {
        const text = readFileSync(file, 'utf8')
          // Comments may mention the rules they follow.
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|[^:])\/\/.*$/gm, '$1')
          .replace(/<!--[\s\S]*?-->/g, '');
        for (const [label, pattern] of FORBIDDEN) {
          if (pattern.test(text)) hits.push(`${relative(ROOT, file)}: ${label}`);
        }
      }
      expect(hits).toEqual([]);
    });
  });

  let html = '';
  let headers = '';
  beforeAll(() => {
    ensurePlayerBuild(ROOT);
    html = readFileSync(join(DIST, 'index.html'), 'utf8');
    headers = readFileSync(join(DIST, '_headers'), 'utf8');
  }, 600_000);

  function cspOf(source: string): Map<string, string[]> {
    return new Map(
      source
        .split(';')
        .map((part) => part.trim().split(/\s+/))
        .filter((parts) => parts[0])
        .map(([name, ...values]) => [name as string, values])
    );
  }

  const metaCsp = () => {
    const match = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
    if (!match) throw new Error('no CSP meta tag in the built index.html');
    return match[1] as string;
  };

  describe('built player CSP', () => {
    it('allows only same-origin scripts plus the hash of every inline script, never eval', () => {
      const csp = cspOf(metaCsp());
      const scripts = inlineScripts(html);
      expect(scripts.length).toBeGreaterThan(0);
      const hashes = scripts.map(
        (body) => `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`
      );
      expect(csp.get('script-src')).toEqual(["'self'", ...hashes]);
      expect(metaCsp()).not.toMatch(/unsafe-eval|wasm-unsafe-eval|\*|https?:/);
      expect(csp.get('default-src')).toEqual(["'self'"]);
      expect(csp.get('connect-src')).toEqual(["'self'"]);
      expect(csp.get('worker-src')).toEqual(["'self'"]);
      expect(csp.get('object-src')).toEqual(["'none'"]);
      expect(csp.get('base-uri')).toEqual(["'none'"]);
      expect(csp.get('form-action')).toEqual(["'none'"]);
      expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    });

    it('repeats the policy as a header with frame-ancestors, never *', () => {
      const line = /Content-Security-Policy: (.+)/.exec(headers)?.[1] ?? '';
      expect(line.startsWith(metaCsp())).toBe(true);
      const ancestors = cspOf(line).get('frame-ancestors');
      expect(ancestors).toEqual(PLAYER_FRAME_ANCESTORS);
      expect(ancestors).not.toContain('*');
      expect(headers).toMatch(/X-Content-Type-Options: nosniff/);
    });
  });
});
