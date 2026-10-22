import { defineTheme, type Theme, type ThemeInput, ThemePaletteSchema } from '@protoyard/core';
import { contrastRatio, parseHex, TEXT_CONTRAST_PAIRS, UI_CONTRAST_PAIRS } from './contrast.ts';

/** Input shape accepted for one light or dark theme palette. */
export type ThemePaletteInput = ThemeInput['light'];

export interface ImportThemeTokensOptions {
  id: string;
  name?: string;
}

export interface ThemeTokenContrastCheck {
  foreground: string;
  background: string;
  ratio: number;
  minimum: number;
  passes: boolean;
}

export interface ThemeTokenContrastReport {
  passed: boolean;
  passedCount: number;
  total: number;
  pairs: ThemeTokenContrastCheck[];
}

export interface ImportedThemeTokens {
  theme: Theme;
  contrast: Record<'light' | 'dark', ThemeTokenContrastReport>;
}

const PALETTE_KEYS = Object.keys(ThemePaletteSchema.shape) as (keyof ThemePaletteInput)[];
const CONTRAST_KEYS = new Set<string>([...TEXT_CONTRAST_PAIRS.flat(), ...UI_CONTRAST_PAIRS.flat()]);
const DEFAULT_FONT = "'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif";
const DEFAULT_MONO_FONT = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const DEFAULT_RADIUS = '0.625rem';

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function tokenValue(value: unknown, path: string, expectedType?: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const token = value as Record<string, unknown>;
  if ('$value' in token) {
    if (expectedType && token.$type !== undefined && token.$type !== expectedType) {
      throw new TypeError(`${path} must have token type "${expectedType}".`);
    }
    return token.$value;
  }
  return value;
}

function readColorToken(value: unknown, path: string, measurable = true): string {
  const color = tokenValue(value, path, 'color');
  if (typeof color !== 'string' || (measurable && !parseHex(color))) {
    throw new TypeError(
      `${path} must be a ${measurable ? '#rgb or #rrggbb color token' : 'valid CSS color token'}.`
    );
  }
  return color;
}

function readScalarToken(value: unknown, path: string, type: string): string | number | undefined {
  if (value === undefined) return undefined;
  const scalar = tokenValue(value, path, type);
  if (typeof scalar !== 'string' && typeof scalar !== 'number') {
    throw new TypeError(`${path} must have a ${type} token value.`);
  }
  return scalar;
}

function readStringToken(value: unknown, path: string, type: string): string | undefined {
  const scalar = readScalarToken(value, path, type);
  if (scalar !== undefined && typeof scalar !== 'string') {
    throw new TypeError(`${path} must have a string value.`);
  }
  return scalar;
}

function readNumberToken(value: unknown, path: string, type: string): number | undefined {
  const scalar = readScalarToken(value, path, type);
  if (scalar !== undefined && typeof scalar !== 'number') {
    throw new TypeError(`${path} must have a numeric value.`);
  }
  return scalar;
}

function paletteFromTokens(input: unknown, mode: 'light' | 'dark'): ThemePaletteInput {
  const source = record(input, `color.${mode}`);
  const palette: Partial<Record<keyof ThemePaletteInput, string>> = {};
  for (const key of PALETTE_KEYS) {
    const value = source[key];
    if (value === undefined) throw new TypeError(`color.${mode}.${key} is required.`);
    palette[key] = readColorToken(value, `color.${mode}.${key}`, CONTRAST_KEYS.has(key));
  }
  const unknownKeys = Object.keys(source).filter(
    (key) => !PALETTE_KEYS.includes(key as keyof ThemePaletteInput)
  );
  if (unknownKeys.length) {
    throw new TypeError(`color.${mode} has unsupported token(s): ${unknownKeys.join(', ')}.`);
  }
  return ThemePaletteSchema.parse(palette);
}

function contrastReport(theme: Theme, mode: 'light' | 'dark'): ThemeTokenContrastReport {
  const palette = theme[mode];
  const pairs = [
    ...TEXT_CONTRAST_PAIRS.map(([foreground, background]) => ({
      foreground,
      background,
      minimum: 4.5,
    })),
    ...UI_CONTRAST_PAIRS.map(([foreground, background]) => ({
      foreground,
      background,
      minimum: 3,
    })),
  ].map(({ foreground, background, minimum }) => {
    const ratio = contrastRatio(palette[foreground], palette[background]);
    return { foreground, background, ratio, minimum, passes: ratio >= minimum };
  });
  return {
    passed: pairs.every(({ passes }) => passes),
    passedCount: pairs.filter(({ passes }) => passes).length,
    total: pairs.length,
    pairs,
  };
}

/**
 * Imports a flat Protoyard palette or the DTCG-shaped token structure emitted
 * by `protoyard theme export --format tokens`. Color values must be hex so the
 * AA report can be measured without guessing at CSS color functions.
 */
export function importThemeTokens(
  input: unknown,
  options: ImportThemeTokensOptions
): ImportedThemeTokens {
  const root = record(input, 'tokens');
  const payload = root.format === 'protoyard-theme/v1' ? record(root.theme, 'theme') : root;
  const colorRoot =
    payload.color !== undefined
      ? record(payload.color, 'color')
      : payload.protoyard !== undefined
        ? record(payload.protoyard, 'protoyard')
        : payload;
  const light = paletteFromTokens(colorRoot.light, 'light');
  const dark = paletteFromTokens(colorRoot.dark, 'dark');

  const typography =
    payload.typography === undefined ? {} : record(payload.typography, 'typography');
  const shape = payload.shape === undefined ? {} : record(payload.shape, 'shape');
  const fontFamily = readStringToken(
    typography.fontFamily ?? typography.ui ?? payload.fontFamily,
    'typography.fontFamily',
    'fontFamily'
  );
  const fontFamilyHeading = readStringToken(
    typography.headingFontFamily ?? typography.display ?? payload.fontFamilyHeading,
    'typography.headingFontFamily',
    'fontFamily'
  );
  const fontFamilyMono = readStringToken(
    typography.monoFontFamily ?? payload.fontFamilyMono,
    'typography.monoFontFamily',
    'fontFamily'
  );
  const radiusInput =
    shape.radius ?? payload.radius ?? (payload.radii && record(payload.radii, 'radii').md);
  const radiusValue = readScalarToken(radiusInput, 'shape.radius', 'dimension');
  const radius = typeof radiusValue === 'number' ? `${radiusValue}px` : radiusValue;
  const density = readNumberToken(payload.density, 'density', 'number');

  const theme = defineTheme({
    id: options.id,
    name: options.name ?? titleFromId(options.id),
    description: `Imported design tokens for ${options.id}.`,
    light,
    dark,
    fontFamily: fontFamily ?? DEFAULT_FONT,
    ...(fontFamilyHeading === undefined ? {} : { fontFamilyHeading }),
    fontFamilyMono: fontFamilyMono ?? DEFAULT_MONO_FONT,
    radius: radius ?? DEFAULT_RADIUS,
    density: density ?? 1,
  });
  const contrast = {
    light: contrastReport(theme, 'light'),
    dark: contrastReport(theme, 'dark'),
  };
  const failures = (['light', 'dark'] as const).flatMap((mode) =>
    contrast[mode].pairs.filter(({ passes }) => !passes).map((pair) => ({ mode, ...pair }))
  );
  if (failures.length) {
    throw new ThemeTokenContrastError(options.id, failures, contrast);
  }
  return { theme, contrast };
}

export class ThemeTokenContrastError extends TypeError {
  readonly failures: Array<ThemeTokenContrastCheck & { mode: 'light' | 'dark' }>;
  readonly contrast: Record<'light' | 'dark', ThemeTokenContrastReport>;

  constructor(
    id: string,
    failures: Array<ThemeTokenContrastCheck & { mode: 'light' | 'dark' }>,
    contrast: Record<'light' | 'dark', ThemeTokenContrastReport>
  ) {
    super(`Theme "${id}" fails WCAG AA in ${failures[0]?.mode ?? 'light'} mode.`);
    this.name = 'ThemeTokenContrastError';
    this.failures = failures;
    this.contrast = contrast;
  }
}

function titleFromId(id: string): string {
  return id
    .split('-')
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}
