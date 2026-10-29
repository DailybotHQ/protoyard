import {
  DEFAULT_THEME_STYLE,
  ELEVATION_STYLES,
  resolveThemeStyle,
  ThemeSchema,
} from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import { themeComponentProfile, themeVariables } from '../src/apply.ts';
import { FONT_CATALOG } from '../src/fonts.ts';
import { violetTheme } from '../src/presets.ts';
import {
  applyStylePresets,
  DENSITY_PRESETS,
  ELEVATION_PRESETS,
  FONT_PRESETS,
  MOTION_PRESETS,
  RADIUS_PRESETS,
  type StylePresetSelection,
  stylePresetInput,
} from '../src/style-presets.ts';

const EVERY_SELECTION: StylePresetSelection[] = [
  ...DENSITY_PRESETS.map((preset) => ({ density: preset.id })),
  ...RADIUS_PRESETS.map((preset) => ({ radius: preset.id })),
  ...ELEVATION_PRESETS.map((preset) => ({ elevation: preset.id })),
  ...FONT_PRESETS.map((preset) => ({ font: preset.id })),
  ...MOTION_PRESETS.map((preset) => ({ motion: preset.id })),
];

describe('style presets', () => {
  it('covers every elevation style and every font pairing with unique ids', () => {
    expect(ELEVATION_PRESETS.map((preset) => preset.id)).toEqual([...ELEVATION_STYLES]);
    expect(FONT_PRESETS.map((preset) => preset.id)).toEqual(FONT_CATALOG.map((font) => font.id));
    for (const presets of [DENSITY_PRESETS, RADIUS_PRESETS, MOTION_PRESETS]) {
      const ids = presets.map((preset) => preset.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('resolves every preset through resolveThemeStyle and ThemeSchema', () => {
    for (const selection of EVERY_SELECTION) {
      const input = stylePresetInput(selection);
      expect(() => resolveThemeStyle(input.style)).not.toThrow();
      const theme = applyStylePresets(violetTheme, selection);
      expect(ThemeSchema.parse(theme)).toEqual(theme);
    }
  });

  it('reproduces the default look with the default presets', () => {
    const theme = applyStylePresets(violetTheme, {
      density: 'default',
      radius: 'default',
      elevation: 'soft',
      motion: 'standard',
    });
    expect(theme.density).toBe(1);
    expect(theme.radius).toBe('0.625rem');
    expect(theme.style).toEqual(DEFAULT_THEME_STYLE);
  });

  it('sets density, radius, fonts and motion on the theme', () => {
    const theme = applyStylePresets(violetTheme, {
      density: 'spacious',
      radius: 'square',
      font: 'editorial',
      motion: 'expressive',
    });
    const editorial = FONT_CATALOG.find((font) => font.id === 'editorial');
    expect(theme.density).toBe(1.25);
    expect(theme.radius).toBe('0');
    expect(theme.style.shape.radiusScale).toBe(0);
    expect(theme.fontFamilyHeading).toBe(editorial?.fontFamilyHeading);
    expect(theme.style.motion).toEqual({
      durations: { fast: 200, base: 300, slow: 500 },
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    });
    expect(themeComponentProfile(theme).button).toBe('square');
    expect(themeComponentProfile(applyStylePresets(violetTheme, { radius: 'pill' })).button).toBe(
      'pill'
    );
  });

  it('keeps the style fields a selection does not touch', () => {
    const base = {
      ...violetTheme,
      style: {
        typography: { scaleRatio: 1.25 },
        shape: { radiusScale: 2, borderWidth: '2px' },
        surface: 'glass' as const,
      },
    };
    const theme = applyStylePresets(base, { radius: 'round', elevation: 'crisp' });
    expect(theme.style.typography.scaleRatio).toBe(1.25);
    expect(theme.style.shape).toEqual({ radiusScale: 1.25, borderWidth: '2px' });
    expect(theme.style.surface).toBe('glass');
    expect(theme.style.elevation).toBe('crisp');
    expect(applyStylePresets(base, { motion: 'none' }).style.shape.radiusScale).toBe(2);
  });

  it('rejects unknown preset ids with the known ids', () => {
    expect(() => stylePresetInput({ density: 'roomy' as never })).toThrow(
      /Unknown density preset "roomy". Known presets: compact, default, comfortable, spacious/
    );
    expect(() => stylePresetInput({ font: 'comic' })).toThrow(/Unknown font preset "comic"/);
    expect(() => stylePresetInput({ elevation: 'deep' as never })).toThrow(TypeError);
  });

  it('renders the layered elevation as stacked shadows', () => {
    const theme = applyStylePresets(violetTheme, { elevation: 'layered' });
    const vars = themeVariables({ theme, resolvedMode: 'light' });
    expect(vars['--tx-elevation-style']).toBe('layered');
    expect(vars['--tx-shadow-soft']?.split('var(--tx-shadow)')).toHaveLength(4);
    expect(vars['--tx-shadow-float']?.split('var(--tx-shadow)')).toHaveLength(5);
    expect(themeComponentProfile(theme).card).toBeUndefined();
  });
});
