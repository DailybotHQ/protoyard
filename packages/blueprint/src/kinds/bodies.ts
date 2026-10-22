import type { z } from 'zod';
import type { ContentKind } from './kind.ts';

/**
 * Body schemas of the content kinds, one per kind, supplied by their engine
 * packages (ADR-036): the deck from `@protoyard/decks/schema`, page and doc
 * from `@protoyard/pages`. A kind without a schema here fails to parse with a
 * "not available in this build yet" issue: there is no loose fallback.
 *
 * Wiring a kind is a static entry in `SHIPPED`, never runtime registration,
 * so untrusted input can never be validated against a schema someone injected.
 */
const SHIPPED: Partial<Record<ContentKind, z.ZodType>> = {};

/** Test-only overrides (see `kinds/testing.ts`); empty outside Vitest. */
const overrides = new Map<ContentKind, z.ZodType>();

/** The body schema for a content kind, or undefined when this build does not ship it. */
export function kindBodySchema(kind: ContentKind): z.ZodType | undefined {
  return overrides.get(kind) ?? SHIPPED[kind];
}

/** @internal Used only by `kinds/testing.ts`. */
export function setKindBodyOverride(kind: ContentKind, schema: z.ZodType | undefined): void {
  if (schema) overrides.set(kind, schema);
  else overrides.delete(kind);
}
