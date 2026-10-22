import type { DeckPatchOperation } from '@protoyard/decks/patch';
import type { Deck } from '@protoyard/decks/schema';
import { createDeckStudio, type DeckStudio } from '@protoyard/decks-ui/studio';

declare const __PROTOYARD_DEVTOOLS__: boolean;

const DEVTOOLS_BUILT = typeof __PROTOYARD_DEVTOOLS__ !== 'undefined' && __PROTOYARD_DEVTOOLS__;

let activeStudio: DeckStudio | null = null;

/** Keep the patch panel lazy in spirit: Deck Studio state exists only when its tab can be used. */
export function canCreateDeckStudio(devtoolsBuilt: boolean, search: string): boolean {
  return devtoolsBuilt && new URLSearchParams(search).get('devtools') !== '0';
}

export function createTemplateDeckStudio(
  deck: Deck,
  search = typeof location === 'undefined' ? '' : location.search,
  devtoolsBuilt = DEVTOOLS_BUILT
): DeckStudio | null {
  activeStudio = canCreateDeckStudio(devtoolsBuilt, search) ? createDeckStudio(deck) : null;
  return activeStudio;
}

/** Read by App.svelte after main.ts has conditionally created the shared editor state. */
export function getTemplateDeckStudio(): DeckStudio | null {
  return activeStudio;
}

/**
 * Deck Studio edits the deck body, so its patch paths start at `/slides` or
 * `/style`. Prefixing each JSON Pointer targets the `deck` key of blueprint.json.
 */
export function prefixDeckPatchForBlueprint(
  patch: readonly DeckPatchOperation[]
): DeckPatchOperation[] {
  return patch.map((operation) => {
    const path = `/deck${operation.path}`;
    if (operation.op === 'remove') return { ...operation, path };
    return { ...operation, path };
  });
}
