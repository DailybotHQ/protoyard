import { describe, expect, it, vi } from 'vitest';
import { loadVariableFont } from '../src/fonts.ts';
import { importThemeTokens } from '../src/import-tokens.ts';
import { violetTheme } from '../src/presets.ts';
import {
  cleanThemeShareName,
  decodeThemeShare,
  encodeThemeShare,
  MAX_THEME_SHARE_LENGTH,
  type ThemeShareDefinition,
} from '../src/share.ts';

/**
 * Untrusted-input guards of `@protoyard/themes` outside design systems (those
 * are in design-system.test.ts): theme share links, imported token files and
 * optional font faces.
 */

const definition: ThemeShareDefinition = {
  name: 'Harbor light',
  seed: '#2563eb',
  secondary: '#0e7490',
  neutral: 'slate',
  font: 'system',
  radius: 'round',
  elevation: 'crisp',
  motion: 'subtle',
  surface: 'glass',
  focusRing: 'outline',
  density: 1.125,
};

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('theme share links', () => {
  it('round-trip, and reject oversized, malformed and schema-invalid values', () => {
    expect(decodeThemeShare(encodeThemeShare(definition))).toEqual(definition);
    expect(() => decodeThemeShare('a'.repeat(MAX_THEME_SHARE_LENGTH + 1))).toThrow(/oversized/);
    expect(() => decodeThemeShare('!')).toThrow(/Invalid|Malformed/);
    expect(() => decodeThemeShare('eyJ')).toThrow();
    expect(() => decodeThemeShare(encode({ ...definition, seed: '#xyz' }))).toThrow();
  });

  it('strip control and bidi characters from a shared theme name', () => {
    const disguised = 'Harbor\u202E thgil\u0007 ';
    expect(cleanThemeShareName(disguised)).toBe('Harbor thgil');
    expect(decodeThemeShare(encode({ ...definition, name: disguised })).name).toBe('Harbor thgil');
    // Nothing left after cleaning is not a name.
    expect(() => decodeThemeShare(encode({ ...definition, name: '\u202E\u0000' }))).toThrow();
  });
});

describe('importThemeTokens', () => {
  it('rejects missing palette tokens, unsafe non-hex colors and unexpected keys', () => {
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
    expect(() =>
      importThemeTokens(
        { light: { ...violetTheme.light, unexpectedToken: '#123456' }, dark: violetTheme.dark },
        { id: 'unknown-token-kit' }
      )
    ).toThrow(/unsupported token\(s\): unexpectedToken/);
  });
});

describe('optional font faces', () => {
  it('reject remote or non-woff2 font sources', async () => {
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
