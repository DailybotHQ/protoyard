import type { Component } from 'svelte';
import StudioIcon from './StudioIcon.svelte';
import type { DeckStudio } from './studio.svelte.ts';

/**
 * `@protoyard/decks-ui/studio` — Deck Studio (ADR-038), a lazy DevTools tab
 * that edits the deck style and the current slide with a live preview and
 * exports RFC 6902 patches for the source deck JSON.
 *
 *   const studio = createDeckStudio(deck);
 *   // render <DeckApp deck={studio.preview} />, and in mountPrototype:
 *   devtoolsTabs: [deckStudioTab(studio)]
 */
export { createDeckStudio, type DeckStudio } from './studio.svelte.ts';

/** A DevTools tab entry (structurally `DevtoolsTab` from @protoyard/devtools). */
export interface DeckStudioTab {
  id: 'deck-studio';
  label: string;
  icon: Component<{ class?: string }>;
  load: () => Promise<unknown>;
  props: { studio: DeckStudio };
}

/** The tab for `mountPrototype({ devtoolsTabs })`. The panel loads only when the tab opens. */
export function deckStudioTab(studio: DeckStudio): DeckStudioTab {
  return {
    id: 'deck-studio',
    label: 'Deck',
    icon: StudioIcon as unknown as Component<{ class?: string }>,
    load: async () => (await import('./DeckStudioPanel.svelte')).default,
    props: { studio },
  };
}
