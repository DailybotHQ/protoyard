import {
  BUILTIN_THEMES,
  FONT_CATALOG,
  loadFullLibraryMeta,
  THEME_LIBRARY_META,
} from '@protoyard/themes';
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

/** A theme choice of the panel. */
export interface DeckStudioThemeOption {
  id: string;
  label: string;
}

/**
 * Every theme the panel can offer: the built-ins and the whole library
 * (catalog and Texuli's expanded set, 204 on Texuli 0.9.0). The expanded
 * metadata loads on demand; where it cannot load (a single file that left it
 * out), the list is `deckStudioOptions().themes`.
 */
export async function loadDeckStudioThemes(): Promise<readonly DeckStudioThemeOption[]> {
  const library = await loadFullLibraryMeta();
  return [
    ...BUILTIN_THEMES.map((theme) => ({ id: theme.id, label: theme.name })),
    ...library.map((meta) => ({ id: meta.id, label: meta.name })),
  ];
}
