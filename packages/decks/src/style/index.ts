import type { AppearanceInput, ResolvedMode } from '@protoyard/themes';
import {
  createThemeFromSeed,
  findTheme,
  getFontPairing,
  getLibraryThemeMeta,
  getTheme,
  loadLibraryTheme,
  themeVariables,
} from '@protoyard/themes';
import type { DeckStyle } from '../schema/index.ts';

export type DeckStyleWarningCode = 'unknown-theme' | 'unknown-font-pair';

export interface DeckStyleWarning {
  code: DeckStyleWarningCode;
  message: string;
  value: string;
}

export interface ResolveDeckStyleOptions {
  /** Appearance mode chosen by the host. Decks default to light for stable exports. */
  mode?: ResolvedMode;
  /** Honor a host or operating-system reduced-motion preference. */
  reducedMotion?: boolean;
}

export interface ResolvedDeckStyle {
  /** Effective deck style after applying the slide-level override. */
  style: DeckStyle;
  /** Input for `@protoyard/themes` `applyAppearance`. */
  appearance: AppearanceInput;
  /** All theme and deck CSS custom properties. */
  variables: Record<string, string>;
  /** Resolution issues that were recovered with a documented fallback. */
  warnings: DeckStyleWarning[];
}

const DEFAULT_STYLE: DeckStyle = {};
const RADIUS: Record<NonNullable<DeckStyle['radius']>, string> = {
  none: '0',
  small: '0.25rem',
  medium: '0.625rem',
  large: '1rem',
  full: '9999px',
};
const DENSITY: Record<NonNullable<DeckStyle['density']>, number> = {
  compact: 0.875,
  comfortable: 1.125,
  spacious: 1.25,
};
const ASPECT_RATIO: Record<NonNullable<DeckStyle['aspect']>, string> = {
  '16:9': '16 / 9',
  '4:3': '4 / 3',
  '9:16': '9 / 16',
  '1:1': '1 / 1',
};

function seedColor(seed: number): string {
  return `#${(seed >>> 0).toString(16).padStart(8, '0').slice(-6)}`;
}

async function resolveTheme(style: DeckStyle, warnings: DeckStyleWarning[]) {
  if (style.paletteSeed !== undefined) {
    return createThemeFromSeed({
      id: `deck-seed-${style.paletteSeed.toString(16)}`,
      name: 'Deck palette',
      seed: seedColor(style.paletteSeed),
    });
  }

  if (!style.theme) return getTheme(undefined);

  const builtin = findTheme(style.theme);
  if (builtin) return builtin;

  if (getLibraryThemeMeta(style.theme)) {
    return loadLibraryTheme(style.theme);
  }

  warnings.push({
    code: 'unknown-theme',
    value: style.theme,
    message: `Unknown theme "${style.theme}"; using the default theme.`,
  });
  return getTheme(undefined);
}

/**
 * Resolve a bounded deck style and an optional slide override into theme and
 * deck CSS variables. The input should first pass `DeckStyleSchema` validation.
 */
export async function resolveDeckStyle(
  style: DeckStyle = DEFAULT_STYLE,
  slideOverride?: Partial<DeckStyle>,
  options: ResolveDeckStyleOptions = {}
): Promise<ResolvedDeckStyle> {
  const effective: DeckStyle = { ...style, ...slideOverride };
  const warnings: DeckStyleWarning[] = [];
  const theme = await resolveTheme(effective, warnings);
  const pairing = effective.fontPair ? getFontPairing(effective.fontPair) : undefined;

  if (effective.fontPair && !pairing) {
    warnings.push({
      code: 'unknown-font-pair',
      value: effective.fontPair,
      message: `Unknown font pairing "${effective.fontPair}"; using the theme font pairing.`,
    });
  }

  const appearance: AppearanceInput = {
    theme,
    resolvedMode: options.mode ?? 'light',
    reducedMotion: Boolean(options.reducedMotion || effective.motion === 'none'),
    density: DENSITY[effective.density ?? 'comfortable'],
  };
  const variables = themeVariables(appearance);
  // Deck overrides write Texuli's canonical --tx-* names, which Texuli components
  // read, and the deprecated --py-* aliases for Protoyard's own CSS.
  if (pairing) {
    for (const prefix of ['--tx', '--py']) {
      variables[`${prefix}-font-sans`] = pairing.fontFamily;
      variables[`${prefix}-font-heading`] = pairing.fontFamilyHeading;
      variables[`${prefix}-font-mono`] = pairing.fontFamilyMono;
    }
  }

  variables['--py-deck-aspect-ratio'] = ASPECT_RATIO[effective.aspect ?? '16:9'];
  variables['--py-deck-density'] = String(DENSITY[effective.density ?? 'comfortable']);
  variables['--py-deck-radius'] = RADIUS[effective.radius ?? 'medium'];
  variables['--tx-radius'] = RADIUS[effective.radius ?? 'medium'];
  variables['--py-radius'] = RADIUS[effective.radius ?? 'medium'];
  variables['--py-deck-motion'] = effective.motion ?? 'full';
  variables['--py-deck-transition'] = effective.transition ?? 'fade';
  variables['--py-deck-background'] = effective.background ?? 'solid-color';
  variables['--py-deck-progress'] = effective.progress ?? 'bottom';
  variables['--py-deck-slide-numbers'] = effective.slideNumbers === false ? '0' : '1';

  return { style: effective, appearance, variables, warnings };
}
