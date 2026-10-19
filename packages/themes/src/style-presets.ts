import {
  defineTheme,
  type ElevationStyle,
  type Theme,
  type ThemeInput,
  type ThemeStyleInput,
} from '@protoyard/core';
import { FONT_CATALOG, getFontPairing } from './fonts.ts';

/**
 * Named style presets: one vocabulary for density, corner radius, elevation,
 * font pairing and motion, shared by the Theme Studio, DevTools, the CLI and
 * blueprints. Every preset is plain data that resolves to `ThemeInput` fields
 * (`radius`, `density`, font stacks) and a `ThemeStyleInput`.
 */

export interface StylePreset<Id extends string> {
  id: Id;
  label: string;
  description: string;
}

export const DENSITY_PRESETS = [
  {
    id: 'compact',
    label: 'Compact',
    description: 'Tighter spacing for dense data.',
    density: 0.875,
  },
  { id: 'default', label: 'Default', description: 'Protoyard standard spacing.', density: 1 },
  {
    id: 'comfortable',
    label: 'Comfortable',
    description: 'More breathing room.',
    density: 1.125,
  },
  { id: 'spacious', label: 'Spacious', description: 'Airy, touch-first layouts.', density: 1.25 },
] as const satisfies readonly (StylePreset<string> & { density: number })[];
export type DensityPresetId = (typeof DENSITY_PRESETS)[number]['id'];

/**
 * `radius` is the base corner radius; `radiusScale` multiplies the steps
 * around it, so `square` is square at every size, not only the base step.
 */
export const RADIUS_PRESETS = [
  {
    id: 'square',
    label: 'Square',
    description: 'No rounding anywhere.',
    radius: '0',
    radiusScale: 0,
  },
  {
    id: 'sharp',
    label: 'Sharp',
    description: 'Barely rounded corners.',
    radius: '0.25rem',
    radiusScale: 0.5,
  },
  {
    id: 'default',
    label: 'Default',
    description: 'Protoyard standard corners.',
    radius: '0.625rem',
    radiusScale: 1,
  },
  {
    id: 'round',
    label: 'Round',
    description: 'Soft, friendly corners.',
    radius: '1rem',
    radiusScale: 1.25,
  },
  {
    id: 'pill',
    label: 'Pill',
    description: 'Fully rounded buttons and inputs.',
    radius: '9999px',
    radiusScale: 1,
  },
] as const satisfies readonly (StylePreset<string> & { radius: string; radiusScale: number })[];
export type RadiusPresetId = (typeof RADIUS_PRESETS)[number]['id'];

/** One entry per `ELEVATION_STYLES` value, in the same order (a test keeps them in sync). */
export const ELEVATION_PRESETS = [
  { id: 'flat', label: 'Flat', description: 'No shadows; cards get a border instead.' },
  { id: 'soft', label: 'Soft', description: 'Diffuse shadows (the default).' },
  { id: 'crisp', label: 'Crisp', description: 'Tight, short shadows.' },
  { id: 'glow', label: 'Glow', description: 'A glow in the primary color.' },
  { id: 'layered', label: 'Layered', description: 'Stacked shadows with real depth.' },
] as const satisfies readonly StylePreset<ElevationStyle>[];

export const MOTION_PRESETS = [
  {
    id: 'none',
    label: 'None',
    description: 'No animation.',
    durations: { fast: 0, base: 0, slow: 0 },
    easing: 'linear',
  },
  {
    id: 'subtle',
    label: 'Subtle',
    description: 'Short, quiet transitions.',
    durations: { fast: 100, base: 150, slow: 200 },
    easing: 'ease-out',
  },
  {
    id: 'standard',
    label: 'Standard',
    description: 'Protoyard standard motion.',
    durations: { fast: 150, base: 200, slow: 300 },
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  {
    id: 'expressive',
    label: 'Expressive',
    description: 'Longer transitions with a slight overshoot.',
    durations: { fast: 200, base: 300, slow: 500 },
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
] as const satisfies readonly (StylePreset<string> & {
  durations: { fast: number; base: number; slow: number };
  easing: string;
})[];
export type MotionPresetId = (typeof MOTION_PRESETS)[number]['id'];

/** Font pairing presets are the `FONT_CATALOG` entries, by id. */
export const FONT_PRESETS: readonly StylePreset<string>[] = /* @__PURE__ */ FONT_CATALOG.map(
  (pairing) => ({
    id: pairing.id,
    label: pairing.label,
    description: `${pairing.label} font pairing.`,
  })
);

/** A choice per dimension; omitted dimensions keep the theme's own value. */
export interface StylePresetSelection {
  density?: DensityPresetId;
  radius?: RadiusPresetId;
  elevation?: ElevationStyle;
  font?: string;
  motion?: MotionPresetId;
}

/** The `ThemeInput` fields a selection sets. */
export type StylePresetInput = Pick<
  ThemeInput,
  'radius' | 'density' | 'fontFamily' | 'fontFamilyHeading' | 'fontFamilyMono'
> & { style: ThemeStyleInput };

function pick<T extends { id: string }>(presets: readonly T[], id: string, kind: string): T {
  const preset = presets.find((entry) => entry.id === id);
  if (!preset) {
    throw new TypeError(
      `Unknown ${kind} preset "${id}". Known presets: ${presets.map((entry) => entry.id).join(', ')}`
    );
  }
  return preset;
}

/** Resolves a selection to theme fields; throws a `TypeError` for an unknown id. */
export function stylePresetInput(selection: StylePresetSelection): StylePresetInput {
  const input: StylePresetInput = { style: {} };
  if (selection.density !== undefined) {
    input.density = pick(DENSITY_PRESETS, selection.density, 'density').density;
  }
  if (selection.radius !== undefined) {
    const preset = pick(RADIUS_PRESETS, selection.radius, 'radius');
    input.radius = preset.radius;
    input.style.shape = { radiusScale: preset.radiusScale };
  }
  if (selection.elevation !== undefined) {
    input.style.elevation = pick(ELEVATION_PRESETS, selection.elevation, 'elevation').id;
  }
  if (selection.font !== undefined) {
    pick(FONT_PRESETS, selection.font, 'font');
    const pairing = getFontPairing(selection.font);
    if (pairing) {
      input.fontFamily = pairing.fontFamily;
      input.fontFamilyHeading = pairing.fontFamilyHeading;
      input.fontFamilyMono = pairing.fontFamilyMono;
    }
  }
  if (selection.motion !== undefined) {
    const preset = pick(MOTION_PRESETS, selection.motion, 'motion');
    input.style.motion = { durations: { ...preset.durations }, easing: preset.easing };
  }
  return input;
}

/** Applies a selection on top of a theme and validates the result with `ThemeSchema`. */
export function applyStylePresets(theme: ThemeInput, selection: StylePresetSelection): Theme {
  const { style, ...fields } = stylePresetInput(selection);
  const base = theme.style ?? {};
  return defineTheme({
    ...theme,
    ...fields,
    style: {
      ...base,
      ...style,
      ...(style.shape ? { shape: { ...base.shape, ...style.shape } } : {}),
    },
  });
}
