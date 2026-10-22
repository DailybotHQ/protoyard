/**
 * `@protoyard/blocks` — the framework-free engine for Protoyard's shared
 * content blocks (ADR-037). Decks, pages and docs compose the same bounded,
 * data-only blocks; `@protoyard/blocks-ui` renders them.
 *
 * The root entry holds the block vocabulary and the block schemas that every
 * subpath and renderer shares. Heavier engines stay behind their own subpaths
 * (`./formula`, `./interactive`, `./code`, `./diagram`, `./catalog`).
 */

export type { AiChartSpec as ChartSpec } from '@protoyard/ai';
export { type ChartSpecResult, ChartSpecSchema, parseChartSpec } from '@protoyard/ai/chart';
export { BLOCK_ICONS, type BlockIcon, isBlockIcon } from './icons.ts';
export {
  CalloutBlockSchema,
  CardsBlockSchema,
  ChartBlockSchema,
  CODE_LANGUAGES,
  CodeBlockSchema,
  ComparisonBlockSchema,
  CtaBlockSchema,
  DividerBlockSchema,
  HeadingBlockSchema,
  IconBlockSchema,
  ImageBlockSchema,
  ListBlockSchema,
  PeopleBlockSchema,
  parseLineSpec,
  QuoteBlockSchema,
  StatBlockSchema,
  StepsBlockSchema,
  TableBlockSchema,
  TextBlockSchema,
  TimelineBlockSchema,
  VideoBlockSchema,
} from './schema/content.ts';
export {
  BLOCK_TYPE_FAMILY,
  BLOCK_TYPES,
  type Block,
  type BlockIssue,
  BlockListSchema,
  type BlockParseResult,
  BlockSchema,
  type BlockType,
  blockIssues,
  type CalloutBlock,
  type CardsBlock,
  type ChartBlock,
  type CodeBlock,
  type ColumnsBlock,
  ColumnsBlockSchema,
  type ComparisonBlock,
  type CtaBlock,
  containerDepth,
  type DividerBlock,
  forEachBlock,
  type HeadingBlock,
  type IconBlock,
  type ImageBlock,
  type ListBlock,
  type PeopleBlock,
  type QuoteBlock,
  type StatBlock,
  type StepsBlock,
  safeParseBlock,
  safeParseBlocks,
  type TableBlock,
  type TextBlock,
  type TimelineBlock,
  toJsonPath,
  type VideoBlock,
} from './schema/index.ts';
export {
  AvatarIdSchema,
  base64DecodedBytes,
  classifyMediaSource,
  ImageSourceSchema,
  MEDIA_DATA_URI_MAX_BYTES,
  type MediaKind,
  type MediaSourceKind,
  VideoSourceSchema,
} from './schema/media.ts';
export {
  BLOCK_CONTENT_LIMITS,
  BLOCK_REVEALS,
  BlockIdSchema,
  BlockRevealSchema,
  BlockStepSchema,
  BlockToneSchema,
  IconNameSchema,
  LinkHrefSchema,
} from './schema/primitives.ts';
export {
  BLOCK_FAMILIES,
  BLOCK_TONES,
  type BlockFamily,
  type BlockTone,
  isBlockFamily,
  isBlockTone,
} from './schema/vocabulary.ts';
