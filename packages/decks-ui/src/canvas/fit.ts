import type { DeckCanvasSize } from '@protoyard/decks';

export interface DeckCanvasFit {
  /** The transform scale that fits the canvas inside the container. */
  readonly scale: number;
  /** Letterbox offsets, in container pixels, that center the scaled canvas. */
  readonly offsetX: number;
  readonly offsetY: number;
}

const usable = (n: number) => Number.isFinite(n) && n > 0;

/**
 * Fits a virtual deck canvas inside a container while keeping its aspect
 * (letterboxed, never cropped). A container that has no size yet (hidden,
 * not laid out) gets scale 0, so nothing renders at a wrong size.
 */
export function fitDeckCanvas(
  container: { readonly width: number; readonly height: number },
  canvas: DeckCanvasSize
): DeckCanvasFit {
  if (
    !usable(container.width) ||
    !usable(container.height) ||
    !usable(canvas.width) ||
    !usable(canvas.height)
  ) {
    return { scale: 0, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.min(container.width / canvas.width, container.height / canvas.height);
  return {
    scale,
    offsetX: (container.width - canvas.width * scale) / 2,
    offsetY: (container.height - canvas.height * scale) / 2,
  };
}
