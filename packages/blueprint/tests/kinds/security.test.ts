// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDeckLayout } from '@protoyard/decks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decodeDocumentShare,
  encodeBlueprintShare,
  loadUntrustedDocument,
  type UntrustedDocumentResult,
} from '../../src/index.ts';
import { kindBodySchema } from '../../src/kinds/bodies.ts';

/**
 * The threat model for content kinds (ADR-036, docs/SECURITY.md "Kinds"),
 * asserted end to end through `loadUntrustedDocument`, the one gate every
 * player source passes:
 *
 * 1. an `embed-app` block holds one app: never a deck, page or doc, never an
 *    app that embeds again, wherever the block sits (containers included);
 * 2. URL fields (block and layout media, links, CTAs) refuse `javascript:`,
 *    `data:text/html`, SVG, `blob:`, protocol-relative and other schemes,
 *    and media never loads from a remote host;
 * 3. multiline strings come back as the same inert text (only controls and
 *    bidi overrides go), and code keeps its newlines and tabs byte for byte;
 * 4. oversize, too-deep or over-cap input fails before the kind body schemas
 *    load (`kindBodySchema` is the lazy door to them).
 */

vi.mock('../../src/kinds/bodies.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/kinds/bodies.ts')>();
  return { ...actual, kindBodySchema: vi.fn(actual.kindBodySchema) };
});

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
// biome-ignore lint/suspicious/noExplicitAny: fixtures are edited freely in tests.
type Json = Record<string, any>;
const fixture = (name: string): Json =>
  JSON.parse(readFileSync(join(ROOT, 'packages/blueprint/tests/fixtures/kinds', name), 'utf8'));
const app = (): Json => JSON.parse(readFileSync(join(ROOT, 'blueprints/crm.json'), 'utf8'));

/** The intro deck plus one free slide holding `blocks`. */
function deckWith(blocks: unknown[]): Json {
  const value = fixture('intro.deck.json');
  value.deck.slides.push({ id: 'free-one', layout: 'free', title: 'Free', blocks });
  value.deck.outline.sections[0].slideIds.push('free-one');
  return value;
}

/** The intro deck plus one catalog-layout slide with `props`. */
function deckWithLayout(layout: string, props: unknown): Json {
  const value = fixture('intro.deck.json');
  value.deck.slides.push({ id: 'layout-one', layout, props });
  value.deck.outline.sections[0].slideIds.push('layout-one');
  return value;
}

/** The landing page with `blocks` in a new last section. */
function pageWith(blocks: unknown[]): Json {
  const value = fixture('landing.page.json');
  value.page.sections.push({ id: 'extra', blocks });
  return value;
}

/** The quarterly report with `blocks` appended. */
function docWith(blocks: unknown[]): Json {
  const value = fixture('quarterly-report.doc.json');
  value.doc.blocks.push(...blocks);
  return value;
}

const sample = (layout: string): Json =>
  structuredClone(getDeckLayout(layout)?.sample ?? {}) as Json;

const embed = (blueprint: unknown) => ({
  type: 'embed-app',
  id: 'embedded',
  title: 'Embedded app',
  app: blueprint,
});

function expectRefused(result: UntrustedDocumentResult, code?: string, path?: (string | number)[]) {
  expect(result.success, 'hostile input loaded').toBe(false);
  if (code) expect(result.issues[0]?.code, JSON.stringify(result.issues)).toBe(code);
  if (path) expect(result.issues[0]?.path.slice(0, path.length)).toEqual(path);
}

function expectLoaded(result: UntrustedDocumentResult) {
  expect(result.success, JSON.stringify(result.issues)).toBe(true);
}

const bodySchemaLoads = vi.mocked(kindBodySchema);
beforeEach(() => bodySchemaLoads.mockClear());

describe('embedded apps cannot recurse or smuggle a deck', () => {
  const contents: [string, Json][] = [
    ['deck', fixture('intro.deck.json')],
    ['page', fixture('landing.page.json')],
    ['doc', fixture('quarterly-report.doc.json')],
  ];

  it.each(contents)(
    'refuses a %s as the embedded app, before the body schema loads',
    async (_, inner) => {
      const result = await loadUntrustedDocument(deckWith([embed(inner)]));
      expectRefused(result, 'invalid-blueprint', ['deck', 'slides', 1, 'blocks', 0, 'app', 'kind']);
      expect(bodySchemaLoads).not.toHaveBeenCalled();
    }
  );

  it('refuses a kind spelled to slip past detection', async () => {
    for (const kind of ['Deck', ' deck', 'deck\u0000', 'DECK', 'app ', 'slides']) {
      const inner = { ...fixture('intro.deck.json'), kind };
      expectRefused(await loadUntrustedDocument(deckWith([embed(inner)])));
    }
  });

  it('never carries a deck body inside an app that says it is an app', async () => {
    const smuggled = { ...app(), kind: 'app', deck: fixture('intro.deck.json').deck };
    const result = await loadUntrustedDocument(pageWith([embed(smuggled)]));
    if (result.success) {
      // The app schema may drop unknown keys; the deck must not survive either way.
      expect(JSON.stringify(result.blueprint)).not.toContain('"slides"');
    } else {
      expect(result.issues[0]?.path[0]).toBe('page');
    }
  });

  it('refuses an app that holds an embed-app block anywhere (one level only)', async () => {
    const nested = app();
    nested.entities[0].description = embed(app()) as never;
    const result = await loadUntrustedDocument(docWith([embed(nested)]));
    expectRefused(result, 'too-deep');
    expect(bodySchemaLoads).not.toHaveBeenCalled();

    const deep = app();
    deep.meta = { a: [{ b: { type: 'embed-app', app: {} } }] };
    expectRefused(await loadUntrustedDocument(docWith([embed(deep)])), 'too-deep');
  });

  it('finds embed-app blocks inside columns, tabs and reveal containers', async () => {
    const inner = fixture('intro.deck.json');
    const containers = [
      { type: 'columns', columns: [[embed(inner)], [{ type: 'heading', text: 'Side' }]] },
      {
        type: 'tabs',
        panels: [{ id: 'one', label: 'One', blocks: [embed(inner)] }],
      },
      { type: 'reveal', label: 'More', blocks: [embed(inner)] },
    ];
    for (const container of containers) {
      const result = await loadUntrustedDocument(deckWith([container]));
      expectRefused(result);
      expect(result.issues[0]?.path, container.type).toContain('app');
    }
  });

  it('caps embedded apps per document and checks each with the app caps', async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ ...embed(app()), id: `app-${i}` }));
    expectRefused(await loadUntrustedDocument(docWith(many)), 'too-many');
    const huge = app();
    huge.entities[0].seedCount = { small: 1, default: 1, massive: 10_000_000 };
    const result = await loadUntrustedDocument(docWith([embed(huge)]));
    expectRefused(result);
    const index = fixture('quarterly-report.doc.json').doc.blocks.length;
    expect(result.issues[0]?.path.slice(0, 4)).toEqual(['doc', 'blocks', index, 'app']);
  });

  it('accepts one plain app, so the refusals above are about the hostile parts', async () => {
    expectLoaded(await loadUntrustedDocument(docWith([embed(app())])));
  });
});

/** Values no URL field may hold (tabs and controls are stripped before the schema runs). */
const HOSTILE_URLS = [
  'javascript:alert(1)',
  'JavaScript:alert(1)',
  ' javascript:alert(1)',
  'java\tscript:alert(1)',
  'java\u0000script:alert(1)',
  'javascript\u202e:alert(1)',
  'vbscript:msgbox(1)',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  'data:text/html,<script>alert(1)</script>',
  'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIi8+',
  'data:application/javascript;base64,YWxlcnQoMSk=',
  'blob:https://protoyard.app/0b8c1d0e-0000-4000-8000-000000000000',
  'file:///etc/passwd',
  '//evil.example/x.png',
  '\\\\evil.example\\x.png',
  '/\\evil.example/x.png',
];
/** Media fields add remote hosts: a document never loads media from the network. */
const HOSTILE_MEDIA = [
  ...HOSTILE_URLS,
  'https://evil.example/x.png',
  'http://evil.example/x.png',
  '../outside.png',
  'assets/../../outside.png',
];
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX2Gk9wAAAABJRU5ErkJggg==';

/** Each URL field of each kind: a builder from the value to a whole document. */
const MEDIA_FIELDS: [string, (src: string) => Json][] = [
  [
    'image block src (deck)',
    (src) => deckWith([{ type: 'image', src, alt: 'Picture', width: 10, height: 10 }]),
  ],
  [
    'video block src (page)',
    (src) => pageWith([{ type: 'video', src, label: 'Clip', width: 10, height: 10 }]),
  ],
  [
    'video block poster (doc)',
    (src) =>
      docWith([
        {
          type: 'video',
          src: 'data:video/mp4;base64,AAAA',
          poster: src,
          label: 'Clip',
          width: 10,
          height: 10,
        },
      ]),
  ],
  [
    'card image (page)',
    (src) => pageWith([{ type: 'cards', items: [{ title: 'Card', image: src, imageAlt: 'Alt' }] }]),
  ],
  [
    'image-left layout image',
    (src) =>
      deckWithLayout('image-left', {
        ...sample('image-left'),
        image: { ...sample('image-left').image, src },
      }),
  ],
  [
    'video-centered layout video',
    (src) =>
      deckWithLayout('video-centered', {
        ...sample('video-centered'),
        video: { ...sample('video-centered').video, src },
      }),
  ],
];

const LINK_FIELDS: [string, (href: string) => Json][] = [
  [
    'cta action href (page)',
    (href) => pageWith([{ type: 'cta', actions: [{ label: 'Go', href }] }]),
  ],
  ['card href (doc)', (href) => docWith([{ type: 'cards', items: [{ title: 'Card', href }] }])],
  [
    'closing-cta layout href',
    (href) =>
      deckWithLayout('closing-cta', {
        ...sample('closing-cta'),
        cta: { ...sample('closing-cta').cta, href },
      }),
  ],
];

describe('URL fields accept only safe schemes', () => {
  it.each(MEDIA_FIELDS)('%s refuses hostile and remote sources', async (_, build) => {
    for (const src of HOSTILE_MEDIA) {
      const result = await loadUntrustedDocument(build(src));
      expect(result.success, `${JSON.stringify(src)} loaded`).toBe(false);
    }
  });

  it.each(MEDIA_FIELDS)('%s accepts an embedded raster image or clip', async (name, build) => {
    const src =
      name.includes('video') && !name.includes('poster') ? 'data:video/mp4;base64,AAAA' : PNG;
    expectLoaded(await loadUntrustedDocument(build(src)));
  });

  it('accepts the other documented media forms: avatars and relative paths', async () => {
    for (const src of ['avatar:av-007', 'assets/cover.webp', './img/a.png']) {
      const result = await loadUntrustedDocument(MEDIA_FIELDS[0]?.[1](src) ?? {});
      expect(result.success, `${src}: ${JSON.stringify(result.issues)}`).toBe(true);
    }
  });

  it.each(LINK_FIELDS)('%s refuses hostile links', async (_, build) => {
    for (const href of HOSTILE_URLS) {
      const result = await loadUntrustedDocument(build(href));
      expect(result.success, `${JSON.stringify(href)} loaded`).toBe(false);
    }
  });

  it.each(LINK_FIELDS)('%s accepts https and relative links', async (_, build) => {
    for (const href of [
      'https://example.com/docs',
      'http://example.com/docs',
      'mailto:team@example.com',
      'guide/start.html',
    ]) {
      expectLoaded(await loadUntrustedDocument(build(href)));
    }
  });

  it('treats an entity-encoded scheme as the relative path it is', async () => {
    // Renderers set href as a DOM attribute, which never decodes entities, so
    // this resolves to a relative path plus a fragment on the player's origin.
    const href = 'jav&#x61;script:alert(1)';
    expect(new URL(href, 'https://protoyard.app/play/').protocol).toBe('https:');
    const result = await loadUntrustedDocument(LINK_FIELDS[0]?.[1](href) ?? {});
    if (result.success) {
      expect(JSON.stringify(result.blueprint)).toContain(JSON.stringify(href).slice(1, -1));
    }
  });

  it('refuses hostile URLs that arrive through a share link too', async () => {
    const hostile = pageWith([
      { type: 'cta', actions: [{ label: 'Go', href: 'javascript:alert(1)' }] },
    ]);
    // The encoder does not validate: the link carries the hostile document as is.
    const share = await encodeBlueprintShare(hostile as never);
    const decoded = await decodeDocumentShare(share);
    expect(decoded.success).toBe(false);
  });
});

describe('multiline strings stay inert text', () => {
  const HTML = '<script>alert(1)</script><img src=x onerror="alert(2)">{@html x}';

  it('returns markup in markdown, notes, quotes and list items unchanged, as text', async () => {
    const value = deckWith([
      { type: 'text', markdown: `${HTML}\n[click](javascript:alert(3))` },
      { type: 'quote', quote: `${HTML}\nline two` },
      { type: 'list', items: [{ text: `${HTML}\nnext` }] },
    ]);
    value.deck.slides[1].notes = `${HTML}\nNotes\u202e line\u2066`;
    const result = await loadUntrustedDocument(value);
    expectLoaded(result);
    if (!result.success) return;
    const slide = (result.blueprint as Json).deck.slides[1];
    expect(slide.blocks[0].markdown).toBe(`${HTML}\n[click](javascript:alert(3))`);
    expect(slide.blocks[1].quote).toBe(`${HTML}\nline two`);
    expect(slide.blocks[2].items[0].text).toBe(`${HTML}\nnext`);
    expect(slide.notes).toBe(`${HTML}\nNotes line`);
  });

  it('keeps code-with-callout source byte for byte (newlines, tabs, markup)', async () => {
    const source = `type Status =\n\t| 'new'\n\t| 'done';\n\nconst tag = '${HTML}';\n`;
    const props = {
      ...sample('code-with-callout'),
      code: { lang: 'ts', source, highlights: ['1'] },
    };
    const result = await loadUntrustedDocument(deckWithLayout('code-with-callout', props));
    expectLoaded(result);
    if (!result.success) return;
    const loaded = (result.blueprint as Json).deck.slides[1].props.code.source;
    expect(loaded).toBe(source);
    expect(Buffer.from(loaded, 'utf8').equals(Buffer.from(source, 'utf8'))).toBe(true);
  });

  it('round-trips code-with-callout source through a share link unchanged', async () => {
    const source = 'if (a) {\n\treturn b;\n}\n';
    const props = { ...sample('code-with-callout'), code: { lang: 'ts', source } };
    const loaded = await loadUntrustedDocument(deckWithLayout('code-with-callout', props));
    expectLoaded(loaded);
    if (!loaded.success) return;
    const share = await encodeBlueprintShare(loaded.blueprint as never);
    const decoded = await decodeDocumentShare(share);
    expect(decoded.success, JSON.stringify(decoded.issues)).toBe(true);
    if (!decoded.success) return;
    expect((decoded.blueprint as Json).deck.slides[1].props.code.source).toBe(source);
  });

  it('still strips bidi overrides from code, and keeps one-line fields on one line', async () => {
    const props = {
      ...sample('code-with-callout'),
      title: 'Code\nsample',
      code: { lang: 'ts', source: 'const a\u202e = 1;\n\tconst b = 2;' },
    };
    const result = await loadUntrustedDocument(deckWithLayout('code-with-callout', props));
    expectLoaded(result);
    if (!result.success) return;
    const slideProps = (result.blueprint as Json).deck.slides[1].props;
    expect(slideProps.code.source).toBe('const a = 1;\n\tconst b = 2;');
    expect(slideProps.title).toBe('Codesample');

    // A big stat's `source` is a caption, not code: it stays one line.
    const stat = { ...sample('big-stat'), source: 'n =\n412' };
    const statResult = await loadUntrustedDocument(deckWithLayout('big-stat', stat));
    expectLoaded(statResult);
    if (!statResult.success) return;
    expect((statResult.blueprint as Json).deck.slides[1].props.source).toBe('n =412');
  });
});

describe('oversize input fails before any kind schema loads', () => {
  it('refuses a document over 1 MiB as text and as an object', async () => {
    const big = docWith([{ type: 'text', markdown: 'x'.repeat(1024 * 1024) }]);
    expectRefused(await loadUntrustedDocument(JSON.stringify(big)), 'too-large');
    expectRefused(await loadUntrustedDocument(big), 'too-large');
    expect(bodySchemaLoads).not.toHaveBeenCalled();
  });

  it('refuses nesting past the depth cap before parsing the body', async () => {
    const deep = deckWith([]);
    let node: Json = deep.deck.slides[1];
    for (let i = 0; i < 40; i += 1) {
      node.blocks = [{ type: 'reveal', label: 'More', blocks: [] }];
      node = node.blocks[0];
    }
    expectRefused(await loadUntrustedDocument(JSON.stringify(deep)), 'too-deep');
    expectRefused(await loadUntrustedDocument(deep), 'too-deep');
    expect(bodySchemaLoads).not.toHaveBeenCalled();
  });

  it('refuses too many slides, blocks and chart points before the body schema', async () => {
    const slides = fixture('intro.deck.json');
    for (let i = 0; i < 201; i += 1) {
      slides.deck.slides.push({ id: `s-${i}`, layout: 'free', blocks: [] });
    }
    expectRefused(await loadUntrustedDocument(slides), 'too-many');

    const blocks = docWith(Array.from({ length: 2_001 }, () => ({ type: 'divider' })));
    expectRefused(await loadUntrustedDocument(blocks), 'too-many');

    const labels = Array.from({ length: 366 }, (_, i) => `L${i}`);
    const chart = {
      type: 'chart',
      spec: {
        kind: 'line',
        title: 'Trend',
        labels,
        series: Array.from({ length: 8 }, (_, s) => ({
          label: `S${s}`,
          values: labels.map(() => 1),
        })),
      },
    };
    expectRefused(await loadUntrustedDocument(docWith(Array(9).fill(chart))), 'too-many');
    expect(bodySchemaLoads).not.toHaveBeenCalled();
  });

  it('loads the body schema only for input that passed every cheap check', async () => {
    expectLoaded(await loadUntrustedDocument(fixture('intro.deck.json')));
    expect(bodySchemaLoads).toHaveBeenCalledWith('deck');
  });
});
