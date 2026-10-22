import { z } from 'zod';
import {
  CalloutBlockSchema,
  CardsBlockSchema,
  ChartBlockSchema,
  CodeBlockSchema,
  ComparisonBlockSchema,
  CtaBlockSchema,
  DividerBlockSchema,
  HeadingBlockSchema,
  IconBlockSchema,
  ImageBlockSchema,
  ListBlockSchema,
  PeopleBlockSchema,
  QuoteBlockSchema,
  StatBlockSchema,
  StepsBlockSchema,
  TableBlockSchema,
  TextBlockSchema,
  TimelineBlockSchema,
  VideoBlockSchema,
} from './content.ts';
import { BLOCK_CONTENT_LIMITS, blockBase } from './primitives.ts';
import type { BlockFamily } from './vocabulary.ts';

export type HeadingBlock = z.infer<typeof HeadingBlockSchema>;
export type TextBlock = z.infer<typeof TextBlockSchema>;
export type ListBlock = z.infer<typeof ListBlockSchema>;
export type QuoteBlock = z.infer<typeof QuoteBlockSchema>;
export type CalloutBlock = z.infer<typeof CalloutBlockSchema>;
export type DividerBlock = z.infer<typeof DividerBlockSchema>;
export type ImageBlock = z.infer<typeof ImageBlockSchema>;
export type VideoBlock = z.infer<typeof VideoBlockSchema>;
export type PeopleBlock = z.infer<typeof PeopleBlockSchema>;
export type StatBlock = z.infer<typeof StatBlockSchema>;
export type TableBlock = z.infer<typeof TableBlockSchema>;
export type ChartBlock = z.infer<typeof ChartBlockSchema>;
export type CodeBlock = z.infer<typeof CodeBlockSchema>;
export type TimelineBlock = z.infer<typeof TimelineBlockSchema>;
export type StepsBlock = z.infer<typeof StepsBlockSchema>;
export type ComparisonBlock = z.infer<typeof ComparisonBlockSchema>;
export type CardsBlock = z.infer<typeof CardsBlockSchema>;
export type IconBlock = z.infer<typeof IconBlockSchema>;
export type CtaBlock = z.infer<typeof CtaBlockSchema>;

/** Side-by-side columns of blocks. Columns may nest, at most three deep. */
export type ColumnsBlock = {
  type: 'columns';
  id?: string | undefined;
  step?: number | undefined;
  reveal?: HeadingBlock['reveal'];
  tone?: HeadingBlock['tone'];
  /** `wide-start` gives the first column twice the width of the others. */
  widths?: 'equal' | 'wide-start' | 'wide-end' | undefined;
  /** Vertical alignment of the columns. */
  align?: 'start' | 'center' | undefined;
  columns: Block[][];
};

/** Any content block, discriminated on `type`. */
export type Block =
  | HeadingBlock
  | TextBlock
  | ListBlock
  | QuoteBlock
  | CalloutBlock
  | DividerBlock
  | ImageBlock
  | VideoBlock
  | PeopleBlock
  | StatBlock
  | TableBlock
  | ChartBlock
  | CodeBlock
  | TimelineBlock
  | StepsBlock
  | ComparisonBlock
  | CardsBlock
  | IconBlock
  | CtaBlock
  | ColumnsBlock;

export type BlockType = Block['type'];

/** How deep `columns` blocks nest inside `block` (0 for a leaf block). */
export function containerDepth(block: Block): number {
  if (block.type !== 'columns') return 0;
  let deepest = 0;
  for (const column of block.columns) {
    for (const child of column) deepest = Math.max(deepest, containerDepth(child));
  }
  return deepest + 1;
}

export const ColumnsBlockSchema = z
  .strictObject({
    type: z.literal('columns'),
    ...blockBase,
    widths: z.enum(['equal', 'wide-start', 'wide-end']).optional(),
    align: z.enum(['start', 'center']).optional(),
    columns: z
      .array(
        z
          .array(z.lazy((): z.ZodType<Block> => BlockSchema))
          .min(1)
          .max(BLOCK_CONTENT_LIMITS.blocksPerColumn)
      )
      .min(2)
      .max(BLOCK_CONTENT_LIMITS.columns),
  })
  .superRefine((block, ctx) => {
    if (containerDepth(block) > BLOCK_CONTENT_LIMITS.containerDepth) {
      ctx.addIssue({
        code: 'custom',
        path: ['columns'],
        message: `Columns nest at most ${BLOCK_CONTENT_LIMITS.containerDepth} deep`,
      });
    }
  });

/** One block of any type, validated strictly. */
export const BlockSchema: z.ZodType<Block> = z.discriminatedUnion('type', [
  HeadingBlockSchema,
  TextBlockSchema,
  ListBlockSchema,
  QuoteBlockSchema,
  CalloutBlockSchema,
  DividerBlockSchema,
  ImageBlockSchema,
  VideoBlockSchema,
  PeopleBlockSchema,
  StatBlockSchema,
  TableBlockSchema,
  ChartBlockSchema,
  CodeBlockSchema,
  TimelineBlockSchema,
  StepsBlockSchema,
  ComparisonBlockSchema,
  CardsBlockSchema,
  IconBlockSchema,
  CtaBlockSchema,
  ColumnsBlockSchema,
]);

/** The render family of every block type (`@protoyard/blocks-ui/<family>`). */
export const BLOCK_TYPE_FAMILY = Object.freeze({
  heading: 'text',
  text: 'text',
  list: 'text',
  quote: 'text',
  callout: 'text',
  divider: 'text',
  image: 'media',
  video: 'media',
  people: 'media',
  stat: 'data',
  table: 'data',
  chart: 'data',
  code: 'code',
  timeline: 'structure',
  steps: 'structure',
  comparison: 'structure',
  cards: 'structure',
  icon: 'structure',
  cta: 'structure',
  columns: 'structure',
} as const satisfies Record<BlockType, BlockFamily>);

/** Every block type, in catalog order. */
export const BLOCK_TYPES = Object.freeze(Object.keys(BLOCK_TYPE_FAMILY)) as readonly BlockType[];

/** Calls `visit` on every block, depth-first, including blocks inside columns. */
export function forEachBlock(
  blocks: readonly Block[],
  visit: (block: Block, path: (string | number)[]) => void,
  path: (string | number)[] = []
): void {
  blocks.forEach((block, i) => {
    const here = [...path, i];
    visit(block, here);
    if (block.type === 'columns') {
      block.columns.forEach((column, c) => {
        forEachBlock(column, visit, [...here, 'columns', c]);
      });
    }
  });
}

/**
 * A list of blocks: a slide region, a page section or a doc body. Block ids
 * must be unique across the list and every column nested in it, because deep
 * links and interactive state address blocks by id.
 */
export const BlockListSchema = z.array(BlockSchema).superRefine((blocks, ctx) => {
  const seen = new Map<string, string>();
  forEachBlock(blocks, (block, path) => {
    if (block.id === undefined) return;
    const first = seen.get(block.id);
    if (first !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: [...path, 'id'],
        message: `Duplicate block id "${block.id}" (first used at ${first})`,
      });
    } else {
      seen.set(block.id, toJsonPath(path));
    }
  });
});

/** One validation problem, addressed by a JSONPath-style string. */
export interface BlockIssue {
  path: (string | number)[];
  /** `$[0]["items"][2]["text"]`: keys quoted, as in blueprint authoring diagnostics. */
  jsonPath: string;
  message: string;
}

export type BlockParseResult<T> =
  | { success: true; data: T; issues: [] }
  | { success: false; data: null; issues: BlockIssue[] };

export function toJsonPath(path: readonly PropertyKey[]): string {
  let result = '$';
  for (const segment of path) {
    result += typeof segment === 'number' ? `[${segment}]` : `[${JSON.stringify(String(segment))}]`;
  }
  return result;
}

/** Zod issues as path-addressed block issues; nested union failures are flattened. */
export function blockIssues(error: z.ZodError): BlockIssue[] {
  const issues: BlockIssue[] = [];
  for (const issue of error.issues) {
    issues.push({
      path: issue.path.map((segment) => (typeof segment === 'number' ? segment : String(segment))),
      jsonPath: toJsonPath(issue.path),
      message: issue.message,
    });
  }
  return issues;
}

/** Validates one block. Never throws. */
export function safeParseBlock(input: unknown): BlockParseResult<Block> {
  const result = BlockSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data, issues: [] }
    : { success: false, data: null, issues: blockIssues(result.error) };
}

/** Validates a list of blocks, including id uniqueness. Never throws. */
export function safeParseBlocks(input: unknown): BlockParseResult<Block[]> {
  const result = BlockListSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data, issues: [] }
    : { success: false, data: null, issues: blockIssues(result.error) };
}
