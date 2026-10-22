import { DeckBodySchema } from './deck.ts';
import { DocBodySchema } from './doc.ts';
import {
  contentBlueprintSchema,
  type DeckBlueprint,
  type DocBlueprint,
  type PageBlueprint,
} from './envelope.ts';
import { PageBodySchema } from './page.ts';

/**
 * `@protoyard/blueprint/kinds/parse` — synchronous parsers for one content
 * kind, for code that already knows its kind and ships its body schema
 * anyway: a generated deck, page or doc prototype. Each validates exactly
 * what `parseAnyBlueprint` validates for that kind (the same envelope and body
 * schema) and throws a `ZodError` on failure.
 *
 * `parseAnyBlueprint` loads the body schema on demand. Awaiting it at a
 * module's top level deadlocks a single-chunk build (the Claude artifact
 * target): the dynamic import resolves to a facade that re-imports the chunk
 * still waiting on it. These parsers import the schema statically instead.
 * The package has no side effects, so a deck prototype keeps only the deck
 * schema. The universal player never imports this module.
 */

export function parseDeckBlueprint(input: unknown): DeckBlueprint {
  return contentBlueprintSchema('deck', DeckBodySchema).parse(input) as DeckBlueprint;
}

export function parsePageBlueprint(input: unknown): PageBlueprint {
  return contentBlueprintSchema('page', PageBodySchema).parse(input) as PageBlueprint;
}

export function parseDocBlueprint(input: unknown): DocBlueprint {
  return contentBlueprintSchema('doc', DocBodySchema).parse(input) as DocBlueprint;
}
