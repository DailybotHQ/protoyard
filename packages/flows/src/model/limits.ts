/**
 * Hard bounds for flow documents. A flow can arrive from an agent, a share
 * link or a snapshot, so every list, string and tree is capped, and the caps
 * are checked before any recursive parse (see `inspectPlainData`).
 */
export const FLOW_LIMITS = {
  /** Steps in the whole flow, nested branches included. */
  maxSteps: 200,
  /** Branch nesting (a branch inside a branch counts 2). */
  maxStepDepth: 8,
  maxTriggers: 8,
  /** Condition nesting through `all`, `any` and `not`. */
  maxConditionDepth: 6,
  /** Nodes in one condition tree. */
  maxConditionNodes: 64,
  maxQuestions: 30,
  maxChoices: 20,
  maxAudience: 50,
  maxCollections: 10,
  maxStates: 20,
  maxLists: 10,
  maxListItems: 200,
  maxTextParts: 50,
  maxPathSegments: 8,
  maxOperations: 200,
  /** Raw JSON structure, measured before zod sees it. */
  maxDataDepth: 48,
  maxDataNodes: 50_000,
  maxStringLength: 4_000,
} as const;

/** Ids are short slugs, so they are safe in paths, URLs and DOM ids. */
export const FLOW_ID_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
