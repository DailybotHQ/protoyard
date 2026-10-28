import {
  type ColorMode,
  DEFAULT_THEME_STYLE,
  type Theme,
  type ThemePalette,
  tokenToCssVar,
} from '@protoyard/core';
import { hoverFill, linkStates } from './contrast.ts';
import { BUILTIN_THEMES, DEFAULT_THEME_ID } from './presets.ts';

export type ResolvedMode = 'light' | 'dark';
export type Density = 'compact' | 'default' | 'comfortable' | number;

/** Finds a theme among the built-ins plus `extra` (prototype themes win on id clashes). */
export function findTheme(id: string, extra: readonly Theme[] = []): Theme | undefined {
  return extra.find((t) => t.id === id) ?? BUILTIN_THEMES.find((t) => t.id === id);
}

/** Like {@link findTheme}, but always returns a theme (falls back to Violet). */
export function getTheme(id: string | undefined, extra: readonly Theme[] = []): Theme {
  return (
    (id ? findTheme(id, extra) : undefined) ??
    findTheme(DEFAULT_THEME_ID, extra) ??
    (BUILTIN_THEMES[0] as Theme)
  );
}

/** Merges preset lists by id; later lists override earlier ones. */
export function mergeThemes(...lists: readonly (readonly Theme[] | undefined)[]): Theme[] {
  const byId = new Map<string, Theme>();
  for (const list of lists) for (const theme of list ?? []) byId.set(theme.id, theme);
  return [...byId.values()];
}

type MatchMedia = (query: string) => { matches: boolean };

export function prefersDark(matchMedia?: MatchMedia): boolean {
  try {
    const mm = matchMedia ?? globalThis.matchMedia?.bind(globalThis);
    return mm ? mm('(prefers-color-scheme: dark)').matches : false;
  } catch {
    return false;
  }
}

export function resolveMode(mode: ColorMode, matchMedia?: MatchMedia): ResolvedMode {
  if (mode === 'system') return prefersDark(matchMedia) ? 'dark' : 'light';
  return mode;
}

export function densityScale(density: Density | undefined, theme?: Theme): number {
  if (typeof density === 'number') return Math.min(1.25, Math.max(0.75, density));
  if (density === 'compact') return 0.875;
  if (density === 'comfortable') return 1.125;
  return theme?.density ?? 1;
}

export interface AppearanceInput {
  theme: Theme;
  resolvedMode: ResolvedMode;
  reducedMotion?: boolean;
  density?: Density;
}

const FONT_SIZES = [
  ['xs', -2, '0.75rem'],
  ['sm', -1, '0.875rem'],
  ['base', 0, '1rem'],
  ['lg', 1, '1.125rem'],
  ['xl', 2, '1.25rem'],
  ['2xl', 3, '1.5rem'],
  ['3xl', 4, '1.875rem'],
  ['4xl', 5, '2.25rem'],
  ['5xl', 6, '3rem'],
  ['6xl', 7, '3.75rem'],
  ['7xl', 8, '4.5rem'],
  ['8xl', 9, '6rem'],
  ['9xl', 10, '8rem'],
] as const;

function fontSizeVariables(scaleRatio: number | null): Record<string, string> {
  return Object.fromEntries(
    FONT_SIZES.map(([step, exponent, fallback]) => [
      `--tx-font-size-${step}`,
      scaleRatio === null
        ? fallback
        : `${Number(scaleRatio ** exponent)
            .toFixed(4)
            .replace(/0+$/, '')
            .replace(/\.$/, '')}rem`,
    ])
  );
}

function elevationShadows(elevation: Theme['style']['elevation']): [string, string] {
  switch (elevation) {
    case 'flat':
      return ['none', 'none'];
    case 'crisp':
      return ['0 1px 2px 0 var(--tx-shadow)', '0 4px 8px -2px var(--tx-shadow)'];
    case 'glow':
      return [
        '0 0 12px color-mix(in oklab, var(--tx-primary) 24%, transparent)',
        '0 0 28px color-mix(in oklab, var(--tx-primary) 32%, transparent)',
      ];
    case 'layered':
      // Contact, key and ambient layers: depth grows with distance from the surface.
      return [
        '0 1px 1px 0 var(--tx-shadow), 0 2px 4px -1px var(--tx-shadow), 0 4px 8px -2px var(--tx-shadow)',
        '0 1px 2px 0 var(--tx-shadow), 0 4px 8px -2px var(--tx-shadow), 0 12px 24px -6px var(--tx-shadow), 0 24px 48px -12px var(--tx-shadow)',
      ];
    default:
      return [
        '0 1px 2px 0 var(--tx-shadow), 0 1px 3px 0 var(--tx-shadow)',
        '0 10px 30px -8px var(--tx-shadow), 0 4px 10px -4px var(--tx-shadow)',
      ];
  }
}

/** Every CSS custom property the theme engine controls, as a plain map. */
export function themeVariables(input: AppearanceInput): Record<string, string> {
  const palette: ThemePalette =
    input.resolvedMode === 'dark' ? input.theme.dark : input.theme.light;
  const vars: Record<string, string> = {};
  for (const [token, value] of Object.entries(palette)) {
    vars[tokenToCssVar(token).replace('--py-', '--tx-')] = value;
  }
  vars['--tx-primary-hover'] = hoverFill(palette.primary, palette.primaryForeground);
  vars['--tx-destructive-hover'] = hoverFill(palette.destructive, palette.destructiveForeground);
  // Texuli's link role and its states (the `link` button variant, blocks links).
  const link = linkStates(palette);
  vars['--tx-link'] = link.default;
  vars['--tx-link-hover'] = link.hover;
  vars['--tx-link-active'] = link.active;
  vars['--tx-link-focus'] = link.focus;
  vars['--tx-link-disabled'] = link.disabled;
  vars['--tx-link-visited'] = link.visited;
  vars['--tx-radius'] = input.theme.radius;
  vars['--tx-font-sans'] = input.theme.fontFamily;
  vars['--tx-font-heading'] = input.theme.fontFamilyHeading ?? input.theme.fontFamily;
  vars['--tx-font-mono'] = input.theme.fontFamilyMono;
  vars['--tx-density'] = String(densityScale(input.density, input.theme));
  vars['--tx-motion'] = input.reducedMotion ? '0' : '1';
  const style = input.theme.style;
  const [softShadow, floatShadow] = elevationShadows(style.elevation);
  Object.assign(vars, fontSizeVariables(style.typography.scaleRatio));
  vars['--tx-font-weight-body'] = String(style.typography.weights.body);
  vars['--tx-font-weight-medium'] = String(style.typography.weights.medium);
  vars['--tx-font-weight-heading'] = String(style.typography.weights.heading);
  vars['--tx-font-weight-bold'] = String(style.typography.weights.bold);
  vars['--tx-letter-spacing-body'] = style.typography.tracking.body;
  vars['--tx-letter-spacing-heading'] = style.typography.tracking.heading;
  vars['--tx-radius-scale'] = String(style.shape.radiusScale);
  vars['--tx-radius-step-6'] = `${Number((6 * style.shape.radiusScale).toFixed(4))}px`;
  vars['--tx-radius-step-4'] = `${Number((4 * style.shape.radiusScale).toFixed(4))}px`;
  vars['--tx-radius-step-2'] = `${Number((2 * style.shape.radiusScale).toFixed(4))}px`;
  vars['--tx-border-width'] = style.shape.borderWidth;
  vars['--tx-elevation-style'] = style.elevation;
  vars['--tx-shadow-soft'] = softShadow;
  vars['--tx-shadow-float'] = floatShadow;
  vars['--tx-surface-style'] = style.surface;
  vars['--tx-glass-opacity'] = '82%';
  vars['--tx-glass-blur'] = '16px';
  vars['--tx-motion-fast'] = input.reducedMotion ? '0ms' : `${style.motion.durations.fast}ms`;
  vars['--tx-motion-base'] = input.reducedMotion ? '0ms' : `${style.motion.durations.base}ms`;
  vars['--tx-motion-slow'] = input.reducedMotion ? '0ms' : `${style.motion.durations.slow}ms`;
  vars['--tx-motion-easing'] = input.reducedMotion ? 'linear' : style.motion.easing;
  vars['--tx-focus-ring-width'] = style.focusRing.width;
  vars['--tx-focus-ring-offset'] = style.focusRing.offset;
  Object.assign(vars, chartVariables(input.theme, input.resolvedMode, palette));
  return withDeprecatedPyAliases(vars);
}

/** Keep exported prototypes working while making --tx-* the source of truth. */
function withDeprecatedPyAliases(txVars: Record<string, string>): Record<string, string> {
  const pyVars = Object.fromEntries(
    Object.entries(txVars).map(([name, value]) => [
      name.replace('--tx-', '--py-'),
      value.replaceAll('--tx-', '--py-'),
    ])
  );
  return { ...txVars, ...pyVars };
}

/**
 * The chart variables a theme block sets beyond `--py-chart1…5`: series 6–8
 * and the 9-step sequential and diverging ramps (the names the charts kit
 * reads). Cleared when the next theme has no `charts` block.
 */
const TX_CHART_EXTENSION_VARIABLES: readonly string[] = [
  ...[6, 7, 8].map((n) => `--tx-chart${n}`),
  ...Array.from({ length: 9 }, (_, i) => `--tx-seq-${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `--tx-div-${i + 1}`),
];

export const CHART_EXTENSION_VARIABLES: readonly string[] = [
  ...TX_CHART_EXTENSION_VARIABLES,
  ...TX_CHART_EXTENSION_VARIABLES.map((name) => name.replace('--tx-', '--py-')),
];

/** Chart grid and axis colors always; the full series and ramps when the theme carries them. */
function chartVariables(
  theme: Theme,
  mode: ResolvedMode,
  palette: ThemePalette
): Record<string, string> {
  const charts = theme.charts?.[mode];
  const vars: Record<string, string> = {
    '--tx-chart-grid': charts?.grid ?? palette.border,
    '--tx-chart-axis': charts?.axis ?? palette.mutedForeground,
  };
  if (!charts) return vars;
  charts.categorical.forEach((color, i) => {
    vars[`--tx-chart${i + 1}`] = color;
  });
  charts.sequential.forEach((color, i) => {
    vars[`--tx-seq-${i + 1}`] = color;
  });
  charts.diverging.forEach((color, i) => {
    vars[`--tx-div-${i + 1}`] = color;
  });
  return vars;
}

/**
 * The `@protoyard/ui` component profiles (`data-py-*-style`, see
 * packages/ui/src/styles/variants.css) a theme's style implies. Only
 * departures from today's look produce an attribute, so a theme without a
 * `style` renders exactly as before:
 * - `focusRing` → `focus-ring` when it differs from the default ring;
 * - `surface: glass` → `card: glass`; `elevation: flat` → `card: bordered`;
 * - a radius of 0 → `button: square`; a radius of 999px or more → `button: pill`.
 * Input and navigation profiles have no theme field and stay consumer-set.
 */
export interface ComponentProfile {
  button?: 'pill' | 'square';
  card?: 'glass' | 'bordered';
  focusRing?: Theme['style']['focusRing']['style'];
}

const PROFILE_ATTRIBUTES = {
  button: 'pyButtonStyle',
  card: 'pyCardStyle',
  focusRing: 'pyFocusRingStyle',
} as const satisfies Record<keyof ComponentProfile, string>;

function radiusPx(radius: string): number | null {
  const match = /^(\d+(?:\.\d+)?)(px|rem|em)?$/.exec(radius.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return match[2] === 'rem' || match[2] === 'em' ? value * 16 : value;
}

export function themeComponentProfile(theme: Theme): ComponentProfile {
  const profile: ComponentProfile = {};
  const ring = theme.style.focusRing;
  const fallback = DEFAULT_THEME_STYLE.focusRing;
  if (
    ring.style !== fallback.style ||
    ring.width !== fallback.width ||
    ring.offset !== fallback.offset
  ) {
    profile.focusRing = ring.style;
  }
  if (theme.style.surface === 'glass') profile.card = 'glass';
  else if (theme.style.elevation === 'flat') profile.card = 'bordered';
  const px = radiusPx(theme.radius);
  if (px === 0) profile.button = 'square';
  else if (px !== null && px >= 999) profile.button = 'pill';
  return profile;
}

/** Sets the profile attributes on `target` and removes the ones the theme does not imply. */
function applyComponentProfile(target: HTMLElement, profile: ComponentProfile): void {
  for (const [key, attribute] of Object.entries(PROFILE_ATTRIBUTES)) {
    const value = profile[key as keyof ComponentProfile];
    if (value) target.dataset[attribute] = value;
    else delete target.dataset[attribute];
  }
}

export interface AppliedAppearance {
  themeId: string;
  mode: ResolvedMode;
  reducedMotion: boolean;
  density: number;
  /** Theme surface style (`solid` | `glass`) for no-flash replay. */
  surface: Theme['style']['surface'];
  /** Component profile attributes written on the target (for no-flash replay). */
  components: ComponentProfile;
  vars: Record<string, string>;
}

/** Writes Texuli's `--tx-*` variables for one appearance; returns what it wrote. */
export type TexuliAppearanceWriter = (
  target: HTMLElement,
  input: AppearanceInput
) => Record<string, string>;

let texuliWriter: TexuliAppearanceWriter | undefined;
const lastInputs = new WeakMap<HTMLElement, AppearanceInput>();

/**
 * Turns Texuli's variables on (or off, with `undefined`): `--tx-*` and the
 * `data-tx-*` attributes, with the `--py-*` names as their aliases. Pages that
 * render Texuli components call `enableTexuliAppearance()` from
 * `@protoyard/themes/texuli`, which installs the `@texuli/tokens` writer, so
 * pages that do not pay nothing for it. Re-applies the last appearance of each
 * given target.
 */
export function setTexuliAppearanceWriter(
  writer: TexuliAppearanceWriter | undefined,
  targets: readonly HTMLElement[] = []
): void {
  texuliWriter = writer;
  for (const target of targets) {
    const input = lastInputs.get(target);
    if (input) applyAppearance(target, input);
  }
}

function writeTexuli(target: HTMLElement, input: AppearanceInput): Record<string, string> {
  if (!texuliWriter) return {};
  target.dataset.txTheme = input.theme.id;
  target.dataset.txMode = input.resolvedMode;
  target.dataset.txMotion = input.reducedMotion ? 'reduce' : 'full';
  target.dataset.txSurface = input.theme.style.surface;
  return texuliWriter(target, input);
}

function clearTexuli(target: HTMLElement): void {
  const names: string[] = [];
  for (let index = 0; index < target.style.length; index += 1) {
    const name = target.style.item(index);
    if (name.startsWith('--tx-')) names.push(name);
  }
  for (const name of names) target.style.removeProperty(name);
  delete target.dataset.txTheme;
  delete target.dataset.txMode;
  delete target.dataset.txMotion;
  delete target.dataset.txSurface;
}

/**
 * Writes the appearance onto `target`. On `document.documentElement` it
 * themes the whole prototype (portals included); on any other element it
 * scopes the theme to that subtree (used for previews).
 */
export function applyAppearance(target: HTMLElement, input: AppearanceInput): AppliedAppearance {
  const vars = themeVariables(input);
  for (const name of CHART_EXTENSION_VARIABLES) {
    if (!(name in vars)) target.style.removeProperty(name);
  }
  for (const [name, value] of Object.entries(vars)) target.style.setProperty(name, value);
  const reducedMotion = input.reducedMotion ?? false;
  target.dataset.pyTheme = input.theme.id;
  target.dataset.pyMode = input.resolvedMode;
  target.dataset.pyMotion = reducedMotion ? 'reduce' : 'full';
  target.dataset.pySurface = input.theme.style.surface;
  const components = themeComponentProfile(input.theme);
  applyComponentProfile(target, components);
  target.classList.toggle('dark', input.resolvedMode === 'dark');
  target.classList.toggle('light', input.resolvedMode === 'light');
  target.style.colorScheme = input.resolvedMode;
  lastInputs.set(target, input);
  const texuli = writeTexuli(target, input);
  return {
    themeId: input.theme.id,
    mode: input.resolvedMode,
    reducedMotion,
    density: Number(vars['--tx-density']),
    surface: input.theme.style.surface,
    components,
    vars: { ...texuli, ...vars },
  };
}

/** Removes everything {@link applyAppearance} wrote (scoped previews unmount cleanly). */
export function clearAppearance(target: HTMLElement): void {
  lastInputs.delete(target);
  clearTexuli(target);
  for (const name of Object.keys(
    themeVariables({ theme: getTheme(undefined), resolvedMode: 'light' })
  )) {
    target.style.removeProperty(name);
  }
  for (const name of CHART_EXTENSION_VARIABLES) target.style.removeProperty(name);
  delete target.dataset.pyTheme;
  delete target.dataset.pyMode;
  delete target.dataset.pyMotion;
  delete target.dataset.pySurface;
  applyComponentProfile(target, {});
  target.classList.remove('dark', 'light');
  target.style.removeProperty('color-scheme');
}
