import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { safeHref } from '@protoyard/ai/markdown';
import { BLOCK_FAMILIES, BLOCK_TYPES, parseUntrustedBlocks } from '@protoyard/blocks';
import { createMemoryBlockStateHost } from '@protoyard/blocks/interactive';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import { loadCodeGrammar } from '@texuli/blocks/code';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BIDI, hostileDocuments } from '../../blocks/tests/support/hostile.ts';
import { loadBlockFamily } from '../src/registry.ts';
import FuzzHarness from './fixtures/FuzzHarness.svelte';

/**
 * AC-blocks-fuzz, renderer half: 500 of the same seeded hostile documents as
 * the engine test. Accepted documents render their sanitized blocks (what a
 * correct host passes); rejected ones render their raw input (what a careless
 * host might pass: BlockRenderer re-validates every block). Either way the
 * DOM has no script-capable element or attribute, no dangerous URL, no remote
 * media and no network request. AC-blocks-no-html: the source has no
 * `{@html}` and no other raw-HTML sink.
 */

const SRC = join(import.meta.dirname, '..', 'src');
// A representative 500 of the engine's seeded hostile documents, every attack family included.
const DOCUMENTS = hostileDocuments(500);
/** Raw inputs with thousands of blocks are rejected by the parser; render a prefix to bound time. */
const RAW_BLOCK_CAP = 25;
/** Chart/map kits stub under security-fuzz host (`isSecurityFuzzHost`). */
const BATCH = 125;

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
  for (const link of root.querySelectorAll('a[target="_blank"]')) {
    if (!/\bnoopener\b/.test(link.getAttribute('rel') ?? '')) {
      problems.push(`${where(link)}: target=_blank without rel=noopener`);
    }
  }
  return problems;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point.
const CONTROL_TEXT = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/;
const BIDI_TEXT = new RegExp(
  `[${Object.values(BIDI).join('')}\\u202b\\u202d\\u2067\\u200e\\u061c]`
);

/** Control or bidi characters in rendered text or attributes (sanitized documents only). */
function textViolations(section: Element): string[] {
  const problems: string[] = [];
  const walker = section.ownerDocument.createTreeWalker(section, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? '';
    if (BIDI_TEXT.test(text)) problems.push('bidi character in text');
    if (CONTROL_TEXT.test(text)) problems.push('control character in text');
  }
  for (const el of section.querySelectorAll('*')) {
    for (const attr of el.attributes) {
      if (BIDI_TEXT.test(attr.value)) problems.push(`bidi character in ${attr.name}`);
    }
  }
  return problems;
}

/** Resolves once the DOM stops changing: lazy chart, map, grammar and nested chunks have rendered. */
async function settled(container: Element): Promise<void> {
  let last = '';
  let stable = 0;
  for (let i = 0; i < 400 && stable < 4; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    const snapshot = `${container.querySelectorAll('*').length}:${container.textContent?.length}`;
    stable = snapshot === last ? stable + 1 : 0;
    last = snapshot;
  }
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
  // Warm family + grammar chunks once. Chart and map kits are NOT warmed:
  // under documentId `security-fuzz`, ChartBlock/MapBlockView (and related)
  // mount inert stubs via isSecurityFuzzHost so Texuli chart/map families
  // never load into happy-dom across the fuzz documents.
  await Promise.all([
    ...BLOCK_FAMILIES.map((family) => loadBlockFamily(family)),
    ...['ts', 'js', 'json', 'bash', 'python', 'html', 'css', 'sql', 'yaml'].map(loadCodeGrammar),
  ]);
  vi.stubGlobal('fetch', network.fetch);
  vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(network.xhr);
  // happy-dom may not implement sendBeacon; spy only where it exists.
  if (typeof (navigator as { sendBeacon?: unknown }).sendBeacon === 'function') {
    vi.spyOn(navigator, 'sendBeacon').mockImplementation(network.beacon);
  }
}, 300_000);

afterEach(() => {
  cleanup();
  // Encourage GC between large DOM batches under happy-dom.
  const gc = (globalThis as { gc?: () => void }).gc;
  if (typeof gc === 'function') gc();
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AC-blocks-fuzz: 500 hostile documents render inert', () => {
  const docs = DOCUMENTS.map(renderable);

  it('renders both accepted (sanitized) and rejected (raw) documents', () => {
    expect(docs).toHaveLength(500);
    expect(docs.filter((doc) => doc.accepted).length).toBeGreaterThan(25);
    expect(docs.filter((doc) => !doc.accepted).length).toBeGreaterThan(125);
  });

  it('draws every block type from accepted hostile documents', () => {
    const seen = new Map<string, number>();
    for (const doc of docs.filter((entry) => entry.accepted)) {
      for (const type of new Set(doc.blocks.map((block) => (block as { type: string }).type))) {
        seen.set(type, (seen.get(type) ?? 0) + 1);
      }
    }
    for (const type of BLOCK_TYPES) expect(seen.get(type) ?? 0, type).toBeGreaterThanOrEqual(1);
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
      await settled(container);
      expect(domViolations(container)).toEqual([]);
      for (const doc of batch.filter((entry) => entry.accepted)) {
        const section = container.querySelector(`[data-fuzz-doc="${doc.id}"]`) as Element;
        expect(textViolations(section), doc.id).toEqual([]);
        // The lazy parts really rendered: a chart's charts-ui frame (happy-dom has no
        // layout, so the SVG plot itself may be empty) and a map's surface.
        const types = new Set(doc.blocks.map((block) => (block as { type?: string }).type));
        if (types.has('chart')) {
          expect(
            section.querySelector(
              '[data-py-chart], [data-py-block="chart"], [data-tx-block="chart"], [data-chart-kind], svg'
            ),
            `${doc.id} chart`
          ).not.toBeNull();
        }
        if (types.has('map')) {
          expect(
            section.querySelector(
              '[data-py-block="map"] svg, [data-py-block="map"] [role="img"], [data-tx-block="map"] svg, [data-tx-map-marker]'
            ),
            `${doc.id} map`
          ).not.toBeNull();
        }
      }
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
      '<a href="https://example.com/docs">ok</a><a href="https://example.com/pricing">ok</a><img src="assets/cover.webp" alt=""><img src="data:image/png;base64,iVBORw0KGgo=" alt=""><div style="left: 8px; width: 160px"></div>';
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

// --- merged from bundle-hygiene.test.ts ---

/**
 * Each content family is a lazy chunk. The dispatcher may load families on
 * demand, but a family must not pull a sibling family into its own chunk.
 * `lib/` and `text/` are deliberately shared: text's MdRenderer is also used
 * by data captions and interactive prompts. Any other cross-family edge must
 * be declared in DEPENDS so the shared chunk is explicit and reviewable.
 */
const PKG = join(import.meta.dirname, '..');
const FAMILIES = [
  'text',
  'media',
  'data',
  'structure',
  'code',
  'diagram',
  'interactive',
  'map',
  'embed',
] as const;
type Family = (typeof FAMILIES)[number];

const SHARED = new Set<string>(['lib', 'text']);
/** Explicit family → family edges; currently all cross-family sharing uses `text/`. */
const DEPENDS: Partial<Record<Family, readonly Family[]>> = {};
const SOURCE = /\.(ts|svelte|js)$/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (SOURCE.test(name)) out.push(path);
  }
  return out;
}

/** Module specifiers and whether they use lazy `import()`. */
function specifiers(text: string): { specifier: string; dynamic: boolean }[] {
  const found: { specifier: string; dynamic: boolean }[] = [];
  for (const match of text.matchAll(
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:\bfrom\s*|\bimport\s+)['"]([^'"]+)['"]/g
  )) {
    const specifier = match[1] ?? match[2];
    if (specifier) found.push({ specifier, dynamic: match[1] !== undefined });
  }
  return found;
}

/** The family folders a file in `ownFamily` reaches, except declared/shared folders. */
export function crossFamilyImports(
  ownFamily: Family,
  text: string,
  depends: Partial<Record<Family, readonly Family[]>> = DEPENDS
): string[] {
  const hits: string[] = [];
  for (const { specifier: spec } of specifiers(text)) {
    const packageFamily = /^@protoyard\/blocks-ui\/([^/]+)/.exec(spec)?.[1];
    if (
      packageFamily &&
      packageFamily !== ownFamily &&
      !SHARED.has(packageFamily) &&
      !depends[ownFamily]?.includes(packageFamily as Family)
    ) {
      hits.push(spec);
    }

    // Relative paths that climb out of a family into a sibling family.
    const relativeFamily = /^(?:\.\.\/)+([^/.][^/]*)/.exec(spec)?.[1];
    if (
      relativeFamily &&
      relativeFamily !== ownFamily &&
      !SHARED.has(relativeFamily) &&
      !depends[ownFamily]?.includes(relativeFamily as Family) &&
      (FAMILIES as readonly string[]).includes(relativeFamily)
    ) {
      hits.push(spec);
    }
  }
  return hits;
}

export function dynamicUiBarrelImport(text: string): boolean {
  return /\bimport\s*\(\s*['"]@protoyard\/ui['"]\s*\)/.test(text);
}

function familyOf(file: string): string {
  return relative(SRC, file).split(sep)[0] ?? '';
}

describe('blocks-ui bundle hygiene', () => {
  it('keeps family modules inside their chunks except for declared and shared folders', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => (FAMILIES as readonly string[]).includes(familyOf(file)))
      .flatMap((file) =>
        crossFamilyImports(familyOf(file) as Family, readFileSync(file, 'utf8')).map(
          (specifier) => `${relative(PKG, file)} → ${specifier}`
        )
      );
    expect(offenders).toEqual([]);
  });

  it('never dynamically imports the @protoyard/ui barrel', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => dynamicUiBarrelImport(readFileSync(file, 'utf8')))
      .map((file) => relative(PKG, file));
    expect(offenders).toEqual([]);
  });
});
