import { describe, expect, it } from 'vitest';
import { importThemeTokens, type ThemePaletteInput } from '../src/import-tokens.ts';
import { violetTheme } from '../src/presets.ts';

function dtcgTokens() {
  const tokenPalette = (palette: ThemePaletteInput) =>
    Object.fromEntries(
      Object.entries(palette).map(([key, value]) => [key, { $type: 'color', $value: value }])
    );
  return {
    $schema: 'https://design-tokens.github.io/community-group/format/',
    color: {
      light: tokenPalette(violetTheme.light),
      dark: tokenPalette(violetTheme.dark),
    },
    shape: { radius: { $type: 'dimension', $value: '1rem' } },
    typography: {
      fontFamily: { $type: 'fontFamily', $value: 'Inter, sans-serif' },
      headingFontFamily: { $type: 'fontFamily', $value: 'Georgia, serif' },
    },
    density: { $type: 'number', $value: 1.125 },
  };
}

describe('importThemeTokens', () => {
  it('imports DTCG tokens as a validated theme with both AA reports', () => {
    const result = importThemeTokens(dtcgTokens(), { id: 'brand-kit' });

    expect(result.theme).toMatchObject({
      id: 'brand-kit',
      name: 'Brand Kit',
      radius: '1rem',
      density: 1.125,
      fontFamily: 'Inter, sans-serif',
      fontFamilyHeading: 'Georgia, serif',
    });
    expect(result.theme.light).toEqual(violetTheme.light);
    expect(result.theme.dark).toEqual(violetTheme.dark);
    expect(result.contrast.light.passed).toBe(true);
    expect(result.contrast.dark.passed).toBe(true);
    expect(result.contrast.light.total).toBeGreaterThan(0);
  });

  it('accepts a flat palette and defaults optional style tokens', () => {
    const palette: ThemePaletteInput = { ...violetTheme.light };
    const result = importThemeTokens(
      { light: palette, dark: { ...violetTheme.dark }, fontFamily: 'system-ui, sans-serif' },
      { id: 'flat-kit', name: 'Flat Kit' }
    );

    expect(result.theme).toMatchObject({
      id: 'flat-kit',
      name: 'Flat Kit',
      radius: '0.625rem',
      density: 1,
      fontFamily: 'system-ui, sans-serif',
    });
  });

  it('imports token sets with a protoyard palette group and flat typography/radii', () => {
    const result = importThemeTokens(
      {
        protoyard: { light: violetTheme.light, dark: violetTheme.dark },
        typography: { ui: 'Poppins', display: 'Outfit' },
        radii: { md: 12 },
      },
      { id: 'design-system-kit' }
    );

    expect(result.theme).toMatchObject({
      fontFamily: 'Poppins',
      fontFamilyHeading: 'Outfit',
      radius: '12px',
    });
  });

  it('rejects missing palette tokens and unsafe non-hex colors', () => {
    const invalidPalette = { ...violetTheme.light, primary: 'url(https://example.com/image)' };
    expect(() =>
      importThemeTokens({ light: invalidPalette, dark: violetTheme.dark }, { id: 'bad-kit' })
    ).toThrow(/color\.light\.primary must be a #rgb or #rrggbb color token/);
    expect(() =>
      importThemeTokens(
        { light: { background: '#fff' }, dark: violetTheme.dark },
        { id: 'incomplete-kit' }
      )
    ).toThrow(/color\.light\.foreground is required/);
  });

  it('refuses to return a theme when any light or dark contrast pair fails AA', () => {
    const lowContrast = { ...violetTheme.light, foreground: '#999999' };
    try {
      importThemeTokens({ light: lowContrast, dark: violetTheme.dark }, { id: 'low-contrast-kit' });
      throw new Error('expected contrast validation to reject the imported tokens');
    } catch (error) {
      expect(error).toMatchObject({
        name: 'ThemeTokenContrastError',
        contrast: { light: { passed: false }, dark: { passed: true } },
        failures: expect.arrayContaining([
          expect.objectContaining({
            mode: 'light',
            foreground: 'foreground',
            background: 'background',
          }),
        ]),
      });
    }
  });

  it('rejects an unexpected token key instead of silently dropping it', () => {
    expect(() =>
      importThemeTokens(
        {
          light: { ...violetTheme.light, unexpectedToken: '#123456' },
          dark: violetTheme.dark,
        },
        { id: 'unknown-token-kit' }
      )
    ).toThrow(/unsupported token\(s\): unexpectedToken/);
  });
});
