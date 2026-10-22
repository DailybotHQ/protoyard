// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FAMILIES, gateFamilies, THRESHOLDS_KB } from '../../scripts/bench-blocks.ts';

describe('bench-blocks family thresholds', () => {
  it('defines a ceiling for the root and every lazy family', () => {
    expect(FAMILIES).toEqual([
      'root',
      'text',
      'media',
      'data',
      'structure',
      'code',
      'diagram',
      'interactive',
      'map',
      'embed',
    ]);
    expect(THRESHOLDS_KB).toMatchObject({
      root: 3,
      text: 6,
      media: 4,
      data: 5,
      structure: 8,
      code: 6,
      diagram: 6,
      interactive: 10,
      embed: 2,
    });
  });

  it('passes a family exactly at its byte ceiling and fails above it', () => {
    const atLimit = gateFamilies({
      root: 3000,
      text: 6000,
      media: 4000,
      data: 5000,
      structure: 8000,
      code: 6000,
      diagram: 6000,
      interactive: 10_000,
      map: 4000,
      embed: 2000,
    });
    expect(atLimit.every((gate) => gate.ok)).toBe(true);

    const over = gateFamilies({
      root: 3001,
      text: 6000,
      media: 4000,
      data: 5000,
      structure: 8000,
      code: 6000,
      diagram: 6000,
      interactive: 10_000,
      map: 4000,
      embed: 2000,
    });
    expect(over.find((gate) => gate.family === 'root')).toMatchObject({
      bytes: 3001,
      limitBytes: 3000,
      ok: false,
    });
  });

  it('fails when a required family measurement is missing', () => {
    expect(gateFamilies({ text: 1 }).find((gate) => gate.family === 'root')).toMatchObject({
      ok: false,
    });
  });
});
