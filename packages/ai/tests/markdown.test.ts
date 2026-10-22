import { createRng } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import { CHART_SPEC_MAX_LENGTH, chartBlock, parseChartSpec } from '../src/chart.ts';
import {
  inlineText,
  MARKDOWN_MAX_LENGTH,
  type MdBlock,
  type MdDocument,
  type MdInline,
  parseMarkdown,
  safeHref,
  safeImageSrc,
} from '../src/markdown.ts';
import type { AiChartSpec } from '../src/types.ts';

const blocks = (md: string) => parseMarkdown(md).blocks;
const inlines = (md: string) => {
  const [first] = blocks(md);
  if (first?.type !== 'paragraph') throw new Error(`expected a paragraph, got ${first?.type}`);
  return first.children;
};

/** Every URL that would reach an attribute, plus every node type, from a document. */
function walk(doc: MdDocument) {
  const urls: string[] = [];
  const images: string[] = [];
  const types = new Set<string>();
  const visitInline = (node: MdInline) => {
    types.add(node.type);
    if (node.type === 'link') urls.push(node.href);
    if (node.type === 'image' && node.src) images.push(node.src);
    if ('children' in node) node.children.forEach(visitInline);
  };
  const visitBlock = (block: MdBlock) => {
    types.add(block.type);
    if (block.type === 'paragraph' || block.type === 'heading') block.children.forEach(visitInline);
    if (block.type === 'quote') block.children.forEach(visitBlock);
    if (block.type === 'list') for (const item of block.items) item.children.forEach(visitBlock);
    if (block.type === 'table') {
      for (const cell of block.header) cell.forEach(visitInline);
      for (const row of block.rows) for (const cell of row) cell.forEach(visitInline);
    }
  };
  doc.blocks.forEach(visitBlock);
  for (const source of doc.sources) if (source.href) urls.push(source.href);
  return { urls, images, types };
}

/**
 * A minimal DOM renderer with the same contract the Svelte components follow:
 * text goes through text nodes, URLs only into href/src. It proves the AST
 * cannot produce executable markup.
 */
function renderToDom(doc: MdDocument): HTMLElement {
  const root = document.createElement('div');
  const inline = (parent: HTMLElement, nodes: readonly MdInline[]) => {
    for (const node of nodes) {
      if (node.type === 'text') parent.append(document.createTextNode(node.text));
      else if (node.type === 'break') parent.append(document.createElement('br'));
      else if (node.type === 'code') {
        const el = document.createElement('code');
        el.textContent = node.text;
        parent.append(el);
      } else if (node.type === 'link') {
        const el = document.createElement('a');
        el.setAttribute('href', node.href);
        inline(el, node.children);
        parent.append(el);
      } else if (node.type === 'image') {
        const el = document.createElement('img');
        el.setAttribute('alt', node.alt);
        if (node.src) el.setAttribute('src', node.src);
        parent.append(el);
      } else if (node.type === 'citation' || node.type === 'attachment') {
        parent.append(document.createTextNode(inlineText([node])));
      } else {
        const el = document.createElement(node.type === 'em' ? 'em' : node.type);
        inline(el, node.children);
        parent.append(el);
      }
    }
  };
  const block = (parent: HTMLElement, b: MdBlock) => {
    const el = document.createElement(
      b.type === 'paragraph' ? 'p' : b.type === 'heading' ? `h${b.level}` : 'div'
    );
    if (b.type === 'paragraph' || b.type === 'heading') inline(el, b.children);
    else if (b.type === 'code') el.textContent = b.text;
    else if (b.type === 'quote') for (const child of b.children) block(el, child);
    else if (b.type === 'list') {
      for (const item of b.items) for (const child of item.children) block(el, child);
    } else if (b.type === 'table') {
      for (const row of [b.header, ...b.rows]) for (const cell of row) inline(el, cell);
    }
    parent.append(el);
  };
  for (const b of doc.blocks) block(root, b);
  return root;
}

describe('parseMarkdown — blocks', () => {
  it('parses headings, paragraphs, rules and quotes', () => {
    const doc = blocks('# Plan\n\nFirst line\nsecond line\n\n---\n\n> quoted\n> # inside');
    expect(doc.map((b) => b.type)).toEqual(['heading', 'paragraph', 'rule', 'quote']);
    expect(doc[0]).toEqual({
      type: 'heading',
      level: 1,
      children: [{ type: 'text', text: 'Plan' }],
    });
    expect(doc[1]).toEqual({
      type: 'paragraph',
      children: [{ type: 'text', text: 'First line second line' }],
    });
    const quote = doc[3] as Extract<MdBlock, { type: 'quote' }>;
    expect(quote.children.map((b) => b.type)).toEqual(['paragraph', 'heading']);
  });

  it('keeps fenced code verbatim and marks unterminated fences while streaming', () => {
    const [closed] = blocks('```TS\nconst a = 1;\n<script>alert(1)</script>\n```\nafter');
    expect(closed).toEqual({
      type: 'code',
      lang: 'ts',
      text: 'const a = 1;\n<script>alert(1)</script>',
      closed: true,
    });
    const [open] = blocks('```python\nprint("partial');
    expect(open).toMatchObject({ type: 'code', lang: 'python', closed: false });
  });

  it('parses ordered, unordered, nested and task lists', () => {
    const [list, ordered] = blocks(
      '- [x] ship it\n- [ ] test it\n  - nested **bold**\n- plain\n\n3. three\n4. four'
    );
    expect(list).toMatchObject({ type: 'list', ordered: false });
    const items = (list as Extract<MdBlock, { type: 'list' }>).items;
    expect(items.map((item) => item.checked)).toEqual([true, false, null]);
    expect(items[1]?.children.map((b) => b.type)).toEqual(['paragraph', 'list']);
    expect(ordered).toMatchObject({ type: 'list', ordered: true, start: 3 });
  });

  it('parses tables with alignment, escaped pipes and ragged rows', () => {
    const [table] = blocks(
      '| Plan | Seats | Price |\n|:-----|:----:|-----:|\n| Pro | 5 | $10 \\| mo |\n| Team |'
    );
    expect(table).toMatchObject({ type: 'table', align: ['left', 'center', 'right'] });
    const t = table as Extract<MdBlock, { type: 'table' }>;
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0]?.map(inlineText)).toEqual(['Pro', '5', '$10 | mo']);
    expect(t.rows[1]?.map(inlineText)).toEqual(['Team', '', '']);
  });
});

describe('parseMarkdown — inline', () => {
  it('parses emphasis, strong, strikethrough, code and escapes', () => {
    expect(inlines('**bold** *em* ~~gone~~ `a < b` \\*literal\\* snake_case_name')).toEqual([
      { type: 'strong', children: [{ type: 'text', text: 'bold' }] },
      { type: 'text', text: ' ' },
      { type: 'em', children: [{ type: 'text', text: 'em' }] },
      { type: 'text', text: ' ' },
      { type: 'del', children: [{ type: 'text', text: 'gone' }] },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'a < b' },
      { type: 'text', text: ' *literal* snake_case_name' },
    ]);
  });

  it('parses links, bare URLs and hard breaks', () => {
    expect(
      inlines('See [docs](https://example.com/docs "Docs") or https://example.org/a.')
    ).toEqual([
      { type: 'text', text: 'See ' },
      {
        type: 'link',
        href: 'https://example.com/docs',
        children: [{ type: 'text', text: 'docs' }],
      },
      { type: 'text', text: ' or ' },
      {
        type: 'link',
        href: 'https://example.org/a',
        children: [{ type: 'text', text: 'https://example.org/a' }],
      },
      { type: 'text', text: '.' },
    ]);
    expect(inlines('one  \ntwo').map((n) => n.type)).toEqual(['text', 'break', 'text']);
  });

  it('accepts images only from the prototype and attachment references', () => {
    expect(inlines('![Chart](./assets/chart.png) ![Q3](attachment:file_0003)')).toEqual([
      { type: 'image', alt: 'Chart', src: './assets/chart.png', attachmentId: null },
      { type: 'text', text: ' ' },
      { type: 'image', alt: 'Q3', src: null, attachmentId: 'file_0003' },
    ]);
    // Remote and data: images fall back to their alt text.
    expect(
      inlines('![tracker](https://example.com/p.gif) ![x](data:image/png;base64,AAA)')
    ).toEqual([{ type: 'text', text: 'tracker x' }]);
    expect(inlines('Open [the brief](attachment:file_0001)')).toEqual([
      { type: 'text', text: 'Open ' },
      { type: 'attachment', id: 'file_0001', label: 'the brief' },
    ]);
  });

  it('numbers citations by source definition and leaves unknown ones as text', () => {
    const doc = parseMarkdown(
      'Revenue grew[^b] and churn fell[^a][^zz].\n\n[^a]: Churn report — https://example.com/churn\n[^b]: [Q3 deck](https://example.org/q3)\n[^c]: Internal note'
    );
    expect(doc.sources).toEqual([
      { id: 'a', index: 1, title: 'Churn report', href: 'https://example.com/churn' },
      { id: 'b', index: 2, title: 'Q3 deck', href: 'https://example.org/q3' },
      { id: 'c', index: 3, title: 'Internal note', href: null },
    ]);
    const [paragraph] = doc.blocks;
    expect(paragraph).toEqual({
      type: 'paragraph',
      children: [
        { type: 'text', text: 'Revenue grew' },
        { type: 'citation', id: 'b', index: 2 },
        { type: 'text', text: ' and churn fell' },
        { type: 'citation', id: 'a', index: 1 },
        { type: 'text', text: '[^zz].' },
      ],
    });
    expect(doc.blocks).toHaveLength(1);
  });
});

describe('sanitization', () => {
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    '\u0000javascript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/hosts',
    '//evil.example',
    '/\\evil.example',
    '\\/evil.example',
    '\\\\evil.example',
  ])('rejects the link target %j', (url) => {
    expect(safeHref(url)).toBeNull();
    expect(safeImageSrc(url)).toBeNull();
  });

  it('allows https, mailto and same-document fragments while keeping relative images local', () => {
    expect(safeHref('https://example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c');
    expect(safeHref('mailto:team@example.com')).toBe('mailto:team@example.com');
    expect(safeHref('http://example.com')).toBeNull();
    // Same-document fragments never leave the page: in-app routes and section anchors.
    expect(safeHref('#/deals/42')).toBe('#/deals/42');
    expect(safeHref('#plans')).toBe('#plans');
    expect(safeHref('#"><script>')).toBeNull();
    expect(safeHref('./notes.md')).toBeNull();
    expect(safeImageSrc('./assets/chart.png')).toBe('./assets/chart.png');
    expect(safeImageSrc('https://example.com/a.png')).toBeNull();
  });

  it('keeps raw HTML as literal text and drops unsafe links to their label', () => {
    const md =
      '<script>alert(1)</script> <img src=x onerror=alert(1)> [click](javascript:alert(1)) <a href="javascript:x">y</a>';
    const nodes = inlines(md);
    expect(nodes.every((n) => n.type === 'text')).toBe(true);
    expect(inlineText(nodes)).toBe(
      '<script>alert(1)</script> <img src=x onerror=alert(1)> click <a href="javascript:x">y</a>'
    );
  });

  it('never yields an unsafe URL or executable markup for hostile fuzz input', () => {
    const fragments = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<iframe src="javascript:alert(1)">',
      '<svg onload=alert(1)>',
      '[x](javascript:alert(1))',
      '[x](JAVASCRIPT:alert(1))',
      '[x]( java\tscript:alert(1) )',
      '[x](data:text/html;base64,PHNjcmlwdD4=)',
      '![x](javascript:alert(1))',
      '![x](//evil.example/a.png)',
      '[^1]: [src](javascript:alert(1))',
      '[^2]: src vbscript:alert(1)',
      '[[[[[[[[[[',
      ']]]]))((',
      '**',
      '*',
      '_',
      '~~',
      '`',
      '```',
      '> ',
      '- ',
      '1. ',
      '| a | b |',
      '|---|---|',
      '#',
      '\\',
      '\n',
      '\n\n',
      '  ',
      'https://example.com/ok',
      'text',
      '"\'',
      '&lt;script&gt;',
      'javascript&colon;alert(1)',
      '[^1]',
      '[a](attachment:../../etc)',
    ];
    const rng = createRng('markdown-fuzz');
    for (let run = 0; run < 400; run++) {
      const md = Array.from({ length: rng.int(1, 30) }, () => rng.pick(fragments)).join(
        rng.pick(['', ' ', '\n'])
      );
      const doc = parseMarkdown(md);
      const { urls, images } = walk(doc);
      for (const url of urls) {
        expect(safeHref(url), `unsafe url ${JSON.stringify(url)} from ${JSON.stringify(md)}`).toBe(
          url
        );
        expect(url.toLowerCase()).not.toMatch(/^\s*(?:javascript|vbscript|data):/);
      }
      for (const src of images) expect(safeImageSrc(src)).toBe(src);
      const dom = renderToDom(doc);
      expect(dom.querySelector('script, iframe, svg, object, embed')).toBeNull();
      for (const el of dom.querySelectorAll('*')) {
        for (const attr of el.getAttributeNames()) expect(['href', 'src', 'alt']).toContain(attr);
      }
    }
  });

  it('stays bounded on pathological input', () => {
    const deep = `${'> '.repeat(200)}deep`;
    expect(() => parseMarkdown(deep)).not.toThrow();
    const nested = `${'['.repeat(5000)}x${'](#)'.repeat(5000)}`;
    expect(() => parseMarkdown(nested)).not.toThrow();
    const stars = '*a '.repeat(20_000);
    const started = performance.now();
    parseMarkdown(stars);
    expect(performance.now() - started).toBeLessThan(2_000);
    const huge = 'x'.repeat(MARKDOWN_MAX_LENGTH + 10);
    expect(inlineText(inlines(huge))).toHaveLength(MARKDOWN_MAX_LENGTH);
    expect(parseMarkdown(undefined as unknown as string)).toEqual({ blocks: [], sources: [] });
  });
});

describe('chart answers', () => {
  const spec: AiChartSpec = {
    kind: 'bar',
    title: 'Signups last week',
    unit: 'number',
    labels: ['Mon', 'Tue', 'Wed'],
    series: [{ label: 'Signups', values: [12, null, 30] }],
  };

  it('keeps a chart fence as a code block unless charts are enabled', () => {
    const md = `Here you go:\n\n${chartBlock(spec)}\n\nAnything else?`;
    expect(parseMarkdown(md).blocks[1]).toMatchObject({ type: 'code', lang: 'chart' });
    const chart = parseMarkdown(md, { charts: true }).blocks[1];
    expect(chart).toMatchObject({ type: 'chart', closed: true });
    // The block carries raw text only; validation happens in the renderer.
    expect(parseChartSpec((chart as { text: string }).text)).toEqual({ ok: true, spec });
  });

  it('marks a chart fence that is still streaming as open', () => {
    const doc = parseMarkdown('```chart\n{"kind":"bar"', { charts: true });
    expect(doc.blocks[0]).toEqual({ type: 'chart', text: '{"kind":"bar"', closed: false });
  });

  it('rejects malformed, oversized, unknown-key and inconsistent specs with a short message', () => {
    expect(parseChartSpec('{nope')).toEqual({
      ok: false,
      error: 'The chart data is not valid JSON',
    });
    expect(parseChartSpec(' '.repeat(CHART_SPEC_MAX_LENGTH + 1))).toMatchObject({ ok: false });
    const bad = (patch: object) => parseChartSpec(JSON.stringify({ ...spec, ...patch }));
    expect(bad({ kind: 'script' })).toMatchObject({ ok: false });
    expect(bad({ onload: 'alert(1)' })).toMatchObject({ ok: false });
    expect(bad({ series: [{ label: 'A', values: [1] }] })).toEqual({
      ok: false,
      error: 'series.0.values: Needs one value per label (3)',
    });
    expect(bad({ kind: 'donut', series: [{ label: 'A', values: [1, -2, 3] }] })).toMatchObject({
      ok: false,
      error: expect.stringContaining('non-negative'),
    });
    expect(bad({ currency: 'usd' })).toMatchObject({ ok: false });
    expect(() => chartBlock({ ...spec, labels: [] })).toThrow();
  });

  it('rejects control and bidi characters in chart labels and series labels', () => {
    expect(
      parseChartSpec(JSON.stringify({ ...spec, labels: ['Mon\u200e', 'Tue', 'Wed'] }))
    ).toMatchObject({
      ok: false,
    });
    expect(
      parseChartSpec(
        JSON.stringify({ ...spec, series: [{ ...spec.series[0], label: 'Signups\u061c' }] })
      )
    ).toMatchObject({ ok: false });
    expect(
      parseChartSpec(JSON.stringify({ ...spec, labels: ['Mon\u0001', 'Tue', 'Wed'] }))
    ).toMatchObject({
      ok: false,
    });
  });

  it('treats markup in spec strings as data', () => {
    const result = parseChartSpec(
      JSON.stringify({ ...spec, title: '<img src=x onerror=alert(1)>' })
    );
    expect(result).toMatchObject({ ok: true, spec: { title: '<img src=x onerror=alert(1)>' } });
  });
});
