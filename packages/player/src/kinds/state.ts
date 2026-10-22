import type { MountEmbed } from '@protoyard/blocks-ui';
import type { DeckBlueprint, DocBlueprint, PageBlueprint } from '@protoyard/blueprint';
import type { DeckStudio } from '@protoyard/decks-ui/studio';

/** A content-kind blueprint the player renders (deck, page or doc). */
export type KindDocument = DeckBlueprint | PageBlueprint | DocBlueprint;

export interface KindAppState {
  blueprint: KindDocument;
  /** The storage namespace (also the block-state document id). */
  namespace: string;
  /** Starts an embedded app block (framed player, app kind only). */
  mountEmbed: MountEmbed;
  /** Deck Studio, only for a deck with DevTools on: the deck renders its live preview. */
  studio?: DeckStudio;
}

/**
 * What the mounted KindApp renders. `mountPrototype` mounts the App component
 * without props, so `bootKind` sets this right before mounting (like
 * `player-blueprint.ts` for apps).
 */
let current: KindAppState | null = null;

export function setKindApp(value: KindAppState): void {
  current = value;
}

export function kindApp(): KindAppState {
  if (!current) throw new Error('bootKind() must set the document before KindApp mounts');
  return current;
}
