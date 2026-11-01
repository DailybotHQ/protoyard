// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { toggleReaction } from '../src/activity/index.ts';
import {
  EditorDocumentSchema,
  parseEditorDocument,
  safeHref,
  serializeEditorDocument,
} from '../src/editor/index.ts';

describe('safe editor documents', () => {
  it('removes unsafe links but preserves their readable labels as text', () => {
    const document = parseEditorDocument(
      '[script](javascript:alert(1)) [data](data:text/html,hi) [safe](mailto:hi@example.com)'
    );
    const block = document.blocks[0];
    expect(block?.type).toBe('paragraph');
    if (block?.type !== 'paragraph') throw new Error('expected paragraph');
    const links = block.children.filter((node) => node.type === 'link');
    expect(links).toEqual([
      {
        type: 'link',
        href: 'mailto:hi@example.com',
        children: [{ type: 'text', text: 'safe', marks: [] }],
      },
    ]);
    expect(
      block.children.some((node) => node.type === 'text' && node.text.includes('script'))
    ).toBe(true);
    expect(block.children.some((node) => node.type === 'text' && node.text.includes('data'))).toBe(
      true
    );
    expect(safeHref('java\nscript:alert(1)')).toBeNull();
    expect(safeHref('//example.com')).toBeNull();
    expect(safeHref('https://example.com')).toBe('https://example.com');
  });

  it('treats raw HTML as text and rejects malformed or oversized documents', () => {
    const html = parseEditorDocument('<img src=x onerror=alert(1)>');
    expect(html.blocks).toMatchObject([
      { type: 'paragraph', children: [{ type: 'text', text: '<img src=x onerror=alert(1)>' }] },
    ]);
    expect(() => parseEditorDocument('x'.repeat(32_001))).toThrow(/too large/i);
    const oversizedDocument = {
      version: 1 as const,
      blocks: Array.from({ length: 5 }, () => ({
        type: 'paragraph' as const,
        children: [{ type: 'text' as const, text: 'x'.repeat(8_000), marks: [] as const }],
      })),
    };
    expect(() => serializeEditorDocument(oversizedDocument)).toThrow(/too large/i);
    expect(() =>
      serializeEditorDocument({
        version: 1,
        blocks: [
          {
            type: 'paragraph',
            children: [{ type: 'link', href: 'javascript:alert(1)', children: [] }],
          },
        ],
      })
    ).toThrow();
    expect(() =>
      EditorDocumentSchema.parse({ version: 1, blocks: [], html: '<b>unsafe</b>' })
    ).toThrow();
  });
});

describe('activity reactions', () => {
  it('keeps a stored __proto__ reaction key as data, never as the prototype', () => {
    const stored = JSON.parse('{"__proto__":["p-x"],"👍":["p-li"]}') as Record<string, string[]>;
    const next = toggleReaction(stored, '👍', 'p-marta');
    expect(Object.getPrototypeOf(next)).toBe(Object.prototype);
    expect(Object.hasOwn(next, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(next, '__proto__')?.value).toEqual(['p-x']);
    expect(next['👍']).toEqual(['p-li', 'p-marta']);
    const removed = toggleReaction(next, '__proto__', 'p-x');
    expect(Object.hasOwn(removed, '__proto__')).toBe(false);
    expect(Object.getPrototypeOf(removed)).toBe(Object.prototype);
  });
});
