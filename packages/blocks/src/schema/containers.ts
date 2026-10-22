import { z } from 'zod';
import type { Block } from './index.ts';
import { BlockSchema } from './index.ts';
import {
  BLOCK_CONTENT_LIMITS,
  BlockIdSchema,
  blockBase,
  IconNameSchema,
  plainText,
} from './primitives.ts';

/**
 * Container blocks hold other blocks: `columns` side by side, `tabs` one
 * panel at a time, `reveal` behind a button. Any mix of them nests at most
 * `BLOCK_CONTENT_LIMITS.containerDepth` (3) deep. `BlockSchema` is reached
 * lazily, so this module and the union can import each other.
 */

/** Blocks inside one column, tab panel or reveal. */
const childBlocks = () =>
  z
    .array(z.lazy((): z.ZodType<Block> => BlockSchema))
    .min(1)
    .max(BLOCK_CONTENT_LIMITS.blocksPerColumn);

export const CONTAINER_TYPES = ['columns', 'tabs', 'reveal'] as const;

type ContainerBlock = Extract<Block, { type: (typeof CONTAINER_TYPES)[number] }>;

/** The direct children of a container block, or `[]` for any other block. */
export function childrenOf(block: Block): readonly (readonly Block[])[] {
  if (block.type === 'columns') return block.columns;
  if (block.type === 'tabs') return block.panels.map((panel) => panel.blocks);
  if (block.type === 'reveal') return [block.blocks];
  return [];
}

/** The path segments from a container to each child list, matching `childrenOf`. */
export function childPaths(block: Block): (string | number)[][] {
  if (block.type === 'columns') return block.columns.map((_, i) => ['columns', i]);
  if (block.type === 'tabs') return block.panels.map((_, i) => ['panels', i, 'blocks']);
  if (block.type === 'reveal') return [['blocks']];
  return [];
}

/** How deep containers nest inside `block` (0 for a leaf block). */
export function containerDepth(block: Block): number {
  let deepest = 0;
  for (const list of childrenOf(block)) {
    for (const child of list) deepest = Math.max(deepest, containerDepth(child));
  }
  return (CONTAINER_TYPES as readonly string[]).includes(block.type) ? deepest + 1 : deepest;
}

function depthCheck(block: ContainerBlock, ctx: z.RefinementCtx, path: string): void {
  if (containerDepth(block) > BLOCK_CONTENT_LIMITS.containerDepth) {
    ctx.addIssue({
      code: 'custom',
      path: [path],
      message: `Containers (columns, tabs, reveal) nest at most ${BLOCK_CONTENT_LIMITS.containerDepth} deep`,
    });
  }
}

export const ColumnsBlockSchema = z
  .strictObject({
    type: z.literal('columns'),
    ...blockBase,
    /** `wide-start` gives the first column twice the width of the others. */
    widths: z.enum(['equal', 'wide-start', 'wide-end']).optional(),
    align: z.enum(['start', 'center']).optional(),
    columns: z.array(childBlocks()).min(2).max(BLOCK_CONTENT_LIMITS.columns),
  })
  .superRefine((block, ctx) => depthCheck(block as ContainerBlock, ctx, 'columns'));

const TabPanelSchema = z.strictObject({
  id: BlockIdSchema,
  label: plainText(40),
  icon: IconNameSchema.optional(),
  blocks: childBlocks(),
});

export const TabsBlockSchema = z
  .strictObject({
    type: z.literal('tabs'),
    ...blockBase,
    /** Tabs remember the open panel, so they need a stable id. */
    id: BlockIdSchema,
    /** Accessible name of the tab list. */
    label: plainText(80),
    panels: z.array(TabPanelSchema).min(2).max(BLOCK_CONTENT_LIMITS.tabPanels),
    /** The panel open at first; defaults to the first one. */
    defaultPanel: BlockIdSchema.optional(),
  })
  .superRefine((block, ctx) => {
    const ids = new Set<string>();
    block.panels.forEach((panel, i) => {
      if (ids.has(panel.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['panels', i, 'id'],
          message: 'Panel ids must be unique',
        });
      }
      ids.add(panel.id);
    });
    if (block.defaultPanel !== undefined && !ids.has(block.defaultPanel)) {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultPanel'],
        message: 'Name one of the panel ids',
      });
    }
    depthCheck(block as ContainerBlock, ctx, 'panels');
  });

export const RevealBlockSchema = z
  .strictObject({
    type: z.literal('reveal'),
    ...blockBase,
    /** A reveal remembers whether it is open, so it needs a stable id. */
    id: BlockIdSchema,
    /** The button text, for example "Show the answer". */
    label: plainText(80),
    /** The button text once open; defaults to `label`. */
    openLabel: plainText(80).optional(),
    blocks: childBlocks(),
    /** Start open (still collapsible). */
    open: z.boolean().optional(),
  })
  .superRefine((block, ctx) => depthCheck(block as ContainerBlock, ctx, 'blocks'));
