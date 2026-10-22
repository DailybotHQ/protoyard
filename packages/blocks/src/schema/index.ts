import { z } from 'zod';
import {
  BoardDiagramSchema,
  FlowDiagramSchema,
  TerminalDiagramSchema,
  TreeDiagramSchema,
} from '../diagram/schema.ts';
import {
  ColumnsBlockSchema,
  childPaths,
  childrenOf,
  containerDepth,
  RevealBlockSchema,
  TabsBlockSchema,
} from './containers.ts';
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
import {
  CalculatorBlockSchema,
  ChartControlsBlockSchema,
  CounterBlockSchema,
  EmbedAppBlockSchema,
  FormBlockSchema,
  MapBlockSchema,
  PollBlockSchema,
  QuizBlockSchema,
} from './interactive.ts';
import type { BlockReveal } from './primitives.ts';
import type { BlockFamily, BlockTone } from './vocabulary.ts';

export { ColumnsBlockSchema, childrenOf, containerDepth, RevealBlockSchema, TabsBlockSchema };

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
export type PollBlock = z.infer<typeof PollBlockSchema>;
export type QuizBlock = z.infer<typeof QuizBlockSchema>;
export type CalculatorBlock = z.infer<typeof CalculatorBlockSchema>;
export type CounterBlock = z.infer<typeof CounterBlockSchema>;
export type ChartControlsBlock = z.infer<typeof ChartControlsBlockSchema>;
export type MapBlock = z.infer<typeof MapBlockSchema>;
export type EmbedAppBlock = z.infer<typeof EmbedAppBlockSchema>;
export type FormBlock = z.infer<typeof FormBlockSchema>;
export type FlowBlock = z.infer<typeof FlowDiagramSchema>;
export type TreeBlock = z.infer<typeof TreeDiagramSchema>;
export type BoardBlock = z.infer<typeof BoardDiagramSchema>;
export type TerminalBlock = z.infer<typeof TerminalDiagramSchema>;

/** Fields every block may carry; containers are typed by hand because they recurse. */
interface ContainerBase {
  step?: number | undefined;
  reveal?: BlockReveal | undefined;
  tone?: BlockTone | undefined;
}

/** Side-by-side columns of blocks. */
export interface ColumnsBlock extends ContainerBase {
  type: 'columns';
  id?: string | undefined;
  /** `wide-start` gives the first column twice the width of the others. */
  widths?: 'equal' | 'wide-start' | 'wide-end' | undefined;
  align?: 'start' | 'center' | undefined;
  columns: Block[][];
}

/** Panels of blocks, one visible at a time. */
export interface TabsBlock extends ContainerBase {
  type: 'tabs';
  id: string;
  label: string;
  panels: { id: string; label: string; icon?: IconBlock['icon'] | undefined; blocks: Block[] }[];
  defaultPanel?: string | undefined;
}

/** Blocks behind a button, for answers and details. */
export interface RevealBlock extends ContainerBase {
  type: 'reveal';
  id: string;
  label: string;
  openLabel?: string | undefined;
  blocks: Block[];
  open?: boolean | undefined;
}

/** Any block, discriminated on `type`. */
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
  | ColumnsBlock
  | TabsBlock
  | RevealBlock
  | PollBlock
  | QuizBlock
  | CalculatorBlock
  | CounterBlock
  | ChartControlsBlock
  | MapBlock
  | EmbedAppBlock
  | FormBlock
  | FlowBlock
  | TreeBlock
  | BoardBlock
  | TerminalBlock;

export type BlockType = Block['type'];

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
  TabsBlockSchema,
  RevealBlockSchema,
  PollBlockSchema,
  QuizBlockSchema,
  CalculatorBlockSchema,
  CounterBlockSchema,
  ChartControlsBlockSchema,
  MapBlockSchema,
  EmbedAppBlockSchema,
  FormBlockSchema,
  FlowDiagramSchema,
  TreeDiagramSchema,
  BoardDiagramSchema,
  TerminalDiagramSchema,
]);

/**
 * The render family of every block type (`@protoyard/blocks-ui/<family>`).
 * `form` renders in the interactive family through a host-provided form
 * renderer (`@protoyard/pages-ui/form` owns the form UI and responses).
 */
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
  tabs: 'interactive',
  reveal: 'interactive',
  poll: 'interactive',
  quiz: 'interactive',
  calculator: 'interactive',
  counter: 'interactive',
  'chart-controls': 'interactive',
  form: 'interactive',
  map: 'map',
  'embed-app': 'embed',
  flow: 'diagram',
  tree: 'diagram',
  board: 'diagram',
  terminal: 'diagram',
} as const satisfies Record<BlockType, BlockFamily>);

/** Every block type, in catalog order. */
export const BLOCK_TYPES = Object.freeze(Object.keys(BLOCK_TYPE_FAMILY)) as readonly BlockType[];

/** Block types that keep viewer state and therefore require an `id`. */
export const STATEFUL_BLOCK_TYPES = Object.freeze([
  'tabs',
  'reveal',
  'poll',
  'quiz',
  'calculator',
  'counter',
  'chart-controls',
  'map',
  'embed-app',
  'form',
] as const satisfies readonly BlockType[]);

export type StatefulBlockType = (typeof STATEFUL_BLOCK_TYPES)[number];
export type StaticBlockType = Exclude<BlockType, StatefulBlockType>;

/** Block types without viewer state: content, media, data and `columns`. */
export const STATIC_BLOCK_TYPES = Object.freeze(
  BLOCK_TYPES.filter((type) => !(STATEFUL_BLOCK_TYPES as readonly string[]).includes(type))
) as readonly StaticBlockType[];

/** Calls `visit` on every block, depth-first, including blocks inside containers. */
export function forEachBlock(
  blocks: readonly Block[],
  visit: (block: Block, path: (string | number)[]) => void,
  path: (string | number)[] = []
): void {
  blocks.forEach((block, i) => {
    const here = [...path, i];
    visit(block, here);
    const paths = childPaths(block);
    childrenOf(block).forEach((list, l) => {
      forEachBlock(list, visit, [...here, ...(paths[l] as (string | number)[])]);
    });
  });
}

/**
 * A list of blocks: a slide region, a page section or a doc body. Block ids
 * must be unique across the list and every container nested in it, because
 * deep links and interactive state address blocks by id.
 */
export const BlockListSchema = z.array(BlockSchema).superRefine((blocks, ctx) => {
  const seen = new Map<string, string>();
  forEachBlock(blocks, (block, path) => {
    const id = 'id' in block ? block.id : undefined;
    if (id === undefined) return;
    const first = seen.get(id);
    if (first !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: [...path, 'id'],
        message: `Duplicate block id "${id}" (first used at ${first})`,
      });
    } else {
      seen.set(id, toJsonPath(path));
    }
  });
});

/** One block list inside a larger document (a deck slide or a page section). */
export interface DocumentBlockList {
  /** Path of the list within the document, e.g. `['slides', 3, 'blocks']`. */
  path: (string | number)[];
  blocks: readonly Block[];
}

/**
 * Block ids must be unique across a whole document, not just within one list:
 * interactive state, form responses and an embedded app's storage namespace
 * are all keyed by block id, so two blocks sharing an id on different slides
 * or sections would read and write each other's data. With `crossListOnly`,
 * duplicates inside one list are left to `BlockListSchema`, which reports them.
 */
export function duplicateBlockIdIssues(
  lists: readonly DocumentBlockList[],
  options: { crossListOnly?: boolean } = {}
): { path: (string | number)[]; message: string }[] {
  const seen = new Map<string, { list: number; at: string }>();
  const issues: { path: (string | number)[]; message: string }[] = [];
  lists.forEach((list, index) => {
    forEachBlock(list.blocks, (block, path) => {
      const id = 'id' in block ? block.id : undefined;
      if (id === undefined) return;
      const full = [...list.path, ...path];
      const first = seen.get(id);
      if (!first) {
        seen.set(id, { list: index, at: toJsonPath(full) });
        return;
      }
      if (options.crossListOnly && first.list === index) return;
      issues.push({
        path: [...full, 'id'],
        message: `Duplicate block id "${id}" (first used at ${first.at}); block ids must be unique across the document`,
      });
    });
  });
  return issues;
}

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

/** Zod issues as path-addressed block issues. */
export function blockIssues(error: z.ZodError): BlockIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map((segment) => (typeof segment === 'number' ? segment : String(segment))),
    jsonPath: toJsonPath(issue.path),
    message: issue.message,
  }));
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
