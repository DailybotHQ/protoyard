import { describe, expect, it } from 'vitest';
import {
  BoardDiagramSchema,
  FlowDiagramSchema,
  layoutBoard,
  layoutFlow,
  layoutTerminal,
  layoutTree,
  parseDiagram,
  TerminalDiagramSchema,
  TreeDiagramSchema,
} from '../src/diagram/index.ts';

const flow = {
  type: 'flow' as const,
  nodes: [
    { id: 'brief', label: 'Write a brief', tone: 'accent' as const },
    { id: 'build', label: 'Build a prototype' },
    { id: 'review', label: 'Review the result' },
  ],
  loopBack: true,
};

const tree = {
  type: 'tree' as const,
  style: 'org' as const,
  nodes: [
    { id: 'lead', parentId: null, label: 'Studio lead' },
    { id: 'design', parentId: 'lead', label: 'Design' },
    { id: 'engineering', parentId: 'lead', label: 'Engineering' },
    { id: 'research', parentId: 'design', label: 'Research' },
    { id: 'frontend', parentId: 'engineering', label: 'Frontend' },
  ],
};

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

describe('@protoyard/blocks/diagram', () => {
  it('parses four strict, bounded diagram models and returns path-addressed errors', () => {
    expect(FlowDiagramSchema.safeParse(flow).success).toBe(true);
    expect(TreeDiagramSchema.safeParse(tree).success).toBe(true);
    expect(
      BoardDiagramSchema.safeParse({
        type: 'board',
        columns: [
          {
            id: 'todo',
            title: 'To do',
            cards: [{ id: 'draft', title: 'Draft a plan', tone: 'warning' }],
          },
        ],
      }).success
    ).toBe(true);
    expect(
      TerminalDiagramSchema.safeParse({
        type: 'terminal',
        lines: [
          { kind: 'prompt', text: '$ protoyard new demo' },
          { kind: 'output', text: 'Created demo' },
        ],
      }).success
    ).toBe(true);
    expect(
      parseDiagram({ type: 'flow', nodes: [{ id: 'bad', label: 'Unsafe', style: 'red' }] })
    ).toMatchObject({
      success: false,
      issues: [{ jsonPath: '$["nodes"][0]', message: expect.any(String) }],
    });
  });

  it('rejects duplicate ids, missing parents, cycles, excessive depth and oversized atoms', () => {
    expect(
      FlowDiagramSchema.safeParse({ type: 'flow', nodes: [...flow.nodes, flow.nodes[0]] }).success
    ).toBe(false);
    expect(
      TreeDiagramSchema.safeParse({
        type: 'tree',
        style: 'file-tree',
        nodes: [{ id: 'leaf', parentId: 'missing', label: 'Leaf' }],
      }).success
    ).toBe(false);
    expect(
      TreeDiagramSchema.safeParse({
        type: 'tree',
        style: 'org',
        nodes: [
          { id: 'one', parentId: 'two', label: 'One' },
          { id: 'two', parentId: 'one', label: 'Two' },
        ],
      }).success
    ).toBe(false);
    const deepTree = Array.from({ length: 7 }, (_, index) => ({
      id: `node-${index}`,
      parentId: index === 0 ? null : `node-${index - 1}`,
      label: `Node ${index}`,
    }));
    expect(
      TreeDiagramSchema.safeParse({ type: 'tree', style: 'org', nodes: deepTree }).success
    ).toBe(false);
    expect(
      FlowDiagramSchema.safeParse({
        type: 'flow',
        nodes: Array.from({ length: 13 }, (_, index) => ({
          id: `step-${index}`,
          label: `Step ${index}`,
        })),
      }).success
    ).toBe(false);
    expect(
      BoardDiagramSchema.safeParse({
        type: 'board',
        columns: Array.from({ length: 7 }, (_, index) => ({
          id: `column-${index}`,
          title: `Column ${index}`,
          cards: [],
        })),
      }).success
    ).toBe(false);
    expect(
      TerminalDiagramSchema.safeParse({
        type: 'terminal',
        lines: Array.from({ length: 41 }, () => ({ kind: 'output', text: 'Done' })),
      }).success
    ).toBe(false);
  });

  it('lays out a flow chain deterministically with a loop-back edge and separated nodes', () => {
    const first = layoutFlow(flow);
    expect(layoutFlow(flow)).toEqual(first);
    expect(first.edges).toEqual([
      { from: 'brief', to: 'build', kind: 'flow' },
      { from: 'build', to: 'review', kind: 'flow' },
      { from: 'review', to: 'brief', kind: 'loop-back' },
    ]);
    expect(
      first.positions.every((node, index, all) =>
        all.slice(index + 1).every((other) => !overlaps(node, other))
      )
    ).toBe(true);
  });

  it('lays out file and org trees without node overlap', () => {
    for (const style of ['file-tree', 'org'] as const) {
      const layout = layoutTree({ ...tree, style });
      expect(layoutTree({ ...tree, style })).toEqual(layout);
      expect(layout.edges).toHaveLength(tree.nodes.length - 1);
      expect(layout.positions).toHaveLength(tree.nodes.length);
      expect(
        layout.positions.every((node) => node.x >= 0 && node.x + node.width <= layout.width)
      ).toBe(true);
      expect(
        layout.positions.every((node, index, all) =>
          all.slice(index + 1).every((other) => !overlaps(node, other))
        )
      ).toBe(true);
    }
  });

  it('lays out board columns and cards in distinct cells and preserves status tones', () => {
    const layout = layoutBoard({
      type: 'board',
      columns: [
        { id: 'todo', title: 'To do', cards: [{ id: 'draft', title: 'Draft', tone: 'warning' }] },
        { id: 'done', title: 'Done', cards: [{ id: 'ship', title: 'Ship', tone: 'success' }] },
      ],
    });
    expect(layout.positions.find((item) => item.id === 'ship')).toMatchObject({
      x: 224,
      y: 80,
      tone: 'success',
    });
    expect(
      layout.positions.every((node, index, all) =>
        all.slice(index + 1).every((other) => !overlaps(node, other))
      )
    ).toBe(true);
  });

  it('lays out terminal lines as plain text rows without HTML or image payloads', () => {
    const terminal = {
      type: 'terminal' as const,
      lines: [
        { kind: 'prompt' as const, text: '$ build' },
        { kind: 'output' as const, text: 'Build complete' },
        { kind: 'comment' as const, text: 'Ready to preview' },
      ],
    };
    const layout = layoutTerminal(terminal);
    expect(layout.positions.map(({ id, y, kind }) => ({ id, y, kind }))).toEqual([
      { id: 'line-1', y: 0, kind: 'prompt' },
      { id: 'line-2', y: 28, kind: 'output' },
      { id: 'line-3', y: 56, kind: 'comment' },
    ]);
    expect(JSON.stringify(layout)).not.toMatch(/<[^>]+>|data:image/);
  });
});
