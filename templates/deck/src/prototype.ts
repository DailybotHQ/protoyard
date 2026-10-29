import { type AnyContentBlueprint, defineKindPrototype } from '@protoyard/blueprint/kinds';
import manifest from '../protoyard.json';
import { brandTheme, defaultThemeId } from './brand-theme.ts';
import { deckBlueprint } from './deck-blueprint.ts';

/**
 * The shared minimal runtime for a deck prototype. The brand comes resolved
 * from `brand-theme.ts` (written by `protoyard new`), so the first chunk
 * never loads the palette generator a seed brand needs.
 */
export const definition = defineKindPrototype(
  // AnyContentBlueprint currently expands to an intersection of kind bodies.
  deckBlueprint as unknown as AnyContentBlueprint,
  {
    namespace: manifest.storage.namespace,
    slug: manifest.slug,
    version: manifest.version,
    brandTheme,
    defaultThemeId,
  }
);
