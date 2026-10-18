import {
  type ColorMode,
  DEFAULT_THEME_STYLE,
  type Theme,
  type ThemePalette,
  tokenToCssVar,
} from '@protoyard/core';
import { hoverFill } from './contrast.ts';
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
      `--py-font-size-${step}`,
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
      return ['0 1px 2px 0 var(--py-shadow)', '0 4px 8px -2px var(--py-shadow)'];
    case 'glow':
      return [
        '0 0 12px color-mix(in oklab, var(--py-primary) 24%, transparent)',
        '0 0 28px color-mix(in oklab, var(--py-primary) 32%, transparent)',
      ];
    default:
      return [
        '0 1px 2px 0 var(--py-shadow), 0 1px 3px 0 var(--py-shadow)',
        '0 10px 30px -8px var(--py-shadow), 0 4px 10px -4px var(--py-shadow)',
      ];
  }
}

/** Every CSS custom property the theme engine controls, as a plain map. */
export function themeVariables(input: AppearanceInput): Record<string, string> {
  const palette: ThemePalette =
    input.resolvedMode === 'dark' ? input.theme.dark : input.theme.light;
  const vars: Record<string, string> = {};
  for (const [token, value] of Object.entries(palette)) vars[tokenToCssVar(token)] = value;
  vars['--py-primary-hover'] = hoverFill(palette.primary, palette.primaryForeground);
  vars['--py-destructive-hover'] = hoverFill(palette.destructive, palette.destructiveForeground);
  vars['--py-radius'] = input.theme.radius;
  vars['--py-font-sans'] = input.theme.fontFamily;
  vars['--py-font-heading'] = input.theme.fontFamilyHeading ?? input.theme.fontFamily;
  vars['--py-font-mono'] = input.theme.fontFamilyMono;
  vars['--py-density'] = String(densityScale(input.density, input.theme));
  vars['--py-motion'] = input.reducedMotion ? '0' : '1';
  const style = input.theme.style;
  const [softShadow, floatShadow] = elevationShadows(style.elevation);
  Object.assign(vars, fontSizeVariables(style.typography.scaleRatio));
  vars['--py-font-weight-body'] = String(style.typography.weights.body);
  vars['--py-font-weight-medium'] = String(style.typography.weights.medium);
  vars['--py-font-weight-heading'] = String(style.typography.weights.heading);
  vars['--py-font-weight-bold'] = String(style.typography.weights.bold);
  vars['--py-letter-spacing-body'] = style.typography.tracking.body;
  vars['--py-letter-spacing-heading'] = style.typography.tracking.heading;
  vars['--py-radius-scale'] = String(style.shape.radiusScale);
  vars['--py-radius-step-6'] = `${Number((6 * style.shape.radiusScale).toFixed(4))}px`;
  vars['--py-radius-step-4'] = `${Number((4 * style.shape.radiusScale).toFixed(4))}px`;
  vars['--py-radius-step-2'] = `${Number((2 * style.shape.radiusScale).toFixed(4))}px`;
  vars['--py-border-width'] = style.shape.borderWidth;
  vars['--py-elevation-style'] = style.elevation;
  vars['--py-shadow-soft'] = softShadow;
  vars['--py-shadow-float'] = floatShadow;
  vars['--py-surface-style'] = style.surface;
  vars['--py-glass-opacity'] = '82%';
  vars['--py-glass-blur'] = '16px';
  vars['--py-motion-fast'] = input.reducedMotion ? '0ms' : `${style.motion.durations.fast}ms`;
  vars['--py-motion-base'] = input.reducedMotion ? '0ms' : `${style.motion.durations.base}ms`;
  vars['--py-motion-slow'] = input.reducedMotion ? '0ms' : `${style.motion.durations.slow}ms`;
  vars['--py-motion-easing'] = input.reducedMotion ? 'linear' : style.motion.easing;
  vars['--py-focus-ring-width'] = style.focusRing.width;
  vars['--py-focus-ring-offset'] = style.focusRing.offset;
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

/**
 * Writes the appearance onto `target`. On `document.documentElement` it
 * themes the whole prototype (portals included); on any other element it
 * scopes the theme to that subtree (used for previews).
 */
export function applyAppearance(target: HTMLElement, input: AppearanceInput): AppliedAppearance {
  const vars = themeVariables(input);
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
  return {
    themeId: input.theme.id,
    mode: input.resolvedMode,
    reducedMotion,
    density: Number(vars['--py-density']),
    surface: input.theme.style.surface,
    components,
    vars,
  };
}

/** Removes everything {@link applyAppearance} wrote (scoped previews unmount cleanly). */
export function clearAppearance(target: HTMLElement): void {
  for (const name of Object.keys(
    themeVariables({ theme: getTheme(undefined), resolvedMode: 'light' })
  )) {
    target.style.removeProperty(name);
  }
  delete target.dataset.pyTheme;
  delete target.dataset.pyMode;
  delete target.dataset.pyMotion;
  delete target.dataset.pySurface;
  applyComponentProfile(target, {});
  target.classList.remove('dark', 'light');
  target.style.removeProperty('color-scheme');
}
