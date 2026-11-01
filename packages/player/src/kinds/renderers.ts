import { DECK_LOADERS } from './renderer-deck.ts';
import { DOC_LOADERS } from './renderer-doc.ts';
import { PAGE_LOADERS } from './renderer-page.ts';

/**
 * How a kind page finds its renderer. Each kind's renderer is a lazy chunk,
 * but a single-file export embeds every chunk its page can reach, lazy or
 * not: a shared module that could import all three would put the doc editor,
 * its Word and PDF writers and the page forms into every deck file. So the
 * shared kind boot (`boot-kind.ts`, `KindApp.svelte`) never imports a
 * renderer: each page hands it its own loaders (`renderer-deck.ts`,
 * `renderer-page.ts`, `renderer-doc.ts`, imported by that page's entry
 * alone), and only `index.html`, which runs every kind, imports this map.
 */
export type KindRendererModule =
  | typeof import('@protoyard/decks-ui/app')
  | typeof import('@protoyard/pages-ui/page')
  | typeof import('@protoyard/pages-ui/doc');

export interface KindLoaders {
  /** The renderer module for the blueprint's kind. */
  loadRenderer: () => Promise<KindRendererModule>;
  /** Deck Studio (a deck with DevTools on); absent on the page and doc pages. */
  loadDeckStudio?: () => Promise<{
    createDeckStudio: typeof import('@protoyard/decks-ui/studio').createDeckStudio;
    deckStudioTab: typeof import('@protoyard/decks-ui/studio').deckStudioTab;
  }>;
}

/** Every kind's loaders: `index.html` (which runs any blueprint) only. */
export function loadersFor(kind: 'deck' | 'page' | 'doc'): KindLoaders {
  return kind === 'deck' ? DECK_LOADERS : kind === 'page' ? PAGE_LOADERS : DOC_LOADERS;
}
