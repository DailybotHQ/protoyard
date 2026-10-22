import { DIAGRAM_LIMITS } from './diagram/schema.ts';
import { MEDIA_DATA_URI_MAX_BYTES } from './schema/media.ts';
import { BLOCK_CONTENT_LIMITS } from './schema/primitives.ts';

/** Hard upper bounds for block documents accepted from files, links or paste. */
export const BLOCK_LIMITS = Object.freeze({
  /** Serialized UTF-8 JSON bytes, including embedded media data URIs. */
  maxBytes: 1024 * 1024,
  /** JSON object/array nesting in one block document. */
  maxDepth: 12,
  maxBlocks: 2_000,
  maxContainerDepth: BLOCK_CONTENT_LIMITS.containerDepth,
  maxDataUriBytes: MEDIA_DATA_URI_MAX_BYTES,
  maxDocumentDataUriBytes: 512 * 1024,
  /** General guard ceiling; the individual schemas impose smaller field caps. */
  maxTextLength: BLOCK_CONTENT_LIMITS.code,
  maxTableCells: BLOCK_CONTENT_LIMITS.tableColumns * BLOCK_CONTENT_LIMITS.tableRows,
  flowNodes: DIAGRAM_LIMITS.flowNodes,
  treeNodes: DIAGRAM_LIMITS.treeNodes,
  treeDepth: DIAGRAM_LIMITS.treeDepth,
  boardColumns: DIAGRAM_LIMITS.boardColumns,
  boardCardsPerColumn: DIAGRAM_LIMITS.boardCardsPerColumn,
  terminalLines: DIAGRAM_LIMITS.terminalLines,
});

export type BlockLimits = { [Key in keyof typeof BLOCK_LIMITS]: number };
