import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { FONT_CATALOG, getFontPairing, loadVariableFont } from '../src/fonts.ts';

const css = readFileSync(resolve(import.meta.dirname, '../src/fonts.css'), 'utf8');

describe('font catalog', () => {
  it('provides the curated system-first pairing categories without network URLs', () => {
    expect(FONT_CATALOG.map(({ id }) => id)).toEqual([
      'system',
      'humanist',
      'geometric',
      'grotesk',
      'editorial',
      'rounded',
      'condensed',
      'mono',
    ]);
    expect(
      FONT_CATALOG.every(({ fontFamily, fontFamilyHeading, fontFamilyMono }) =>
        [fontFamily, fontFamilyHeading, fontFamilyMono].every((family) =>
          family.startsWith('var(--tx-font-stack-')
        )
      )
    ).toBe(true);
    expect(getFontPairing('editorial')?.fontFamilyHeading).toContain('editorial-heading');
    expect(getFontPairing('missing')).toBeUndefined();
    expect(css).toContain('--tx-font-stack-editorial-heading:');
    expect(css).toContain('--tx-font-stack-condensed-sans:');
    expect(css).toContain(
      '--py-font-stack-editorial-heading: var(--tx-font-stack-editorial-heading);'
    );
    expect(css).not.toMatch(/https?:\/\//);
    expect(css).not.toContain('@import');
  });

  it('loads an optional same-origin variable face only when asked', async () => {
    const add = vi.fn();
    const target = { baseURI: 'https://prototype.example/', fonts: { add } } as unknown as Document;
    const load = vi.fn(async function (this: FakeFontFace) {
      return this;
    });
    class FakeFontFace {
      family: string;
      source: string;
      descriptors: FontFaceDescriptors;

      constructor(family: string, source: string, descriptors: FontFaceDescriptors) {
        this.family = family;
        this.source = source;
        this.descriptors = descriptors;
      }

      load = load;
    }
    vi.stubGlobal('FontFace', FakeFontFace);
    try {
      const face = await loadVariableFont(
        { family: 'Studio Sans', src: '/assets/studio.woff2' },
        target
      );
      const mockFace = face as unknown as FakeFontFace;
      expect(face.family).toBe('Studio Sans');
      expect(mockFace.source).toContain('/assets/studio.woff2');
      expect(mockFace.descriptors).toMatchObject({ display: 'swap', weight: '100 900' });
      expect(load).toHaveBeenCalledOnce();
      expect(add).toHaveBeenCalledWith(face);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects remote or non-woff2 font sources', async () => {
    const target = {
      baseURI: 'https://prototype.example/',
      fonts: { add: vi.fn() },
    } as unknown as Document;
    await expect(
      loadVariableFont({ family: 'Remote', src: 'https://fonts.example/font.woff2' }, target)
    ).rejects.toThrow(/same-origin/);
    await expect(
      loadVariableFont({ family: 'Wrong type', src: '/assets/font.ttf' }, target)
    ).rejects.toThrow(/same-origin/);
  });
});
