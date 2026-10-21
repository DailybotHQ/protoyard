/**
 * `@protoyard/blocks` — the framework-free engine for Protoyard's shared
 * content blocks (ADR-037). Decks, pages and docs compose the same bounded,
 * data-only blocks; `@protoyard/blocks-ui` renders them.
 *
 * The root entry holds the block vocabulary that every subpath and renderer
 * shares. Block schemas, limits and the untrusted-input guard land here in
 * later PLAN_005 tasks; heavier engines stay behind their own subpaths
 * (`./formula`, `./interactive`, `./code`, `./diagram`, `./catalog`).
 */

/**
 * Colors in block data are tones, never CSS, hex values or style strings.
 * Renderers map each tone to theme tokens, so contrast holds in every theme.
 */
export const BLOCK_TONES = ['neutral', 'accent', 'info', 'success', 'warning', 'danger'] as const;

export type BlockTone = (typeof BLOCK_TONES)[number];

/**
 * Render families. Each one is a lazy `@protoyard/blocks-ui/<family>` subpath,
 * so a document downloads only the families its blocks use.
 */
export const BLOCK_FAMILIES = [
  'text',
  'media',
  'data',
  'structure',
  'code',
  'diagram',
  'interactive',
  'map',
  'embed',
] as const;

export type BlockFamily = (typeof BLOCK_FAMILIES)[number];

/** True when `value` is one of the block tones. */
export function isBlockTone(value: unknown): value is BlockTone {
  return typeof value === 'string' && (BLOCK_TONES as readonly string[]).includes(value);
}

/** True when `value` is one of the render families. */
export function isBlockFamily(value: unknown): value is BlockFamily {
  return typeof value === 'string' && (BLOCK_FAMILIES as readonly string[]).includes(value);
}
