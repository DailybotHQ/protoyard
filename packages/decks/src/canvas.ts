/**
 * The fixed virtual canvas a slide is laid out on (ADR-038). A renderer
 * scales the whole canvas with a transform, so layouts and lint thresholds
 * are expressed in canvas pixels and never depend on the viewer's screen.
 */

export const DECK_ASPECTS = ['16:9', '4:3', '9:16', '1:1'] as const;

export type DeckAspect = (typeof DECK_ASPECTS)[number];

export interface DeckCanvasSize {
  readonly width: number;
  readonly height: number;
}

export const DEFAULT_DECK_ASPECT: DeckAspect = '16:9';

const CANVAS_SIZES: Readonly<Record<DeckAspect, DeckCanvasSize>> = {
  '16:9': { width: 1280, height: 720 },
  '4:3': { width: 1024, height: 768 },
  '9:16': { width: 720, height: 1280 },
  '1:1': { width: 1080, height: 1080 },
};

export function isDeckAspect(value: unknown): value is DeckAspect {
  return typeof value === 'string' && (DECK_ASPECTS as readonly string[]).includes(value);
}

/** The virtual canvas size for an aspect; an unknown value falls back to 16:9. */
export function deckCanvasSize(aspect: unknown = DEFAULT_DECK_ASPECT): DeckCanvasSize {
  return CANVAS_SIZES[isDeckAspect(aspect) ? aspect : DEFAULT_DECK_ASPECT];
}

/**
 * Minimum rendered text sizes on the canvas, in canvas pixels: body text and
 * labels (captions, axis ticks, footers). Layout CSS honors them and deck lint
 * checks them, so both read this one source.
 */
export const DECK_TEXT_MINIMUMS = { bodyPx: 24, labelPx: 18 } as const;
