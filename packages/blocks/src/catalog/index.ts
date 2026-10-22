/**
 * `@protoyard/blocks/catalog` — BLOCK_CATALOG authoring metadata.
 *
 * Labels, families, use-when / don't-use-when, limits, a11y notes and
 * minimal/rich examples for every block type. `validateBlocksForAuthoring`
 * returns `{ jsonPath, message, hint }` diagnostics for agents, MCP and
 * deck lint. Runtime renderers must not import this subpath.
 */
export {
  BLOCK_CATALOG,
  BLOCK_CATALOG_LIST,
  getBlockCatalogEntry,
} from './entries.ts';
export { MINIMAL_EXAMPLES, RICH_EXAMPLES } from './examples.ts';
export type {
  BlockAuthoringDiagnostic,
  BlockAuthoringValidation,
  BlockCatalogEntry,
  BlockDiagnosticPath,
} from './types.ts';
export { renderBlockCatalogMarkdown, validateBlocksForAuthoring } from './validate.ts';
