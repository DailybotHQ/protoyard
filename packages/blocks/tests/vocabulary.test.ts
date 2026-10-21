// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BLOCK_FAMILIES, BLOCK_TONES, isBlockFamily, isBlockTone } from '../src/index.ts';

describe('block vocabulary', () => {
  it('names the six tones from ADR-037, in order', () => {
    expect(BLOCK_TONES).toEqual(['neutral', 'accent', 'info', 'success', 'warning', 'danger']);
  });

  it('names one render family per blocks-ui subpath, without duplicates', () => {
    expect(new Set(BLOCK_FAMILIES).size).toBe(BLOCK_FAMILIES.length);
    for (const family of BLOCK_FAMILIES) expect(family).toMatch(/^[a-z]+$/);
  });

  it('guards tones and families without accepting CSS or other values', () => {
    expect(isBlockTone('accent')).toBe(true);
    for (const value of ['#ff0000', 'red', 'var(--accent)', 'Accent', '', null, 3, {}]) {
      expect(isBlockTone(value), String(value)).toBe(false);
    }
    expect(isBlockFamily('data')).toBe(true);
    for (const value of ['app', 'Text', '../text', undefined, ['text']]) {
      expect(isBlockFamily(value), String(value)).toBe(false);
    }
  });
});
