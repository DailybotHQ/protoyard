import { BUILTIN_THEMES, FONT_CATALOG, THEME_LIBRARY_META } from '@protoyard/themes';
import { DECK_BACKGROUND_PRESET_IDS } from '../backgrounds/schema.ts';
import { DECK_ASPECTS } from '../canvas.ts';

/**
 * Choices the panel offers, from the same registries the renderer resolves.
 * Its own module, apart from the edit model in `edits.ts`: the theme list
 * includes the library catalog, so only the lazily loaded Deck Studio panel
 * pulls it into a bundle, not a deck's first chunk.
 */
export function deckStudioOptions() {
  return {
    themes: [
      ...BUILTIN_THEMES.map((theme) => ({ id: theme.id, label: theme.name })),
      ...THEME_LIBRARY_META.map((meta) => ({ id: meta.id, label: meta.name })),
    ],
    fontPairs: FONT_CATALOG.map((pair) => ({ id: pair.id, label: pair.label })),
    aspects: [...DECK_ASPECTS],
    motions: ['full', 'subtle', 'none'] as const,
    backgrounds: [...DECK_BACKGROUND_PRESET_IDS],
    progress: ['none', 'top', 'bottom'] as const,
    transitions: ['none', 'fade', 'slide', 'zoom', 'morph'] as const,
  };
}
