import { type Deck, DeckSchema } from '@protoyard/decks/schema';
import type { z } from 'zod';
import { safeParseBlueprint } from '../schema.ts';
import {
  checkContentLimits,
  containsEmbeddedApp,
  DEFAULT_UNTRUSTED_DOCUMENT_LIMITS,
} from './limits.ts';

/**
 * Deck-wide slide and outline references are enforced by the engine schema. The explicit type keeps
 * the published declarations portable (no inferred reference into another package's zod copy).
 */
export const DeckBodySchema: z.ZodType<Deck> = DeckSchema.superRefine((deck, ctx) => {
  const checked = checkContentLimits({ deck }, 'deck', DEFAULT_UNTRUSTED_DOCUMENT_LIMITS);
  if (checked.issue) return;
  for (const embedded of checked.embeddedApps) {
    // `DeckBodySchema` is already mounted under the root `deck` property.
    const bodyPath = embedded.path.slice(1);
    if (containsEmbeddedApp(embedded.app)) {
      ctx.addIssue({
        code: 'custom',
        path: bodyPath,
        message: 'An embedded app cannot embed another app (one level only).',
      });
      continue;
    }
    const parsed = safeParseBlueprint(embedded.app);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({
          code: 'custom',
          path: [...bodyPath, ...issue.path],
          message: `Embedded app is invalid: ${issue.message}`,
        });
      }
    }
  }
});
export type DeckBody = Deck;
