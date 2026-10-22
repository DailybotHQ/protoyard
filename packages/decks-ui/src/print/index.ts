/**
 * `@protoyard/decks-ui/print` — print and PDF: one slide per page at the
 * virtual canvas size, every step visible, chrome hidden, optional notes.
 *
 * Enter with `?print=1` (add `&notes=1` for speaker notes), the print button,
 * or Ctrl/Cmd+P (DeckApp swaps to this layout on `beforeprint`).
 */
export { default as DeckPrint } from './DeckPrint.svelte';
export {
  type DeckPrintFlags,
  deckPrintSearch,
  parseDeckPrintFlags,
} from './detect.ts';
export { default as PrintButton } from './PrintButton.svelte';

/** Subpath id for package-shape and lazy loaders. */
export const PRINT_UI_SUBPATH = 'print' as const;
