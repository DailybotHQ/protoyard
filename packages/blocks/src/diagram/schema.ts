import { DIAGRAM_LIMITS } from '@texuli/blocks/diagram/engine';
import { z } from 'zod';
import { BlockToneSchema, blockBase, plainText } from '../schema/primitives.ts';

export { DIAGRAM_LIMITS };

const DiagramIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);
const LabelSchema = plainText(120);

const FlowNodeSchema = z.strictObject({
  id: DiagramIdSchema,
  label: LabelSchema,
  tone: BlockToneSchema.optional(),
});

export const FlowDiagramSchema = z
  .strictObject({
    type: z.literal('flow'),
    ...blockBase,
    nodes: z.array(FlowNodeSchema).min(1).max(DIAGRAM_LIMITS.flowNodes),
    loopBack: z.boolean().optional(),
  })
  .superRefine((flow, ctx) => {
    const ids = new Set<string>();
    flow.nodes.forEach((node, index) => {
      if (ids.has(node.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes', index, 'id'],
          message: `Duplicate node id: ${node.id}`,
        });
      }
      ids.add(node.id);
    });
  });

const TreeNodeSchema = z.strictObject({
  id: DiagramIdSchema,
  parentId: DiagramIdSchema.nullable(),
  label: LabelSchema,
  tone: BlockToneSchema.optional(),
});

export const TreeDiagramSchema = z
  .strictObject({
    type: z.literal('tree'),
    ...blockBase,
    style: z.enum(['file-tree', 'org']),
    nodes: z.array(TreeNodeSchema).min(1).max(DIAGRAM_LIMITS.treeNodes),
  })
  .superRefine((tree, ctx) => {
    const byId = new Map<string, (typeof tree.nodes)[number]>();
    tree.nodes.forEach((node, index) => {
      if (byId.has(node.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes', index, 'id'],
          message: `Duplicate node id: ${node.id}`,
        });
      }
      byId.set(node.id, node);
    });
    const roots = tree.nodes.filter((node) => node.parentId === null);
    if (roots.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['nodes'],
        message: 'A tree needs at least one root node',
      });
    }
    tree.nodes.forEach((node, index) => {
      if (node.parentId !== null && !byId.has(node.parentId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes', index, 'parentId'],
          message: `Unknown parent id: ${node.parentId}`,
        });
      }
      let depth = 1;
      let parentId = node.parentId;
      const visited = new Set([node.id]);
      while (parentId !== null && byId.has(parentId)) {
        if (visited.has(parentId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['nodes', index, 'parentId'],
            message: 'Tree contains a parent cycle',
          });
          break;
        }
        visited.add(parentId);
        depth += 1;
        parentId = byId.get(parentId)?.parentId ?? null;
      }
      if (depth > DIAGRAM_LIMITS.treeDepth) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes', index],
          message: `Tree depth exceeds ${DIAGRAM_LIMITS.treeDepth}`,
        });
      }
    });
  });

const BoardCardSchema = z.strictObject({
  id: DiagramIdSchema,
  title: LabelSchema,
  tone: BlockToneSchema.optional(),
});
const BoardColumnSchema = z.strictObject({
  id: DiagramIdSchema,
  title: LabelSchema,
  cards: z.array(BoardCardSchema).max(DIAGRAM_LIMITS.boardCardsPerColumn),
});

export const BoardDiagramSchema = z
  .strictObject({
    type: z.literal('board'),
    ...blockBase,
    columns: z.array(BoardColumnSchema).min(1).max(DIAGRAM_LIMITS.boardColumns),
  })
  .superRefine((board, ctx) => {
    const ids = new Set<string>();
    board.columns.forEach((column, columnIndex) => {
      if (ids.has(column.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['columns', columnIndex, 'id'],
          message: `Duplicate diagram id: ${column.id}`,
        });
      }
      ids.add(column.id);
      column.cards.forEach((card, cardIndex) => {
        if (ids.has(card.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['columns', columnIndex, 'cards', cardIndex, 'id'],
            message: `Duplicate diagram id: ${card.id}`,
          });
        }
        ids.add(card.id);
      });
    });
  });

const TerminalLineSchema = z.strictObject({
  kind: z.enum(['prompt', 'output', 'comment']),
  text: plainText(240),
});

export const TerminalDiagramSchema = z.strictObject({
  type: z.literal('terminal'),
  ...blockBase,
  lines: z.array(TerminalLineSchema).min(1).max(DIAGRAM_LIMITS.terminalLines),
});

export const DiagramSchema = z.discriminatedUnion('type', [
  FlowDiagramSchema,
  TreeDiagramSchema,
  BoardDiagramSchema,
  TerminalDiagramSchema,
]);

export type FlowDiagram = z.infer<typeof FlowDiagramSchema>;
export type TreeDiagram = z.infer<typeof TreeDiagramSchema>;
export type BoardDiagram = z.infer<typeof BoardDiagramSchema>;
export type TerminalDiagram = z.infer<typeof TerminalDiagramSchema>;
export type Diagram = z.infer<typeof DiagramSchema>;

export function diagramJsonPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((value, key) => {
    if (typeof key === 'number') return `${value}[${key}]`;
    return `${value}[${JSON.stringify(String(key))}]`;
  }, '$');
}

export type DiagramParseResult =
  | { success: true; data: Diagram }
  | { success: false; issues: { jsonPath: string; message: string }[] };

/** Parse an untrusted diagram without throwing; diagnostics use blueprint-style JSON paths. */
export function parseDiagram(input: unknown): DiagramParseResult {
  const result = DiagramSchema.safeParse(input);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    issues: result.error.issues.map((issue) => ({
      jsonPath: diagramJsonPath(issue.path),
      message: issue.message,
    })),
  };
}
