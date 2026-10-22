import type { z } from 'zod';
import { setKindBodyOverride } from './bodies.ts';
import type { ContentKind } from './kind.ts';

/**
 * Test-only: validates a content kind against `schema` until the returned
 * function runs. Lets envelope tests exercise deck, page and doc before their
 * engine schemas are wired. Refuses to run outside Vitest, and it is not
 * exported from the package entry.
 */
export function withKindBodySchemaForTesting(kind: ContentKind, schema: z.ZodType): () => void {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  if (!env?.VITEST) {
    throw new Error('withKindBodySchemaForTesting is only available under Vitest.');
  }
  setKindBodyOverride(kind, schema);
  return () => setKindBodyOverride(kind, undefined);
}
