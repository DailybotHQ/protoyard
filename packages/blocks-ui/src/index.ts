/**
 * `@protoyard/blocks-ui` — Svelte 5 renderers for the shared content blocks
 * (ADR-037). The root entry will hold only the small dispatcher
 * (`BlockRenderer`) and the host context (T-blocks-ui-renderer-core of
 * PLAN_005_create_anything_decks_and_kits). Each family renders from its own
 * lazy subpath (`@protoyard/blocks-ui/text`, `/data`…), and the root never
 * re-exports a family, so a document downloads only what its blocks use.
 */
export type { BlockFamily, BlockTone } from '@protoyard/blocks';
