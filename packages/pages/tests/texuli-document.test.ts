// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DocumentBlock, TexuliDocument } from '@texuli/document/model';
import { validateDocument } from '@texuli/document/schema';
import { describe, expect, it } from 'vitest';
import { loadOnePagerDocFixture } from '../fixtures/index.ts';
import { DOC_CAPABILITIES } from '../src/doc-capabilities.ts';
import { type DocDocument, DocDocumentSchema } from '../src/schema.ts';
import {
  docToTexuliDocument,
  HOST_BLOCK_REF_PREFIX,
  hostBlockTitle,
  texuliDocumentToDoc,
} from '../src/texuli-document.ts';

const ROOT = resolve(import.meta.dirname, '../../..');

function loadDoc(path: string): DocDocument {
  const json = JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')) as { doc?: unknown };
  return DocDocumentSchema.parse(json.doc ?? json);
}

const REAL_DOCS = [
  'templates/doc/blueprint.json',
  'blueprints/docs/northwind-quarterly-report.json',
  'packages/pages/fixtures/one-pager-doc.json',
] as const;

const sample: DocDocument = {
  id: 'sample-doc',
  title: 'Sample report',
  description: 'Fictional report for conversion tests.',
  blocks: [
    {
      type: 'heading',
      id: 'title',
      level: 1,
      text: 'Sample report',
      eyebrow: 'Quarterly',
      subtitle: 'What changed this quarter.',
    },
    { type: 'text', id: 'intro', markdown: 'First paragraph with **bold**.\n\nSecond paragraph.' },
    { type: 'heading', id: 'numbers', level: 2, text: 'Numbers' },
    {
      type: 'stat',
      id: 'kpis',
      items: [
        { value: '87%', label: 'Resolved', delta: '+4 pts' },
        { value: '1,240', label: 'Tickets' },
      ],
    },
    {
      type: 'table',
      id: 'regions',
      caption: 'Tickets by region',
      columns: [{ label: 'Region' }, { label: 'Tickets', format: 'number' }],
      rows: [
        ['North', 420],
        ['South', null],
      ],
    },
    {
      type: 'chart',
      id: 'trend',
      spec: {
        kind: 'bar',
        title: 'Tickets per month',
        labels: ['July', 'August'],
        series: [{ label: 'Opened', values: [1080, 1150] }],
      },
    },
    {
      type: 'list',
      id: 'actions',
      style: 'icon',
      items: [
        { text: 'Hire two agents', icon: 'users' },
        { text: 'Ship the help center', icon: 'rocket' },
      ],
    },
    {
      type: 'quote',
      id: 'voice',
      quote: 'Support felt human again.',
      cite: 'Avery Example',
      role: 'Customer',
    },
    { type: 'callout', id: 'note', title: 'Heads up', body: 'Numbers are fictional.' },
    { type: 'divider', id: 'split', label: 'Appendix' },
    { type: 'code', id: 'query', lang: 'sql', code: 'select 1;', filename: 'query.sql' },
    {
      type: 'form',
      id: 'feedback',
      title: 'Was this useful?',
      fields: [{ name: 'note', label: 'Note', type: 'text' }],
      submitLabel: 'Send',
      successMessage: 'Thanks.',
    },
  ],
} as DocDocument;

function find(doc: TexuliDocument, id: string): DocumentBlock | undefined {
  return doc.blocks.find((block) => block.id === id);
}

describe('docToTexuliDocument (edit mode)', () => {
  it('returns a document valid at the untrusted tier, with unique ids', () => {
    const { document } = docToTexuliDocument(sample);
    expect(validateDocument(document).ok).toBe(true);
    expect(document.meta.title).toBe('Sample report');
    const ids = document.blocks.map((block) => block.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('maps text blocks to native document blocks', () => {
    const { document } = docToTexuliDocument(sample);
    expect(find(document, 'title')).toMatchObject({ type: 'heading', level: 1 });
    expect(find(document, 'intro')).toMatchObject({ type: 'paragraph' });
    expect(document.blocks.filter((block) => block.type === 'paragraph')).toHaveLength(2);
    expect(find(document, 'actions')).toMatchObject({ type: 'list', kind: 'bullet' });
    expect(find(document, 'voice')).toMatchObject({ type: 'quote' });
    expect(find(document, 'note')).toMatchObject({ type: 'callout', title: 'Heads up' });
    expect(find(document, 'split')).toMatchObject({ type: 'divider' });
    expect(find(document, 'query')).toMatchObject({ type: 'code', lang: 'sql', text: 'select 1;' });
  });

  it('keeps every other block as a titled host embed', () => {
    const { document, hostBlocks } = docToTexuliDocument(sample);
    expect([...hostBlocks.keys()]).toEqual(['kpis', 'regions', 'trend', 'feedback']);
    expect(find(document, 'trend')).toEqual({
      id: 'trend',
      type: 'embed',
      kind: 'component',
      ref: `${HOST_BLOCK_REF_PREFIX}trend`,
      title: 'Tickets per month',
    });
    expect(find(document, 'feedback')).toMatchObject({ title: 'Was this useful?' });
  });

  it('is deterministic and gives blocks without an id a positional key', () => {
    const noIds = {
      ...sample,
      blocks: [{ type: 'text', markdown: 'One.' }, { type: 'divider' }],
    } as DocDocument;
    expect(docToTexuliDocument(noIds)).toEqual(docToTexuliDocument(noIds));
    expect(docToTexuliDocument(noIds).document.blocks.map((block) => block.id)).toEqual([
      'block-1',
      'block-2',
    ]);
  });

  it('keeps hostile Markdown links inert (refused by the URL policy)', () => {
    const hostile = {
      ...sample,
      blocks: [{ type: 'text', id: 'evil', markdown: 'Click [here](javascript:alert(1)).' }],
    } as DocDocument;
    const { document } = docToTexuliDocument(hostile);
    expect(JSON.stringify(document)).not.toContain('javascript:');
  });

  it('marks heading page breaks for the paged writers when the doc asks for them', () => {
    const { document } = docToTexuliDocument({ ...sample, print: { pageBreaks: 'heading' } });
    expect(document.page?.breaks).toEqual(['numbers']);
    expect(docToTexuliDocument(sample).document.page).toBeUndefined();
  });

  it('names host blocks by title, caption or type', () => {
    expect(hostBlockTitle(sample.blocks[4] as never)).toBe('Tickets by region');
    expect(hostBlockTitle({ type: 'map', points: [] } as never)).toBe('Map');
  });

  it('gates editing on the kind runtime interact capability', () => {
    expect(DOC_CAPABILITIES.edit).toBe('blocks:interact');
  });
});

describe('docToTexuliDocument (export mode)', () => {
  const { document, hostBlocks } = docToTexuliDocument(sample, { mode: 'export' });

  it('writes the eyebrow, subtitle and quote citation as text', () => {
    const text = JSON.stringify(document.blocks);
    expect(text).toContain('Quarterly');
    expect(text).toContain('What changed this quarter.');
    expect(text).toContain('— Avery Example, Customer');
  });

  it('turns tables and charts with series into wrapped tables the writers print', () => {
    expect(find(document, 'regions')).toEqual({
      id: 'regions',
      type: 'block',
      family: 'data',
      block: 'table',
      props: {
        caption: 'Tickets by region',
        columns: [
          { id: 'c1', label: 'Region' },
          { id: 'c2', label: 'Tickets' },
        ],
        rows: [
          { c1: 'North', c2: '420' },
          { c1: 'South', c2: '' },
        ],
      },
    });
    expect(find(document, 'trend')).toMatchObject({
      block: 'table',
      props: {
        caption: 'Tickets per month',
        rows: [{ c1: 'July', c2: '1080' }, expect.anything()],
      },
    });
  });

  it('writes stats as a list and keeps forms as titled embeds', () => {
    expect(JSON.stringify(find(document, 'kpis'))).toContain('87% Resolved (+4 pts)');
    expect([...hostBlocks.keys()]).toEqual(['feedback']);
  });

  it('writes tables and charts as a caption and rows in list mode (Markdown)', () => {
    const listed = docToTexuliDocument(sample, { mode: 'export', tables: 'list' }).document;
    const text = JSON.stringify(listed.blocks);
    expect(text).toContain('Tickets by region');
    expect(text).toContain('Region: North · Tickets: 420');
    expect(text).toContain('Region: South');
    expect(text).toContain('July · Opened: 1080');
    expect(listed.blocks.some((block) => block.type === 'block')).toBe(false);
    expect(validateDocument(listed).ok).toBe(true);
  });

  it('adds the doc title as a heading when the doc does not open with one', () => {
    const untitled = {
      ...sample,
      blocks: [{ type: 'text', id: 'only', markdown: 'Body.' }],
    } as DocDocument;
    const exported = docToTexuliDocument(untitled, { mode: 'export' }).document;
    expect(exported.blocks[0]).toMatchObject({ type: 'heading', level: 1 });
    expect(validateDocument(exported).ok).toBe(true);
  });
});

describe('texuliDocumentToDoc', () => {
  it.each([...REAL_DOCS])('round-trips %s unchanged', (path) => {
    const doc = loadDoc(path);
    const { document } = docToTexuliDocument(doc);
    const back = texuliDocumentToDoc(document, doc);
    expect(back).toEqual({ ok: true, doc, notes: [] });
  });

  it('refuses an inline deck embed (validated with schema-core, G133)', () => {
    const { document } = docToTexuliDocument(sample);
    const edited = structuredClone(document);
    edited.blocks.push({
      id: 'pasted-deck',
      type: 'embed',
      kind: 'deck',
      title: 'Pasted deck',
      inline: { title: 'Deck', slides: [] },
    });
    // Protoyard never writes an inline deck (host blocks are component embeds), so it is refused.
    const back = texuliDocumentToDoc(edited, sample);
    expect(back.ok).toBe(false);
    if (back.ok) return;
    expect(back.issues.join(' ')).toMatch(/deck/i);
  });

  it('round-trips the sample and the shared fixture unchanged', () => {
    for (const doc of [sample, loadOnePagerDocFixture()]) {
      const back = texuliDocumentToDoc(docToTexuliDocument(doc).document, doc);
      expect(back.ok && back.doc).toEqual(doc);
    }
  });

  it('rebuilds an edited paragraph and keeps everything else exact', () => {
    const { document } = docToTexuliDocument(sample);
    const edited = structuredClone(document);
    const paragraph = edited.blocks.find((block) => block.id === 'intro');
    if (paragraph?.type !== 'paragraph') throw new Error('fixture');
    paragraph.content = [
      { type: 'text', text: 'Rewritten ', marks: [] },
      { type: 'text', text: 'intro', marks: [{ type: 'em' }] },
    ];
    const back = texuliDocumentToDoc(edited, sample);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.doc.blocks[1]).toEqual({
      type: 'text',
      id: 'intro',
      markdown: 'Rewritten *intro*',
    });
    expect(back.doc.blocks.slice(3)).toEqual(sample.blocks.slice(2));
  });

  it('keeps heading eyebrow and subtitle when its text changes', () => {
    const edited = structuredClone(docToTexuliDocument(sample).document);
    const heading = edited.blocks[0];
    if (heading?.type !== 'heading') throw new Error('fixture');
    heading.content = [{ type: 'text', text: 'New title', marks: [] }];
    const back = texuliDocumentToDoc(edited, sample);
    expect(back.ok && back.doc.blocks[0]).toEqual({
      type: 'heading',
      id: 'title',
      text: 'New title',
      level: 1,
      eyebrow: 'Quarterly',
      subtitle: 'What changed this quarter.',
    });
  });

  it('follows reordering and removal of host blocks', () => {
    const edited = structuredClone(docToTexuliDocument(sample).document);
    const order = edited.blocks.filter((block) => block.id !== 'regions');
    const trend = order.findIndex((block) => block.id === 'trend');
    const [moved] = order.splice(trend, 1);
    order.splice(0, 0, moved as DocumentBlock);
    edited.blocks = order;
    const back = texuliDocumentToDoc(edited, sample);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const ids = back.doc.blocks.map((block) => block.id);
    expect(ids[0]).toBe('trend');
    expect(ids).not.toContain('regions');
    expect(back.doc.blocks[0]).toEqual(sample.blocks[5]);
  });

  it('turns new editor blocks into doc blocks and names what it leaves out', () => {
    const edited = structuredClone(docToTexuliDocument(sample).document);
    edited.blocks.push(
      {
        id: 'n1',
        type: 'list',
        kind: 'todo',
        items: [
          {
            id: 'n2',
            checked: true,
            blocks: [
              { id: 'n3', type: 'paragraph', content: [{ type: 'text', text: 'Done', marks: [] }] },
            ],
          },
        ],
      },
      { id: 'n4', type: 'page-link', ref: 'pages/child', title: 'Child page' },
      { id: 'n5', type: 'media', ref: 'https://example.com/a.png', alt: 'A chart' },
      { id: 'n6', type: 'embed', kind: 'component', inline: { id: 'badge' }, title: 'Badge' },
      {
        id: 'n7',
        type: 'block',
        family: 'data',
        block: 'stat',
        props: { items: [{ value: '3', label: 'Wins' }] },
      }
    );
    const back = texuliDocumentToDoc(edited, sample);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.doc.blocks.at(-2)).toEqual({
      type: 'list',
      id: 'n1',
      style: 'check',
      items: [{ text: 'Done', done: true }],
    });
    expect(back.doc.blocks.at(-1)).toEqual({
      type: 'stat',
      id: 'n7',
      items: [{ value: '3', label: 'Wins' }],
    });
    expect(back.notes.map((note) => note.id)).toEqual(['n4', 'n5', 'n6']);
    expect(back.notes.every((note) => note.code === 'dropped')).toBe(true);
  });

  it('splits a paragraph longer than a text block holds', () => {
    const edited = structuredClone(docToTexuliDocument(sample).document);
    const long = Array.from({ length: 900 }, (_, i) => `word${i}`).join(' ');
    edited.blocks.push({
      id: 'long',
      type: 'paragraph',
      content: [{ type: 'text', text: long, marks: [] }],
    });
    const back = texuliDocumentToDoc(edited, sample);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const added = back.doc.blocks.slice(sample.blocks.length);
    expect(added.length).toBeGreaterThan(1);
    expect(added.every((block) => block.type === 'text' && block.markdown.length <= 4_000)).toBe(
      true
    );
    expect(back.notes).toEqual([expect.objectContaining({ id: 'long', code: 'split' })]);
  });

  it('refuses an invalid Texuli document and an empty one', () => {
    const invalid = {
      ...docToTexuliDocument(sample).document,
      blocks: [{ id: 'x', type: 'nope' }],
    };
    const refused = texuliDocumentToDoc(invalid as unknown as TexuliDocument, sample);
    expect(refused.ok).toBe(false);
    const empty = texuliDocumentToDoc(
      { ...docToTexuliDocument(sample).document, blocks: [] },
      sample
    );
    expect(empty).toMatchObject({ ok: false, issues: ['A doc needs at least one block.'] });
  });
});
