import type { Block, BlockType } from '../schema/index.ts';
import type { BlockFamily } from '../schema/vocabulary.ts';

/**
 * Authoring metadata for one block type (USE WHEN / DON'T USE WHEN / limits /
 * a11y / examples). Agents, MCP and deck lint read this data instead of prose.
 */
export interface BlockCatalogEntry {
  type: BlockType;
  /** Short editor label. */
  label: string;
  family: BlockFamily;
  /** Situations where this block is the right choice. */
  useWhen: readonly string[];
  /** Situations where another block (or none) is better. */
  dontUseWhen: readonly string[];
  /** Human-readable caps from the schema (counts, lengths, nesting). */
  limits: readonly string[];
  /** How the block stays usable with keyboard, screen readers and contrast. */
  a11y: string;
  /** Smallest valid instance (required fields only when possible). */
  exampleMinimal: Block;
  /** Richer valid instance showing common optional fields. */
  exampleRich: Block;
}

/** A JSON path segment in a block authoring diagnostic. */
export type BlockDiagnosticPath = string | number;

/**
 * One stable, actionable diagnostic from {@link validateBlocksForAuthoring}.
 * Matches the blueprint authoring shape (`jsonPath` + `hint`).
 */
export interface BlockAuthoringDiagnostic {
  /** Stable machine-readable category. */
  code: string;
  path: BlockDiagnosticPath[];
  /** JSONPath-style rendering, e.g. `$[0]["href"]`. */
  jsonPath: string;
  message: string;
  /** A next step an author or agent can take. */
  hint: string;
}

/** Full block-list validity and diagnostics for authoring tools. */
export interface BlockAuthoringValidation {
  valid: boolean;
  diagnostics: BlockAuthoringDiagnostic[];
}
