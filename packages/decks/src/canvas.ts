/**
 * The fixed virtual canvas (1280 × 720 for 16:9; 4:3, 9:16 and 1:1) is the
 * deck engine's (`@texuli/deck/engine`). Lint thresholds are in canvas
 * pixels: 24 px body text, 18 px labels.
 */
export {
  DECK_ASPECTS,
  DEFAULT_DECK_ASPECT,
  type DeckAspect,
  type DeckCanvasSize,
  deckCanvasSize,
  isDeckAspect,
} from '@texuli/deck/engine';

/** The canvas-pixel floors text never goes below (the stage's text fit and lint read the same). */
export const DECK_TEXT_MINIMUMS = { bodyPx: 24, labelPx: 18 } as const;
