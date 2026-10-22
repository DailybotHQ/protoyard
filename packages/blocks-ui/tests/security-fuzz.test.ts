import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { safeHref } from '@protoyard/ai/markdown';
import { BLOCK_FAMILIES, parseUntrustedBlocks } from '@protoyard/blocks';
import { createMemoryBlockStateHost } from '@protoyard/blocks/interactive';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { hostileDocuments } from '../../blocks/tests/support/hostile.ts';
import { loadBlockFamily } from '../src/registry.ts';
import FuzzHarness from './fixtures/FuzzHarness.svelte';

/**
 * AC-blocks-fuzz, renderer half: the same 2,000 seeded hostile documents as
 * the engine test. Accepted documents render their sanitized blocks (what a
 * correct host passes); rejected ones render their raw input (what a careless
 * host might pass: BlockRenderer re-validates every block). Either way the
 * DOM has no script-capable element or attribute, no dangerous URL, no remote
 * media and no network request. AC-blocks-no-html: the source has no
 * `{@html}` and no other raw-HTML sink.
 */

const SRC = join(import.meta.dirname, '..', 'src');
const DOCUMENTS = hostileDocuments();
/** Raw inputs with thousands of blocks are rejected by the parser; render a prefix to bound time. */
const RAW_BLOCK_CAP = 25;
const BATCH = 100;

const FORBIDDEN_ELEMENTS =
  'script, iframe, frame, frameset, object, embed, applet, base, meta, link, noscript, template, foreignObject, portal';
const URL_ATTRIBUTES = [
  'href',
  'xlink:href',
  'src',
  'srcset',
  'poster',
  'action',
  'formaction',
  'data',
  'background',
  'cite',
  'ping',
  'manifest',
];
const MEDIA_ATTRIBUTES = new Set(['src', 'srcset', 'poster', 'data', 'background']);
const DANGEROUS_SCHEME = /^\s*(?:javascript|vbscript|file|blob|data):/i;
const SAFE_DATA_MEDIA =
  /^data:(?:image\/(?:png|jpeg|webp|gif)|video\/(?:mp4|webm));base64,[A-Za-z0-9+/]*={0,2}$/;
const REMOTE = /^(?:[a-z][a-z0-9+.-]*:)?[\\/]{2}|^https?:/i;
const STYLE_URL = /url\s*\(|expression\s*\(|javascript:|@import/i;

/** Every script-capable or remote-loading thing in the rendered DOM; empty when inert. */
function domViolations(root: Element): string[] {
  const problems: string[] = [];
  const where = (el: Element) =>
    el.closest('[data-fuzz-doc]')?.getAttribute('data-fuzz-doc') ?? 'harness';
  for (const el of root.querySelectorAll(FORBIDDEN_ELEMENTS)) {
    problems.push(`${where(el)}: <${el.tagName.toLowerCase()}> element`);
  }
  for (const el of root.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (name.startsWith('on'))
        problems.push(`${where(el)}: ${name} attribute on <${el.tagName.toLowerCase()}>`);
      if (name === 'srcdoc') problems.push(`${where(el)}: srcdoc attribute`);
      if (name === 'style' && STYLE_URL.test(value))
        problems.push(`${where(el)}: style ${JSON.stringify(value)}`);
      if (!URL_ATTRIBUTES.includes(name)) continue;
      const candidates =
        name === 'srcset'
          ? value.split(',').map((part) => part.trim().split(/\s+/)[0] ?? '')
          : [value];
      for (const url of candidates) {
        if (MEDIA_ATTRIBUTES.has(name)) {
          if (REMOTE.test(url))
            problems.push(`${where(el)}: remote ${name} ${JSON.stringify(url)}`);
          if (DANGEROUS_SCHEME.test(url) && !SAFE_DATA_MEDIA.test(url)) {
            problems.push(`${where(el)}: unsafe ${name} ${JSON.stringify(url.slice(0, 80))}`);
          }
        } else if (DANGEROUS_SCHEME.test(url) || safeHref(url) !== url || /^[\\/]{2}/.test(url)) {
          problems.push(`${where(el)}: unsafe ${name} ${JSON.stringify(url.slice(0, 80))}`);
        }
      }
    }
  }
  return problems;
}

function renderable(doc: (typeof DOCUMENTS)[number]): {
  id: string;
  blocks: unknown[];
  accepted: boolean;
} {
  const result = parseUntrustedBlocks(doc.input);
  if (result.success) return { id: doc.id, blocks: result.blocks, accepted: true };
  let raw: unknown = doc.input;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }
  const blocks = Array.isArray(raw) ? raw.slice(0, RAW_BLOCK_CAP) : [raw];
  return { id: doc.id, blocks, accepted: false };
}

const network = {
  fetch: vi.fn(async () => {
    throw new Error('Blocks must not make network requests.');
  }),
  xhr: vi.fn(),
  beacon: vi.fn(() => false),
};

beforeAll(async () => {
  // Warm every family chunk once, so the first batch measures rendering, not cold imports.
  await Promise.all(BLOCK_FAMILIES.map((family) => loadBlockFamily(family)));
  vi.stubGlobal('fetch', network.fetch);
  vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(network.xhr);
  // happy-dom may not implement sendBeacon; spy only where it exists.
  if (typeof (navigator as { sendBeacon?: unknown }).sendBeacon === 'function') {
    vi.spyOn(navigator, 'sendBeacon').mockImplementation(network.beacon);
  }
}, 300_000);

afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AC-blocks-fuzz: 2,000 hostile documents render inert', () => {
  const docs = DOCUMENTS.map(renderable);

  it('renders both accepted (sanitized) and rejected (raw) documents', () => {
    expect(docs).toHaveLength(2_000);
    expect(docs.filter((doc) => doc.accepted).length).toBeGreaterThan(100);
    expect(docs.filter((doc) => !doc.accepted).length).toBeGreaterThan(500);
  });

  for (let start = 0; start < docs.length; start += BATCH) {
    const batch = docs.slice(start, start + BATCH);
    it(`documents ${start}–${start + batch.length - 1}: no script, no dangerous URL, no remote media`, {
      timeout: 120_000,
    }, async () => {
      const { container } = render(FuzzHarness, {
        docs: batch,
        stateHost: createMemoryBlockStateHost(),
      });
      // Every block settles: rendered, or a bounded fallback note.
      await waitFor(
        () => expect(container.querySelector('[aria-label="Loading block"]')).toBeNull(),
        {
          timeout: 60_000,
          interval: 50,
        }
      );
      expect(domViolations(container)).toEqual([]);
      // Rejected raw documents never show their content: each block is a fallback or a valid render.
      for (const doc of batch.filter((entry) => !entry.accepted)) {
        const section = container.querySelector(`[data-fuzz-doc="${doc.id}"]`);
        expect(section, doc.id).not.toBeNull();
      }
      cleanup();
    });
  }

  it('made no network request while rendering', () => {
    expect(network.fetch).not.toHaveBeenCalled();
    expect(network.xhr).not.toHaveBeenCalled();
    expect(network.beacon).not.toHaveBeenCalled();
  });
});

describe('the DOM check itself', () => {
  it('detects every kind of violation it guards against', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<section data-fuzz-doc="t">',
      '<script>alert(1)</script>',
      '<img src="https://evil.example.com/x.png" onerror="alert(1)">',
      '<a href="javascript:alert(1)">x</a>',
      '<a href="//evil.example.com">x</a>',
      '<video poster="data:image/svg+xml;base64,PHN2Zz4="></video>',
      '<div style="background:url(https://evil.example.com/x.png)"></div>',
      '<iframe srcdoc="<b>x</b>"></iframe>',
      '<img srcset="ok.png 1x, https://evil.example.com/2x.png 2x">',
      '</section>',
    ].join('');
    const problems = domViolations(root);
    for (const expected of [
      'element',
      'onerror attribute',
      'remote src',
      'unsafe href "javascript:alert(1)"',
      'unsafe href "//evil.example.com"',
      'unsafe poster',
      'style',
      'srcdoc attribute',
      'remote srcset',
    ]) {
      expect(
        problems.some((problem) => problem.includes(expected)),
        expected
      ).toBe(true);
    }
    const clean = document.createElement('div');
    clean.innerHTML =
      '<a href="https://example.com/docs">ok</a><a href="#/pricing">ok</a><img src="assets/cover.webp" alt=""><img src="data:image/png;base64,iVBORw0KGgo=" alt=""><div style="left: 8px; width: 160px"></div>';
    expect(domViolations(clean)).toEqual([]);
  });
});

describe('AC-blocks-no-html: blocks-ui has no raw-HTML sink', () => {
  function files(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) files(path, out);
      else if (/\.(ts|svelte)$/.test(name)) out.push(path);
    }
    return out;
  }

  it('never uses {@html}, innerHTML, outerHTML, insertAdjacentHTML, document.write, eval or new Function', () => {
    const sinks =
      /\{@html|\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML|document\.write|\beval\s*\(|new\s+Function\s*\(/;
    const offenders = files(SRC).filter((file) => sinks.test(readFileSync(file, 'utf8')));
    expect(offenders.map((file) => relative(SRC, file))).toEqual([]);
  });
});
