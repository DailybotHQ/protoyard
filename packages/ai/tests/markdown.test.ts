import { createRng } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import { parseChartSpec } from '../src/chart.ts';
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
import {
  attachmentUrlIssue,
  isSafeLinkUrl,
  MESSAGE_FORMAT,
  MESSAGE_LIMITS,
  parseChatMessage,
} from '../src/messages/index.ts';
import { type AiChartSpec } from '../src/types.ts';

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

describe('sanitization', () => {
  it('rejects every unsafe link target', () => {
    for (const url of [
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
    ]) {
      expect(safeHref(url)).toBeNull();
      expect(safeImageSrc(url)).toBeNull();
    }
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
});

// --- merged from messages.test.ts ---

describe('messages', () => {
  /** A `protoyard.message@1` envelope around `blocks`. */
  function message_(blocks: unknown[], extra: Record<string, unknown> = {}) {
    return { format: MESSAGE_FORMAT, blocks, ...extra };
  }

  function ok(input: unknown) {
    const result = parseChatMessage(input);
    if (!result.success) throw new Error(JSON.stringify(result.issues, null, 2));
    return result;
  }

  function issues(input: unknown) {
    const result = parseChatMessage(input);
    expect(result.success).toBe(false);
    return result.issues;
  }

  describe('unknown blocks', () => {
    it('never carries markup or unsafe text from an unknown block into the fallback', () => {
      const { message: parsed } = ok(
        message_([
          { type: 'widget', fallback: '<img src=x onerror=alert(1)>' },
          { type: '<script>alert(1)</script>', fallback: 'x'.repeat(500) },
        ])
      );
      expect(parsed.blocks[0]).toMatchObject({
        text: 'This message has content this app cannot show ("widget").',
      });
      expect(parsed.blocks[1]).toEqual({
        type: 'text',
        format: 'plain',
        text: 'This message has content this app cannot show.',
        replaces: 'unknown',
      });
      expect(JSON.stringify(parsed)).not.toContain('<img');
    });
  });

  describe('unsafe links', () => {
    const unsafe = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      ' javascript:alert(1)',
      'java\tscript:alert(1)',
      'data:text/html,<b>x</b>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      '//evil.example.com',
      '/\\evil.example.com',
      'https://user:pass@example.com/',
      'https://exa\u202emple.com',
      'relative/path',
      'http://example.com',
      'mailto:',
    ];

    it('rejects every unsafe button or preview URL', () => {
      for (const url of unsafe) {
        expect(isSafeLinkUrl(url)).toBe(false);
        expect(
          issues(message_([{ type: 'buttons', buttons: [{ label: 'Go', url }] }])).length
        ).toBeGreaterThan(0);
        expect(issues(message_([{ type: 'link_preview', url }])).length).toBeGreaterThan(0);
      }
    });

    it('never lets a link preview load a remote image', () => {
      const preview = (image: string) =>
        message_([{ type: 'link_preview', url: 'https://example.com', image }]);
      expect(issues(preview('https://cdn.example.com/a.png'))[0]?.path).toEqual([
        'blocks',
        0,
        'image',
      ]);
      expect(issues(preview('data:image/svg+xml;base64,PHN2Zz4='))[0]?.path).toEqual([
        'blocks',
        0,
        'image',
      ]);
      ok(preview('attachment:hero'));
    });
  });

  describe('markup payloads', () => {
    const markup = [
      '<script>alert(1)</script>',
      'Hello <b>there</b>',
      '<img src=x onerror=alert(1)>',
      '<!-- hidden -->',
      '<svg/onload=alert(1)>',
      '</div>',
      '<!DOCTYPE html>',
      '<?xml version="1.0"?>',
      // Unclosed: browsers still parse it as a tag.
      '<img src=x onerror=alert(1)',
    ];

    it('rejects every markup payload in text, labels, cells and options', () => {
      for (const payload of markup) {
        const where = [
          message_([{ type: 'text', text: payload }]),
          message_([{ type: 'buttons', buttons: [{ label: payload, action: 'go' }] }]),
          message_([
            { type: 'table', columns: [{ key: 'a', header: 'A' }], rows: [{ a: payload }] },
          ]),
          message_([
            {
              type: 'select',
              action: 'a',
              placeholder: 'p',
              options: [{ value: 'v', label: payload }],
            },
          ]),
          message_([{ type: 'link_preview', url: 'https://example.com', description: payload }]),
        ];
        for (const input of where) {
          expect(issues(input)[0]?.message).toMatch(/Markup is not allowed/);
        }
      }
    });
  });

  describe('limits', () => {
    it('caps the message size, nesting and block count before validating blocks', () => {
      const big = message_([{ type: 'text', text: 'x'.repeat(MESSAGE_LIMITS.maxBytes) }]);
      expect(issues(big)[0]?.code).toBe('too-large');
      expect(issues(JSON.stringify(big))[0]?.code).toBe('too-large');

      let deep: unknown = 'leaf';
      for (let i = 0; i < MESSAGE_LIMITS.maxDepth + 1; i += 1) deep = { nested: deep };
      expect(issues(message_([{ type: 'text', text: 'x', extra: deep }]))[0]?.code).toBe(
        'too-deep'
      );

      const many = Array.from({ length: MESSAGE_LIMITS.maxBlocks + 1 }, () => ({
        type: 'text',
        text: 'x',
      }));
      expect(issues(message_(many))[0]).toMatchObject({
        code: 'too-many',
        jsonPath: '$["blocks"]',
      });
      ok(message_(many.slice(0, MESSAGE_LIMITS.maxBlocks)));
    });
  });

  describe('attachments', () => {
    const attachment = (extra: Record<string, unknown>) =>
      message_([{ type: 'text', text: 'See attached.' }], {
        attachments: [
          {
            id: 'a1',
            name: 'brief.pdf',
            mime: 'application/pdf',
            size: 1200,
            url: 'files/brief.pdf',
            ...extra,
          },
        ],
      });

    it('refuses every unsafe attachment', () => {
      for (const [url, reason] of [
        ['https://cdn.example.com/brief.pdf', 'remote'],
        ['//cdn.example.com/brief.pdf', 'remote'],
        ['javascript:alert(1)', 'scheme'],
        ['blob:https://example.com/1', 'scheme'],
        ['file:///tmp/brief.pdf', 'scheme'],
        ['data:text/html;base64,PGI+', 'data-uri-type'],
        ['data:image/svg+xml;base64,PHN2Zz4=', 'data-uri-type'],
        ['files/../../secrets.pdf', 'traversal'],
        ['files/%2e%2e/secrets.pdf', 'traversal'],
        ['files\\brief.pdf', 'unsafe-characters'],
        ['files/brief\u0000.pdf', 'unsafe-characters'],
      ]) {
        expect(attachmentUrlIssue(url)).toBe(reason);
        expect(issues(attachment({ url }))[0]?.path).toEqual(['attachments', 0, 'url']);
      }
    });
  });

  describe('envelope', () => {
    it('refuses prototype keys, non-JSON values and cycles', () => {
      expect(
        issues(JSON.parse('{"format":"protoyard.message@1","blocks":[],"__proto__":{"x":1}}'))[0]
          ?.code
      ).toBe('unsafe-key');
      expect(issues(message_([{ type: 'text', text: 'x', at: new Date(0) }]))[0]?.code).toBe(
        'invalid-input'
      );
      expect(issues(message_([{ type: 'text', text: 'x', n: Number.NaN }]))[0]?.code).toBe(
        'invalid-input'
      );
      const cyclic: Record<string, unknown> = { format: MESSAGE_FORMAT, blocks: [] };
      cyclic.self = cyclic;
      expect(issues(cyclic)[0]?.code).toBe('invalid-input');
      expect(issues(null)[0]?.code).toBe('invalid-input');
      expect(issues([1, 2])[0]?.code).toBe('invalid-input');
    });
  });
});

// --- merged from markdown-subpath.test.ts ---

describe('markdown-subpath', () => {
  /**
   * `@protoyard/ai/markdown` lets other kits (the views editor, review comments)
   * reuse the one audited safe-markdown parser without the AI engine (ADR-022).
   * Resolve it by its package specifier, exactly as a consumer would.
   */
  describe('@protoyard/ai/markdown subpath', () => {
    it('keeps unsafe links inert through the subpath', async () => {
      const { parseMarkdown, safeHref } = await import('@protoyard/ai/markdown');
      expect(safeHref('javascript:alert(1)')).toBeNull();
      const doc = parseMarkdown('<script>alert(1)</script> [x](javascript:alert(1))');
      expect(JSON.stringify(doc)).not.toContain('javascript:');
    });
  });
});
