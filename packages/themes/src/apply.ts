import { type ColorMode, type Theme, type ThemePalette, tokenToCssVar } from '@protoyard/core';
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

/** Every CSS custom property the theme engine controls, as a plain map. */
export function themeVariables(input: AppearanceInput): Record<string, string> {
  const palette: ThemePalette =
    input.resolvedMode === 'dark' ? input.theme.dark : input.theme.light;
  const vars: Record<string, string> = {};
  for (const [token, value] of Object.entries(palette)) vars[tokenToCssVar(token)] = value;
  vars['--py-radius'] = input.theme.radius;
  vars['--py-font-sans'] = input.theme.fontFamily;
  vars['--py-font-heading'] = input.theme.fontFamilyHeading ?? input.theme.fontFamily;
  vars['--py-font-mono'] = input.theme.fontFamilyMono;
  vars['--py-density'] = String(densityScale(input.density, input.theme));
  vars['--py-motion'] = input.reducedMotion ? '0' : '1';
  return vars;
}

export interface AppliedAppearance {
  themeId: string;
  mode: ResolvedMode;
  reducedMotion: boolean;
  density: number;
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
  target.classList.toggle('dark', input.resolvedMode === 'dark');
  target.classList.toggle('light', input.resolvedMode === 'light');
  target.style.colorScheme = input.resolvedMode;
  return {
    themeId: input.theme.id,
    mode: input.resolvedMode,
    reducedMotion,
    density: Number(vars['--py-density']),
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
  target.classList.remove('dark', 'light');
  target.style.removeProperty('color-scheme');
}
