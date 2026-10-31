import type { KindLoaders } from './renderers.ts';

/**
 * The deck renderer (decks-ui `DeckApp`) and Deck Studio, for `deck.html`
 * and `index.html` only: a page or doc page never names them, so its single
 * file never carries them (see `renderers.ts`).
 */
export const DECK_LOADERS: KindLoaders = {
  loadRenderer: () =>
    Promise.all([import('./content.css'), import('@protoyard/decks-ui/app')]).then(
      ([, module]) => module
    ),
  loadDeckStudio: () => import('@protoyard/decks-ui/studio'),
};
