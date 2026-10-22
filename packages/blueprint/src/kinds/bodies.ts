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
/** Test-only overrides (see `kinds/testing.ts`); empty outside Vitest. */
const overrides = new Map<ContentKind, z.ZodType>();

/** Load only the requested kind body, keeping all content schemas off the app path. */
export async function kindBodySchema(kind: ContentKind): Promise<z.ZodType | undefined> {
  const override = overrides.get(kind);
  if (override) return override;

  switch (kind) {
    case 'deck':
      return (await import('./deck.ts')).DeckBodySchema;
    case 'page':
      return (await import('./page.ts')).PageBodySchema;
    case 'doc':
      return (await import('./doc.ts')).DocBodySchema;
  }
}

/** @internal Used only by `kinds/testing.ts`. */
export function setKindBodyOverride(kind: ContentKind, schema: z.ZodType | undefined): void {
  if (schema) overrides.set(kind, schema);
  else overrides.delete(kind);
}
