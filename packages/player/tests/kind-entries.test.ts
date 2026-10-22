import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type AnyBlueprint,
  type DeckBlueprint,
  loadUntrustedDocument,
  parseBlueprint,
} from '@protoyard/blueprint';
import { fireEvent, screen } from '@testing-library/svelte';
import { IDBFactory } from 'fake-indexeddb';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViteManifest } from '../../cli/src/lib/bundle-analysis.ts';
import { bootKind } from '../src/boot-kind.ts';
import {
  entryUrlFor,
  KIND_ENTRY_PAGES,
  kindEntryBoot,
  runKindEntry,
} from '../src/entries/run-kind.ts';
import demo from '../src/fixtures/demo.blueprint.json';
import { kindApp } from '../src/kinds/state.ts';
import { inlineScripts, insertCspMeta, PLAYER_HTML_ENTRIES, playerCsp } from '../vite.config.ts';

/**
 * The per-kind player pages (deck.html, page.html, doc.html): a kind page
 * boots its own kind through the kind boot only, sends any other blueprint to
 * the page that runs it, and ships the same CSP as index.html. Deck Studio
 * is created only for a deck with DevTools on. The build checks need
 * `pnpm --filter @protoyard/player build` first and say so when skipped.
 */

const studioLoads = vi.hoisted(() => ({ count: 0 }));
vi.mock('@protoyard/decks-ui/studio', async (importOriginal) => {
  studioLoads.count += 1;
  return importOriginal();
});
const mounts = vi.hoisted(() => ({ options: [] as Record<string, unknown>[] }));
vi.mock('@protoyard/renderer-svelte', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@protoyard/renderer-svelte')>();
  return {
    ...actual,
    mountPrototype: vi.fn(async (options: Record<string, unknown>) => {
      mounts.options.push(options);
      return { runtime: null, error: null, destroy: vi.fn(async () => {}) };
    }),
  };
});

const PLAYER = join(import.meta.dirname, '..');
const DIST = join(PLAYER, 'dist', 'app');
const FIXTURES = join(import.meta.dirname, '../../blueprint/tests/fixtures/kinds');

async function kind(name: string): Promise<AnyBlueprint> {
  const loaded = await loadUntrustedDocument(readFileSync(join(FIXTURES, name), 'utf8'));
  if (!loaded.success) throw new Error(JSON.stringify(loaded.issues));
  return loaded.blueprint;
}
const app = parseBlueprint(demo);
const LOCATION = {
  href: 'https://player.example/play/deck.html?src=./talk.json#/',
  search: '?src=./talk.json',
  hash: '#/',
};
const fakeWindow = { location: LOCATION } as unknown as Window;
const booted = (namespace: string) => ({
  namespace,
  generatorVersion: undefined,
  runtime: null,
  error: null,
  destroy: vi.fn(async () => {}),
});

beforeEach(() => {
  mounts.options = [];
});
afterEach(() => {
  document.body.replaceChildren();
  delete document.documentElement.dataset.pyReady;
  vi.clearAllMocks();
});

describe('kind entry boot', () => {
  it('boots its own kind through the kind boot, with the extras', async () => {
    const bootKindFake = vi.fn(async () => booted('bp-deck'));
    const boot = kindEntryBoot({
      kind: 'deck',
      window: fakeWindow,
      loadBoot: async () => ({ bootKind: bootKindFake as never }),
    });
    const deck = await kind('intro.deck.json');
    const target = document.createElement('div');
    const result = await boot(deck, target, { review: true });
    expect(result.namespace).toBe('bp-deck');
    expect(bootKindFake).toHaveBeenCalledWith({ blueprint: deck, target, review: true });
  });

  it('shows a clear error with a link to index.html for an app, and never boots it (AC)', async () => {
    const load = vi.fn(async () => ({ bootKind: vi.fn() as never }));
    const boot = kindEntryBoot({ kind: 'deck', window: fakeWindow, loadBoot: load });
    const target = document.body.appendChild(document.createElement('div'));
    const shown = await boot(app, target);
    flushSync();
    expect(load).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { name: 'This blueprint is an app, not a deck' })
    ).toBeTruthy();
    expect(target.textContent).toContain(app.name);
    const link = screen.getByRole('link', { name: 'Open in the app player' });
    // Same query and hash, so `?src=` (and this tab's share link) open the app.
    expect(link.getAttribute('href')).toBe(
      'https://player.example/play/index.html?src=./talk.json#/'
    );
    expect(document.documentElement.dataset.pyReady).toBe('error');
    await shown.destroy();
    expect(target.childElementCount).toBe(0);
  });

  it('sends another content kind to its own page', async () => {
    const boot = kindEntryBoot({
      kind: 'doc',
      window: fakeWindow,
      loadBoot: vi.fn(),
    });
    const target = document.body.appendChild(document.createElement('div'));
    await boot(await kind('landing.page.json'), target);
    flushSync();
    expect(screen.getByRole('heading').textContent).toContain('a page, not a document');
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      'https://player.example/play/page.html?src=./talk.json#/'
    );
  });

  it('renders the blueprint name as text only', async () => {
    const boot = kindEntryBoot({ kind: 'page', window: fakeWindow, loadBoot: vi.fn() });
    const target = document.body.appendChild(document.createElement('div'));
    await boot({ ...app, name: '<img src=x onerror=alert(1)>' }, target);
    flushSync();
    expect(target.querySelector('img')).toBeNull();
    expect(target.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('maps every kind to its page, and keeps the page relative to the current one', () => {
    expect(KIND_ENTRY_PAGES).toEqual({
      app: 'index.html',
      deck: 'deck.html',
      page: 'page.html',
      doc: 'doc.html',
    });
    expect(
      entryUrlFor('deck', { href: 'http://127.0.0.1:4000/x/index.html', search: '', hash: '' })
    ).toBe('http://127.0.0.1:4000/x/deck.html');
  });

  it('runs the shared player loop with the kind boot and prefetches the kind chunk', async () => {
    const loadBoot = vi.fn(async () => ({ bootKind: vi.fn() as never }));
    const run = vi.fn(async () => ({ started: {} as never, embed: null, live: null }));
    const target = document.createElement('div');
    await runKindEntry({ kind: 'page', window: fakeWindow, target, run, loadBoot });
    expect(loadBoot).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ window: fakeWindow, target, boot: expect.any(Function) })
    );
  });
});

describe('Deck Studio in the kind boot', () => {
  const boot = (blueprint: AnyBlueprint, devtools: boolean) =>
    bootKind({
      blueprint,
      target: document.createElement('div'),
      search: '',
      indexFactory: new IDBFactory(),
      devtools,
    });

  it('creates no studio without DevTools', async () => {
    const before = studioLoads.count;
    const mounted = await boot(await kind('intro.deck.json'), false);
    expect(mounts.options.at(-1)).toMatchObject({ devtools: false });
    expect(mounts.options.at(-1)).not.toHaveProperty('devtoolsTabs');
    expect(kindApp().studio).toBeUndefined();
    expect(studioLoads.count).toBe(before);
    await mounted.destroy();
  });

  it('adds the Deck tab for a deck with DevTools, rooted at /deck, and renders its preview', async () => {
    const intro = (await kind('intro.deck.json')) as DeckBlueprint;
    const first = intro.deck.slides[0] as (typeof intro.deck.slides)[number];
    // Two slides, so following the hash is observable.
    const deck = { ...intro, deck: { ...intro.deck, slides: [first, { ...first, id: 'second' }] } };
    const mounted = await boot(deck, true);
    const options = mounts.options.at(-1) as { devtools: boolean; devtoolsTabs: { id: string }[] };
    expect(options.devtools).toBe(true);
    expect(options.devtoolsTabs.map((tab) => tab.id)).toEqual(['deck-studio']);
    const studio = kindApp().studio;
    expect(studio).toBeDefined();
    if (!studio) return;
    expect(studio.preview).toEqual(deck.deck);
    studio.setStyle('theme', 'emerald');
    flushSync();
    expect(studio.patch.every((op) => op.path.startsWith('/deck/'))).toBe(true);
    // The slide controls follow the deck hash until the document is torn down.
    window.location.hash = '#/second/0';
    await fireEvent(window, new HashChangeEvent('hashchange'));
    expect(studio.slideId).toBe('second');
    await mounted.destroy();
    window.location.hash = `#/${first.id}/0`;
    await fireEvent(window, new HashChangeEvent('hashchange'));
    expect(studio.slideId).toBe('second');
  });

  it('never adds the studio to pages and docs', async () => {
    for (const name of ['landing.page.json', 'quarterly-report.doc.json']) {
      const mounted = await boot(await kind(name), true);
      expect(mounts.options.at(-1)).not.toHaveProperty('devtoolsTabs');
      expect(kindApp().studio).toBeUndefined();
      await mounted.destroy();
    }
  });
});

describe('kind entry sources', () => {
  it('has one HTML page per entry, each loading its own module', () => {
    for (const name of PLAYER_HTML_ENTRIES) {
      const html = readFileSync(join(PLAYER, `${name}.html`), 'utf8');
      const module = name === 'index' ? '/src/main.ts' : `/src/entries/${name}.ts`;
      expect(html, name).toContain(`<script type="module" src="${module}"></script>`);
      expect(html, name).toContain('<div id="app"></div>');
    }
  });

  it('gives every page a CSP that hashes each of its inline scripts (AC)', () => {
    const sha = async (text: string) =>
      Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).toString(
        'base64'
      );
    return Promise.all(
      PLAYER_HTML_ENTRIES.map(async (name) => {
        const html = readFileSync(join(PLAYER, `${name}.html`), 'utf8');
        const scripts = inlineScripts(html);
        expect(scripts.length, name).toBeGreaterThan(0);
        const csp = playerCsp(await Promise.all(scripts.map(sha)));
        const out = insertCspMeta(
          html,
          `<meta http-equiv="Content-Security-Policy" content="${csp}">`
        );
        expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('<script'));
        for (const script of scripts) expect(csp).toContain(`'sha256-${await sha(script)}'`);
      })
    );
  });

  it('kind stylesheets load blocks-ui and their renderer, never the app kits', () => {
    const renderer = { deck: 'decks-ui', page: 'pages-ui', doc: 'pages-ui' };
    for (const name of ['deck', 'page', 'doc'] as const) {
      const css = readFileSync(join(PLAYER, 'src', 'entries', `${name}.css`), 'utf8');
      expect(css).toContain('@import "@protoyard/blocks-ui/styles.css";');
      expect(css).toContain(`@import "@protoyard/${renderer[name]}/styles.css";`);
      for (const kit of ['crud', 'views-ui', 'analytics-ui', 'charts-ui']) {
        expect(css, `${name}.css imports ${kit}`).not.toContain(`@protoyard/${kit}/`);
      }
    }
  });
});

/** Manifest keys reached from the entries through static imports (as in budget.test.ts). */
function initialKeys(manifest: ViteManifest): Set<string> {
  const keys = new Set<string>();
  const queue = Object.keys(manifest).filter((key) => manifest[key]?.isEntry === true);
  while (queue.length > 0) {
    const key = queue.pop() as string;
    if (keys.has(key) || !manifest[key]) continue;
    keys.add(key);
    queue.push(...(manifest[key].imports ?? []));
  }
  return keys;
}

const MANIFEST = join(DIST, '.vite', 'manifest.json');
const built = existsSync(MANIFEST);

describe.skipIf(!built)(
  'the built kind pages (after pnpm --filter @protoyard/player build)',
  () => {
    const manifest = built ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as ViteManifest) : {};
    const sha256 = async (text: string) =>
      Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).toString(
        'base64'
      );

    it('writes all four pages, each with a CSP meta covering its inline scripts (AC)', async () => {
      const headers = readFileSync(join(DIST, '_headers'), 'utf8');
      for (const name of PLAYER_HTML_ENTRIES) {
        const html = readFileSync(join(DIST, `${name}.html`), 'utf8');
        const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
        expect(meta, `${name}.html CSP meta`).not.toBeNull();
        expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<script'));
        for (const script of inlineScripts(html)) {
          const hash = `'sha256-${await sha256(script)}'`;
          expect(meta?.[1], `${name}.html`).toContain(hash);
          expect(headers, `_headers for ${name}.html`).toContain(hash);
        }
      }
    });

    it('lists every page in the one asset manifest', () => {
      const assets = JSON.parse(
        readFileSync(join(DIST, 'protoyard-player-assets.json'), 'utf8')
      ) as {
        files: { path: string }[];
      };
      const paths = assets.files.map((file) => file.path);
      for (const name of PLAYER_HTML_ENTRIES) expect(paths).toContain(`${name}.html`);
    });

    it('keeps the app boot, CRUD shell, Faker and the world worker out of a kind page', () => {
      for (const name of ['deck', 'page', 'doc']) {
        const entry = Object.keys(manifest).find((key) => key === `${name}.html`);
        expect(entry, `${name}.html in the Vite manifest`).toBeDefined();
        const only: ViteManifest = Object.fromEntries(
          Object.entries(manifest).map(([key, chunk]) => [
            key,
            { ...chunk, isEntry: key === entry },
          ])
        );
        const initial = [...initialKeys(only)];
        for (const pattern of [
          /\/player\/src\/boot\.ts$/,
          /\/crud\/src\//,
          /@faker-js\/faker/,
          /\/worker\//,
          /\/views-ui\/src\//,
          /\/analytics-ui\/src\//,
        ]) {
          expect(
            initial.filter((key) => pattern.test(key)),
            `${name}.html initial ${pattern}`
          ).toEqual([]);
        }
      }
    });
  }
);
