import { describe, expect, it } from 'vitest';
import {
  cleanThemeShareName,
  decodeThemeShare,
  encodeThemeShare,
  getThemeShareValue,
  MAX_THEME_SHARE_LENGTH,
  type ThemeShareDefinition,
} from '../src/share.ts';

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

describe('theme share definitions', () => {
  it('round-trips compact Studio inputs as base64url JSON', () => {
    const encoded = encodeThemeShare(definition);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded.length).toBeLessThanOrEqual(MAX_THEME_SHARE_LENGTH);
    expect(decodeThemeShare(encoded)).toEqual(definition);
  });

  it('rejects oversized, malformed, and schema-invalid values', () => {
    expect(() => decodeThemeShare('a'.repeat(MAX_THEME_SHARE_LENGTH + 1))).toThrow(/oversized/);
    expect(() => decodeThemeShare('!')).toThrow(/Invalid|Malformed/);
    expect(() => decodeThemeShare('eyJ')).toThrow();
    const invalidDefinition = Buffer.from(JSON.stringify({ ...definition, seed: '#xyz' })).toString(
      'base64url'
    );
    expect(() => decodeThemeShare(invalidDefinition)).toThrow();
  });

  it('strips control and bidi characters from a shared theme name', () => {
    const disguised = 'Harbor\u202e thgil\u0007\u2028';
    expect(cleanThemeShareName(disguised)).toBe('Harbor thgil');
    const crafted = Buffer.from(JSON.stringify({ ...definition, name: disguised })).toString(
      'base64url'
    );
    expect(decodeThemeShare(crafted).name).toBe('Harbor thgil');
    expect(decodeThemeShare(encodeThemeShare({ ...definition, name: disguised })).name).toBe(
      'Harbor thgil'
    );
    // Nothing left after cleaning is not a name.
    const empty = Buffer.from(JSON.stringify({ ...definition, name: '\u202e\u0000' })).toString(
      'base64url'
    );
    expect(() => decodeThemeShare(empty)).toThrow();
  });

  it('reads themeDef from ordinary and hash-router query strings', () => {
    expect(getThemeShareValue('?themeDef=search', '#/settings')).toBe('search');
    expect(getThemeShareValue('', '#/settings?tab=colors&themeDef=hash')).toBe('hash');
    expect(getThemeShareValue('', '#/settings')).toBeNull();
  });
});
