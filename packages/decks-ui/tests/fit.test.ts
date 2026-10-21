import { deckCanvasSize } from '@protoyard/decks';
import { describe, expect, it } from 'vitest';
import { fitDeckCanvas } from '../src/index.ts';

describe('fitDeckCanvas', () => {
  const canvas = deckCanvasSize('16:9');

  it('fills an exact-ratio container with no letterbox', () => {
    expect(fitDeckCanvas({ width: 1920, height: 1080 }, canvas)).toEqual({
      scale: 1.5,
      offsetX: 0,
      offsetY: 0,
    });
  });

  it('letterboxes a tall container vertically', () => {
    const fit = fitDeckCanvas({ width: 640, height: 800 }, canvas);
    expect(fit.scale).toBe(0.5);
    expect(fit.offsetX).toBe(0);
    expect(fit.offsetY).toBe((800 - 360) / 2);
  });

  it('pillarboxes a wide container horizontally', () => {
    const fit = fitDeckCanvas({ width: 3000, height: 720 }, canvas);
    expect(fit.scale).toBe(1);
    expect(fit.offsetX).toBe((3000 - 1280) / 2);
    expect(fit.offsetY).toBe(0);
  });

  it('fits portrait and square canvases', () => {
    expect(fitDeckCanvas({ width: 360, height: 640 }, deckCanvasSize('9:16')).scale).toBe(0.5);
    expect(fitDeckCanvas({ width: 540, height: 900 }, deckCanvasSize('1:1')).scale).toBe(0.5);
  });

  it('renders nothing until the container has a usable size', () => {
    for (const container of [
      { width: 0, height: 720 },
      { width: 1280, height: -1 },
      { width: Number.NaN, height: 720 },
      { width: Number.POSITIVE_INFINITY, height: 720 },
    ]) {
      expect(fitDeckCanvas(container, canvas)).toEqual({ scale: 0, offsetX: 0, offsetY: 0 });
    }
  });
});
