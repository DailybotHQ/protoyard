import { describe, expect, it } from 'vitest';
import type { Block } from '../src/schema/index.ts';
import {
  blocksText,
  blocksToMarkdown,
  blockText,
  countBlockWords,
  countWords,
  escapeMarkdown,
  outlineOf,
  slugifyHeading,
  uniqueSlug,
  walkBlocks,
} from '../src/text.ts';

const heading = (text: string, level = 2, id?: string): Block => ({
  type: 'heading',
  text,
  level,
  ...(id ? { id } : {}),
});

const text = (markdown: string): Block => ({ type: 'text', markdown });

describe('walkBlocks', () => {
  it('walks depth-first with JSONPath including nested containers', () => {
    const blocks: Block[] = [
      text('Intro'),
      {
        type: 'tabs',
        id: 't1',
        label: 'Views',
        panels: [
          {
            id: 'p1',
            label: 'One',
            blocks: [heading('Nested')],
          },
        ],
      },
      {
        type: 'reveal',
        id: 'r1',
        label: 'More',
        blocks: [text('Hidden **bold**')],
      },
    ];
    const walked = walkBlocks(blocks);
    const paths = walked.map((row) => `${row.block.type}@${row.jsonPath}`);
    expect(paths).toEqual([
      'text@$[0]',
      'tabs@$[1]',
      'heading@$[1]["panels"][0]["blocks"][0]',
      'reveal@$[2]',
      'text@$[2]["blocks"][0]',
    ]);
    expect(walked[2]?.depth).toBeGreaterThan(0);
  });
});

describe('blockText and words', () => {
  it('strips markdown to plain text and counts words', () => {
    expect(blockText(text('Hello **world** and a [link](https://example.com)'))).toBe(
      'Hello world and a link'
    );
    expect(blockText(heading('Ship notes', 1, 'ship'))).toBe('Ship notes');
    expect(
      blockText({
        type: 'list',
        items: [{ text: 'One' }, { text: 'Two *items*' }],
      })
    ).toContain('Two items');
    expect(countWords("don't count  —  twice")).toBe(3);
    expect(countBlockWords([text('alpha beta'), text('gamma')])).toBe(3);
  });

  it('includes nested block text in blocksText', () => {
    const blocks: Block[] = [
      {
        type: 'columns',
        columns: [[text('Left side')], [heading('Right title')]],
      },
    ];
    expect(blocksText(blocks)).toContain('Left side');
    expect(blocksText(blocks)).toContain('Right title');
  });
});

describe('outlineOf', () => {
  it('builds unique stable slugs and levels', () => {
    const blocks: Block[] = [
      heading('Getting started', 2),
      heading('Getting started', 3),
      heading('Next steps', 2, 'next-steps'),
      text('Not a heading'),
    ];
    const outline = outlineOf(blocks);
    expect(outline.map((entry) => entry.id)).toEqual([
      'getting-started',
      'getting-started-2',
      'next-steps',
    ]);
    expect(outline[0]?.level).toBe(2);
    expect(outline[1]?.level).toBe(3);
    expect(outline[2]?.blockId).toBe('next-steps');
    expect(outline[0]?.jsonPath).toBe('$[0]');
    // Stable across calls
    expect(outlineOf(blocks).map((entry) => entry.id)).toEqual(outline.map((entry) => entry.id));
  });

  it('slugify matches DocsLayout rules for unicode', () => {
    expect(slugifyHeading('  Café  Overview! ')).toBe('cafe-overview');
    expect(uniqueSlug('Hello', new Set(['hello']))).toBe('hello-2');
  });
});

describe('blocksToMarkdown', () => {
  it('escapes control characters in plain labels and keeps author markdown', () => {
    expect(escapeMarkdown('a*b_c')).toBe('a\\*b\\_c');
    const md = blocksToMarkdown([
      heading('Title *star*', 1),
      text('Paragraph with **bold**'),
      {
        type: 'list',
        style: 'bullet',
        items: [{ text: 'Item one' }],
      },
      {
        type: 'code',
        lang: 'ts',
        code: 'const x = 1;',
      },
    ]);
    expect(md).toContain('# Title \\*star\\*');
    expect(md).toContain('Paragraph with **bold**');
    expect(md).toContain('- Item one');
    expect(md).toContain('```ts\nconst x = 1;\n```');
  });

  it('expands tabs and columns without HTML', () => {
    const md = blocksToMarkdown([
      {
        type: 'tabs',
        id: 'tabs',
        label: 'Tabs',
        panels: [
          { id: 'a', label: 'Alpha', blocks: [text('Panel A')] },
          { id: 'b', label: 'Beta', blocks: [heading('In beta')] },
        ],
      },
    ]);
    expect(md).toContain('### Alpha');
    expect(md).toContain('Panel A');
    expect(md).toContain('### Beta');
    expect(md).not.toMatch(/<[^>]+>/);
  });
});
