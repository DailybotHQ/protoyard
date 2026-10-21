import { describe, expect, it } from 'vitest';
import {
  DECK_ASPECTS,
  DECK_TEXT_MINIMUMS,
  DEFAULT_DECK_ASPECT,
  deckCanvasSize,
  isDeckAspect,
} from '../src/index.ts';
import { DeckAspectSchema } from '../src/schema/index.ts';

describe('deck canvas', () => {
  it('maps each aspect to the ADR-038 virtual canvas', () => {
    expect(deckCanvasSize('16:9')).toEqual({ width: 1280, height: 720 });
    expect(deckCanvasSize('4:3')).toEqual({ width: 1024, height: 768 });
    expect(deckCanvasSize('9:16')).toEqual({ width: 720, height: 1280 });
    expect(deckCanvasSize('1:1')).toEqual({ width: 1080, height: 1080 });
  });

  it('keeps every canvas in its declared ratio', () => {
    for (const aspect of DECK_ASPECTS) {
      const [w, h] = aspect.split(':').map(Number) as [number, number];
      const { width, height } = deckCanvasSize(aspect);
      expect(width * h).toBe(height * w);
    }
  });

  it('falls back to 16:9 for unknown or hostile input', () => {
    expect(DEFAULT_DECK_ASPECT).toBe('16:9');
    for (const value of [undefined, '', '21:9', '__proto__', 'constructor', 16, null, {}]) {
      expect(deckCanvasSize(value)).toEqual({ width: 1280, height: 720 });
    }
    expect(isDeckAspect('toString')).toBe(false);
  });

  it('states the minimum text sizes in canvas pixels', () => {
    expect(DECK_TEXT_MINIMUMS).toEqual({ bodyPx: 24, labelPx: 18 });
  });

  it('validates aspects with the schema enum', () => {
    expect(DeckAspectSchema.parse('9:16')).toBe('9:16');
    expect(DeckAspectSchema.safeParse('21:9').success).toBe(false);
  });
});
