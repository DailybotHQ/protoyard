// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BLOCK_LIMITS, type BlockLimits, parseUntrustedBlocks } from '../src/index.ts';

const failure = (input: unknown, limits?: Partial<BlockLimits>) => {
  const result = parseUntrustedBlocks(input, limits);
  expect(result.success).toBe(false);
  if (result.success) throw new Error('expected block input to be rejected');
  expect(result.issues[0]).toMatchObject({
    code: expect.any(String),
    path: expect.any(Array),
    jsonPath: expect.any(String),
    message: expect.any(String),
    fix: expect.any(String),
  });
  return result.issues[0]!;
};

function nestedColumns(depth: number): unknown {
  if (depth === 0) return { type: 'divider' };
  const child = nestedColumns(depth - 1);
  return { type: 'columns', columns: [[child], [{ type: 'divider' }]] };
}

describe('parseUntrustedBlocks', () => {
  it('exports frozen limits that include the diagram model caps', () => {
    expect(Object.isFrozen(BLOCK_LIMITS)).toBe(true);
    expect(BLOCK_LIMITS).toMatchObject({
      maxBlocks: 2_000,
      maxContainerDepth: 3,
      maxDataUriBytes: 192 * 1024,
      maxDocumentDataUriBytes: 512 * 1024,
      flowNodes: 12,
      treeNodes: 64,
      treeDepth: 6,
      boardColumns: 6,
      boardCardsPerColumn: 8,
      terminalLines: 40,
    });
  });

  it('round-trips valid static, interactive, diagram and nested blocks unchanged', () => {
    const blocks = [
      { type: 'text', markdown: 'A **safe** paragraph.\n\nSecond line.' },
      { type: 'list', items: [{ text: 'First\ncontinued' }] },
      { type: 'code', lang: 'text', code: 'line one\n\tline two' },
      {
        type: 'poll',
        id: 'vote',
        question: 'Pick one',
        options: [
          { id: 'one', label: 'One' },
          { id: 'two', label: 'Two' },
        ],
      },
      {
        type: 'columns',
        columns: [
          [
            {
              type: 'flow',
              nodes: [
                { id: 'start', label: 'Start' },
                { id: 'finish', label: 'Finish' },
              ],
            },
          ],
          [{ type: 'terminal', lines: [{ kind: 'prompt', text: '$ run' }] }],
        ],
      },
      { type: 'tree', style: 'org', nodes: [{ id: 'root', parentId: null, label: 'Root' }] },
      {
        type: 'board',
        columns: [
          { id: 'todo', title: 'To do', cards: [{ id: 'task', title: 'Task', tone: 'info' }] },
        ],
      },
    ];

    expect(parseUntrustedBlocks(blocks)).toEqual({ success: true, blocks, issues: [] });
    expect(parseUntrustedBlocks(JSON.stringify(blocks))).toEqual({
      success: true,
      blocks,
      issues: [],
    });
  });

  it('rejects malformed, non-array, oversized and over-depth inputs without throwing', () => {
    expect(failure('{').code).toBe('invalid-json');
    expect(failure({ type: 'divider' }).code).toBe('invalid-input');
    expect(failure(JSON.stringify([{ type: 'divider' }]), { maxBytes: 4 }).code).toBe('too-large');
    expect(failure(`${'['.repeat(13)}0${']'.repeat(13)}`).code).toBe('too-deep');
    expect(failure(Array.from({ length: 2_001 }, () => ({ type: 'divider' }))).code).toBe(
      'too-many'
    );
    expect(failure([{ type: 'divider' }, { type: 'divider' }], { maxBlocks: 1 })).toMatchObject({
      code: 'too-many',
      jsonPath: '$[1]',
    });
  });

  it('enforces container depth, table cells, and general text limits with paths', () => {
    expect(failure([nestedColumns(2)], { maxContainerDepth: 1 })).toMatchObject({
      code: 'too-deep',
      jsonPath: '$[0]["columns"][0][0]',
    });
    expect(
      failure(
        [
          {
            type: 'table',
            caption: 'Grid',
            columns: [{ label: 'A' }, { label: 'B' }],
            rows: [
              [1, 2],
              [3, 4],
            ],
          },
        ],
        { maxTableCells: 3 }
      )
    ).toMatchObject({ code: 'too-many', jsonPath: '$[0]["rows"]' });
    expect(
      failure([{ type: 'heading', text: 'Long heading' }], { maxTextLength: 4 })
    ).toMatchObject({
      code: 'too-large',
      jsonPath: '$[0]["text"]',
    });
  });

  it('uses the diagram schemas and rejects lowered as well as built-in atom caps', () => {
    expect(
      failure(
        [
          {
            type: 'flow',
            nodes: [
              { id: 'one', label: 'One' },
              { id: 'two', label: 'Two' },
            ],
          },
        ],
        { flowNodes: 1 }
      )
    ).toMatchObject({ code: 'too-many', jsonPath: '$[0]["nodes"]' });
    expect(
      failure(
        [
          {
            type: 'tree',
            style: 'org',
            nodes: [
              { id: 'a', parentId: null, label: 'A' },
              { id: 'b', parentId: 'a', label: 'B' },
            ],
          },
        ],
        { treeDepth: 1 }
      )
    ).toMatchObject({ code: 'too-deep', jsonPath: '$[0]["nodes"][1]' });
    expect(
      failure(
        [
          {
            type: 'board',
            columns: [
              { id: 'a', title: 'A', cards: [] },
              { id: 'b', title: 'B', cards: [] },
            ],
          },
        ],
        { boardColumns: 1 }
      )
    ).toMatchObject({ code: 'too-many', jsonPath: '$[0]["columns"]' });
    expect(
      failure(
        [
          {
            type: 'terminal',
            lines: [
              { kind: 'output', text: 'one' },
              { kind: 'output', text: 'two' },
            ],
          },
        ],
        { terminalLines: 1 }
      )
    ).toMatchObject({ code: 'too-many', jsonPath: '$[0]["lines"]' });
    expect(
      failure([
        {
          type: 'flow',
          nodes: Array.from({ length: 13 }, (_, index) => ({ id: `node-${index}`, label: 'Node' })),
        },
      ]).code
    ).toBe('too-many');
  });

  it('caps decoded media bytes per source and across the document', () => {
    const tinyDataUri =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const image = (src: string) => ({ type: 'image', src, alt: 'Tiny image', width: 1, height: 1 });
    expect(failure([image(tinyDataUri)], { maxDataUriBytes: 4 })).toMatchObject({
      code: 'too-large',
      jsonPath: '$[0]["src"]',
    });
    const largeUri = `data:image/png;base64,${'A'.repeat(240_000)}`;
    expect(failure([image(largeUri), image(largeUri), image(largeUri)])).toMatchObject({
      code: 'too-large',
      jsonPath: '$[2]["src"]',
    });
    expect(
      failure([image(tinyDataUri), image(tinyDataUri)], {
        maxDataUriBytes: 1_000,
        maxDocumentDataUriBytes: 100,
      })
    ).toMatchObject({
      code: 'too-large',
      jsonPath: '$[1]["src"]',
    });
  });

  it('rejects prototype keys and reports the original paths', () => {
    expect(
      failure('[{"type":"heading","text":"Safe","__proto__":{"polluted":true}}]')
    ).toMatchObject({
      code: 'unsafe-key',
      jsonPath: '$[0]["__proto__"]',
    });
    expect(failure('[{"type":"heading","text":"Safe","constr\\u202euctor":"bad"}]')).toMatchObject({
      code: 'unsafe-key',
      jsonPath: '$[0]["constructor"]',
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('strips controls and bidi marks, normalizes CRLF, and preserves allowed newlines and code tabs', () => {
    const input = [
      { type: 'heading', text: 'A\u202eB\u0000' },
      { type: 'text', markdown: 'First\r\nSecond\u202e' },
      { type: 'code', lang: 'text', code: 'one\r\n\ttwo\u202e' },
    ];
    const result = parseUntrustedBlocks(input);
    expect(result).toEqual({
      success: true,
      blocks: [
        { type: 'heading', text: 'AB' },
        { type: 'text', markdown: 'First\nSecond' },
        { type: 'code', lang: 'text', code: 'one\n\ttwo' },
      ],
      issues: [],
    });
    expect(input[0]?.text).toBe('A\u202eB\u0000');
  });

  it('rejects cycles, custom prototypes and accessors as invalid input', () => {
    const cyclic: Record<string, unknown> = {
      type: 'reveal',
      id: 'details',
      label: 'Details',
      blocks: [],
    };
    cyclic.blocks = [cyclic];
    expect(failure([cyclic]).code).toBe('invalid-input');
    expect(failure([new Date()]).code).toBe('invalid-input');
    const accessor = Object.defineProperty({ type: 'heading' }, 'text', {
      enumerable: true,
      get: () => 'unsafe',
    });
    expect(failure([accessor]).code).toBe('invalid-input');
  });
});
