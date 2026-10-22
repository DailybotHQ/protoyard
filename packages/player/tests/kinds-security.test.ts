import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  type AnyBlueprint,
  encodeBlueprintShare,
  loadUntrustedDocument,
} from '@protoyard/blueprint';
import type { PrototypeDefinition } from '@protoyard/core';
import { createPrototypeRuntime } from '@protoyard/runtime';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BootedPlayer } from '../src/boot.ts';
import { kindEntryBoot } from '../src/entries/run-kind.ts';
import demo from '../src/fixtures/demo.blueprint.json';
import { createMountEmbed } from '../src/kinds/mount-embed.ts';
import { startPlayer } from '../src/sources/start.ts';
import { PLAYER_HTML_ENTRIES } from '../vite.config.ts';

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
const PLAYER = join(ROOT, 'packages/player');
const DIST = join(PLAYER, 'dist/app');
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
    boot: kindEntryBoot({ kind: 'deck', window, loadBoot }),
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
    ['document.write', /document\.write(?:ln)?\s*\(/],
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
      () => expect(target.querySelector('[data-py-deck-slide="code"]')).not.toBeNull(),
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

  it('page: markdown sections and CTA text', async () => {
    const value = fixture('landing.page.json');
    value.page.sections.push({
      id: 'hostile',
      blocks: [
        { type: 'text', markdown: `${PAYLOAD}\n\n${LINK}` },
        {
          type: 'cta',
          title: 'Act',
          body: PAYLOAD,
          actions: [{ label: 'Docs', href: 'https://example.com/docs' }],
        },
      ],
    });
    const target = await boot(value);
    await vi.waitFor(
      () => expect(target.querySelector('[data-py-page-section="hostile"]')).not.toBeNull(),
      {
        timeout: 15_000,
      }
    );
    await vi.waitFor(() => expect(target.textContent).toContain('globalThis.__pyPwned = 1'), {
      timeout: 15_000,
    });
    expectInert(target);
  });

  it('doc: markdown and code blocks', async () => {
    const value = fixture('quarterly-report.doc.json');
    value.doc.blocks.push(
      { type: 'text', markdown: `${PAYLOAD}\n\n${LINK}` },
      { type: 'code', lang: 'html', code: PAYLOAD }
    );
    const target = await boot(value);
    await vi.waitFor(() => expect(target.textContent).toContain('globalThis.__pyPwned = 1'), {
      timeout: 15_000,
    });
    expectInert(target);
  });
});

describe('the checks above can fail', () => {
  it('recorded the renderer modules once the hostile documents rendered', () => {
    expect(loads.renderers).toEqual(
      expect.arrayContaining(['blocks-ui', 'decks-ui/app', 'pages-ui/page', 'pages-ui/doc'])
    );
  });

  it('the inert check catches a handler, a script URL and a script element', () => {
    for (const plant of [
      (root: HTMLElement) =>
        root.appendChild(document.createElement('img')).setAttribute('onerror', 'x()'),
      (root: HTMLElement) =>
        root.appendChild(document.createElement('a')).setAttribute('href', ' JavaScript:x()'),
      (root: HTMLElement) => root.appendChild(document.createElement('script')),
    ]) {
      const root = document.createElement('div');
      plant(root);
      expect(() => expectInert(root)).toThrow();
    }
  });
});

describe('mountEmbed frames only a valid app from this origin', () => {
  const sameOrigin = () => new URL('./index.html?devtools=0', globalThis.location.href);

  it.each([
    ['a deck', () => fixture('intro.deck.json')],
    ['a page', () => fixture('landing.page.json')],
    ['a doc', () => fixture('quarterly-report.doc.json')],
    ['an app that claims to be a deck', () => ({ ...structuredClone(demo), kind: 'deck' })],
    ['an app with an unknown kind', () => ({ ...structuredClone(demo), kind: 'Deck' })],
  ])('refuses %s before any frame or connection exists', async (_, value) => {
    const connect = vi.fn();
    const target = document.body.appendChild(document.createElement('div'));
    const mount = createMountEmbed({ connect: connect as never, playerUrl: sameOrigin });
    await expect(mount(target, value() as Record<string, unknown>)).rejects.toThrow();
    expect(connect).not.toHaveBeenCalled();
    expect(target.querySelector('iframe')).toBeNull();
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

  it('frames a valid app on this origin and sends the sanitized blueprint', async () => {
    const load = vi.fn(async () => {});
    const connect = vi.fn(() => ({ ready: Promise.resolve(), load, close: vi.fn() }));
    const target = document.body.appendChild(document.createElement('div'));
    const mount = createMountEmbed({ connect: connect as never, playerUrl: sameOrigin });
    const hostile = structuredClone(demo) as Json;
    hostile.name = `Demo‮ app`;
    const unmount = await mount(target, hostile);
    const frame = target.querySelector('iframe');
    expect(frame?.getAttribute('src')).toBe(sameOrigin().href);
    expect(frame?.hasAttribute('srcdoc')).toBe(false);
    expect((load.mock.calls[0] as unknown[] | undefined)?.[0]).toMatchObject({ name: 'Demo app' });
    expect(typeof unmount).toBe('function');
    if (typeof unmount === 'function') unmount();
    expect(target.querySelector('iframe')).toBeNull();
  });
});

/** Directive name → sources, in order. */
function cspOf(policy: string): Map<string, string[]> {
  return new Map(
    policy
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name, ...values]) => [name as string, values])
  );
}

describe('built kind pages: CSP no looser than index.html', () => {
  const pages: Record<string, string> = {};
  beforeAll(() => {
    if (!PLAYER_HTML_ENTRIES.every((name) => existsSync(join(DIST, `${name}.html`)))) {
      // A production build: Vitest's NODE_ENV=test would bundle Svelte's dev
      // build and leave a larger dist behind for budget.test.ts.
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) => key !== 'NODE_ENV' && !key.startsWith('VITEST')
        )
      );
      const run = spawnSync('pnpm', ['--filter', '@protoyard/player', 'build'], {
        cwd: ROOT,
        encoding: 'utf8',
        env,
      });
      if (run.status !== 0) throw new Error(`player build failed:\n${run.stderr}${run.stdout}`);
    }
    for (const name of PLAYER_HTML_ENTRIES) {
      pages[name] = readFileSync(join(DIST, `${name}.html`), 'utf8');
    }
  }, 600_000);

  const meta = (html: string) => {
    const match = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
    if (!match) throw new Error('no CSP meta tag');
    return cspOf(match[1] as string);
  };

  it.each(['deck', 'page', 'doc'])('%s.html has every index.html directive, none wider', (name) => {
    const index = meta(pages.index as string);
    const kind = meta(pages[name] as string);
    expect([...kind.keys()].sort()).toEqual([...index.keys()].sort());
    for (const [directive, sources] of index) {
      if (directive === 'script-src') continue;
      expect(kind.get(directive), `${name}.html ${directive}`).toEqual(sources);
    }
    // Scripts: this origin plus the hashes of this page's own inline scripts, nothing more.
    const scripts = kind.get('script-src') ?? [];
    expect(scripts[0]).toBe("'self'");
    for (const source of scripts.slice(1)) expect(source).toMatch(/^'sha256-[A-Za-z0-9+/]+=*'$/);
    expect(scripts.length).toBeLessThanOrEqual((index.get('script-src') ?? []).length);
    const html = pages[name] as string;
    expect(html).not.toMatch(
      /unsafe-eval|unsafe-hashes|strict-dynamic|\*|https?:\/\/(?!www\.w3\.org)/
    );
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it('serves one _headers policy that covers every page and keeps frame-ancestors', () => {
    const headers = readFileSync(join(DIST, '_headers'), 'utf8');
    const policy = cspOf(/Content-Security-Policy: (.+)/.exec(headers)?.[1] ?? '');
    const index = meta(pages.index as string);
    for (const [directive, sources] of index) {
      if (directive === 'script-src') continue;
      expect(policy.get(directive), directive).toEqual(sources);
    }
    expect(policy.get('frame-ancestors')).not.toContain('*');
    for (const name of ['deck', 'page', 'doc']) {
      for (const source of meta(pages[name] as string).get('script-src') ?? []) {
        expect(policy.get('script-src'), `${name}.html ${source}`).toContain(source);
      }
    }
  });
});
