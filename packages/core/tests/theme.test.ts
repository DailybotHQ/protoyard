import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME_STYLE,
  defineTheme,
  isSafeCssColor,
  isSafeFontFamily,
  resolveThemeStyle,
  ThemePaletteSchema,
  ThemeSchema,
} from '../src/index.ts';

const palette = Object.fromEntries(
  Object.keys(ThemePaletteSchema.shape).map((key) => [key, '#123456'])
) as Record<keyof typeof ThemePaletteSchema.shape, string>;

const base = { id: 'violet', name: 'Violet', light: palette, dark: palette };

describe('theme style model', () => {
  it('defaults every style dimension to the current rendering', () => {
    const theme = defineTheme(base);
    expect(theme.style).toEqual({
      typography: {
        scaleRatio: null,
        weights: { body: 400, medium: 500, heading: 600, bold: 700 },
        tracking: { body: '0', heading: '0' },
      },
      shape: { radiusScale: 1, borderWidth: '1px' },
      elevation: 'soft',
      surface: 'solid',
      motion: {
        durations: { fast: 150, base: 200, slow: 300 },
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      focusRing: { style: 'ring', width: '2px', offset: '2px' },
    });
    expect(theme.style).toEqual(DEFAULT_THEME_STYLE);
    expect(resolveThemeStyle()).toEqual(DEFAULT_THEME_STYLE);
  });

  it('leaves the existing theme fields untouched', () => {
    const theme = defineTheme({ ...base, radius: '0.375rem', density: 0.875 });
    expect(theme).toMatchObject({
      id: 'violet',
      description: '',
      fontFamily: "'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif",
      fontFamilyMono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
      radius: '0.375rem',
      density: 0.875,
      light: palette,
      dark: palette,
    });
    expect(theme.fontFamilyHeading).toBeUndefined();
  });

  it('merges a partial style with the defaults', () => {
    const theme = defineTheme({
      ...base,
      style: {
        typography: {
          scaleRatio: 1.25,
          weights: { heading: 700 },
          tracking: { heading: '-0.02em' },
        },
        shape: { radiusScale: 0 },
        elevation: 'glow',
        surface: 'glass',
        motion: { durations: { base: 240 }, easing: 'ease-out' },
        focusRing: { style: 'outline' },
      },
    });
    expect(theme.style.typography).toEqual({
      scaleRatio: 1.25,
      weights: { body: 400, medium: 500, heading: 700, bold: 700 },
      tracking: { body: '0', heading: '-0.02em' },
    });
    expect(theme.style.shape).toEqual({ radiusScale: 0, borderWidth: '1px' });
    expect(theme.style.elevation).toBe('glow');
    expect(theme.style.surface).toBe('glass');
    expect(theme.style.motion).toEqual({
      durations: { fast: 150, base: 240, slow: 300 },
      easing: 'ease-out',
    });
    expect(theme.style.focusRing).toEqual({ style: 'outline', width: '2px', offset: '2px' });
  });

  it('round-trips through JSON without change', () => {
    const theme = defineTheme({
      ...base,
      style: {
        elevation: 'crisp',
        shape: { borderWidth: '0.125rem' },
        motion: { easing: 'cubic-bezier(0.2, -0.5, 0.3, 1.4)' },
      },
    });
    const again = ThemeSchema.parse(JSON.parse(JSON.stringify(theme)));
    expect(again).toEqual(theme);
    expect(defineTheme(theme)).toEqual(theme);
  });

  it.each([
    ['unknown elevation', { elevation: 'neon' }],
    ['unknown surface', { surface: 'frosted' }],
    ['unknown focus ring', { focusRing: { style: 'dotted' } }],
    ['non-length border', { shape: { borderWidth: '1px; color: red' } }],
    ['negative radius scale', { shape: { radiusScale: -1 } }],
    ['ratio out of range', { typography: { scaleRatio: 3 } }],
    ['fractional weight', { typography: { weights: { body: 450.5 } } }],
    ['weight out of range', { typography: { weights: { bold: 1000 } } }],
    ['tracking without unit', { typography: { tracking: { body: '-0.02' } } }],
    ['negative duration', { motion: { durations: { fast: -1 } } }],
    ['duration too long', { motion: { durations: { slow: 5000 } } }],
    ['injected easing', { motion: { easing: 'ease;}body{display:none' } }],
    ['malformed cubic-bezier', { motion: { easing: 'cubic-bezier(0.4, 0, 0.2)' } }],
  ])('rejects %s', (_label, style) => {
    expect(ThemeSchema.safeParse({ ...base, style }).success).toBe(false);
    expect(() => resolveThemeStyle(style as never)).toThrow();
  });
});

describe('theme value injection guards', () => {
  const MALICIOUS = [
    'url(https://x)',
    'url(https://tracker.example/p)',
    'red;}body{display:none',
    '</style>',
    '<script>',
    'image(https://x)',
    'rgb(1 2 3) url(x)',
    'color-mix(in oklab, url(x) 10%, red)',
    'red !important',
    'u\\72l(https://x)',
    'rgb(1 2 3',
    'rgb(1 2 3))',
    'expression(alert(1))',
    'var(--x);color:red',
  ];

  it('accepts the color syntaxes themes use', () => {
    for (const value of [
      '#fff',
      '#ffffffaa',
      '#0A1b2C',
      'transparent',
      'currentColor',
      'rgb(15 23 42 / 0.08)',
      'rgba(0, 0, 0, 0.5)',
      'hsl(220 14% 96%)',
      'hsla(220, 14%, 96%, 0.4)',
      'oklch(0.62 0.19 264)',
      'oklab(0.5 -0.1 0.1 / 50%)',
      'color(display-p3 1 0 0)',
      'color-mix(in oklab, #7c3aed 25%, transparent)',
      'color-mix(in oklab, var(--py-primary) 20%, white)',
    ]) {
      expect(isSafeCssColor(value), value).toBe(true);
    }
  });

  it('refuses colors that load resources or break out of a declaration', () => {
    for (const value of MALICIOUS) {
      expect(isSafeCssColor(value), value).toBe(false);
      const theme = { ...base, light: { ...palette, primary: value } };
      expect(ThemeSchema.safeParse(theme).success, value).toBe(false);
    }
  });

  it('accepts font stacks with quotes and var() fallbacks', () => {
    for (const value of [
      "'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif",
      'var(--py-font-stack-system-sans, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)',
      '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
      'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
    ]) {
      expect(isSafeFontFamily(value), value).toBe(true);
    }
  });

  it('refuses font stacks that inject rules, load resources or leave a string open', () => {
    for (const value of [
      ...MALICIOUS,
      'x;} body{background:url(https://tracker.example/p)} :root{a:b',
      '"Inter, sans-serif',
      "Inter', sans-serif",
      'local(Inter)',
      'Inter, sans-serif\nbody{}',
    ]) {
      expect(isSafeFontFamily(value), value).toBe(false);
    }
    for (const field of ['fontFamily', 'fontFamilyHeading', 'fontFamilyMono'] as const) {
      const result = ThemeSchema.safeParse({ ...base, [field]: 'x;}body{display:none' });
      expect(result.success, field).toBe(false);
    }
  });

  it('accepts only a CSS length as the radius', () => {
    for (const radius of ['0', '0px', '0.625rem', '12px', '1em', '9999px', '62.5rem']) {
      expect(ThemeSchema.safeParse({ ...base, radius }).success, radius).toBe(true);
    }
    for (const radius of [
      'url(https://x)',
      '1rem;}body{display:none',
      '</style>',
      'calc(1px)',
      '',
    ]) {
      expect(ThemeSchema.safeParse({ ...base, radius }).success, radius).toBe(false);
    }
  });
});
