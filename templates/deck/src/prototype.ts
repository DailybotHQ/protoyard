import type { AnyContentBlueprint } from '@protoyard/blueprint/kinds';
import { defineKindRuntime } from '@protoyard/blueprint/kinds';
import manifest from '../protoyard.json';
import { deckBlueprint } from './deck-blueprint.ts';

/** The shared minimal runtime for a generated deck prototype. */
export const definition = defineKindRuntime(
  // AnyContentBlueprint currently expands to an intersection of kind bodies.
  deckBlueprint as unknown as AnyContentBlueprint,
  {
    namespace: manifest.storage.namespace,
    slug: manifest.slug,
    version: manifest.version,
  }
);
