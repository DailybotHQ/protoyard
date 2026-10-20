/**
 * Resolve an optional blueprint `brand` block into a full Theme for
 * `protoyard generate`. Palette tokens come from `@protoyard/themes`
 * (`createThemeFromSeed` or a built-in preset); fonts, radius and density
 * come from the brand and/or a named style profile. Every resolved theme is
 * checked against WCAG AA text and UI pairs before it is returned.
 */

import { defineTheme, type Theme, type ThemeStyleInput } from '@protoyard/core';
import {
  BUILTIN_THEMES,
  contrastRatio,
  createThemeFromSeed,
  getFontPairing,
  getLibraryThemeMeta,
  TEXT_CONTRAST_PAIRS,
  THEME_LIBRARY_META,
  UI_CONTRAST_PAIRS,
} from '@protoyard/themes';
import { z } from 'zod';
import type { BlueprintBrand } from './schema.ts';

export interface StyleProfile {
  id: string;
  label: string;
  radius?: string;
  density?: number;
  font?: string;
  style?: ThemeStyleInput;
}

/** Named style knobs applied after the palette (or preset) is chosen. */
export const STYLE_PROFILES: readonly StyleProfile[] = [
  {
    id: 'soft',
    label: 'Soft',
    radius: '0.75rem',
    density: 1.05,
    style: { elevation: 'soft', shape: { radiusScale: 1.2 } },
  },
  {
    id: 'crisp',
    label: 'Crisp',
    radius: '0.375rem',
    density: 0.9,
    style: { elevation: 'crisp', shape: { radiusScale: 0.6, borderWidth: '1px' } },
  },
  {
    id: 'flat',
    label: 'Flat',
    radius: '0.5rem',
    density: 1,
    style: { elevation: 'flat', shape: { borderWidth: '1px' } },
  },
  {
    id: 'rounded',
    label: 'Rounded',
    radius: '1rem',
    density: 1.05,
    style: { elevation: 'soft', shape: { radiusScale: 1.6 }, surface: 'solid' },
  },
  {
    id: 'editorial',
    label: 'Editorial',
    radius: '0.25rem',
    density: 1.05,
    font: 'editorial',
    style: {
      elevation: 'soft',
      typography: {
        scaleRatio: 1.25,
        weights: { body: 400, medium: 500, heading: 600, bold: 700 },
        tracking: { body: '0.01em', heading: '-0.02em' },
      },
    },
  },
  {
    id: 'mono',
    label: 'Mono',
    radius: '0.375rem',
    density: 0.9,
    font: 'mono',
    style: {
      elevation: 'crisp',
      surface: 'solid',
      shape: { radiusScale: 0.6, borderWidth: '1px' },
      typography: { tracking: { body: '0', heading: '-0.02em' } },
    },
  },
] as const;

export function getStyleProfile(id: string): StyleProfile | undefined {
  return STYLE_PROFILES.find((profile) => profile.id === id);
}

export interface ResolveBrandOptions {
  /** Blueprint product name — used when brand.name / brand.id are omitted. */
  blueprintName?: string;
}

export class BrandThemeError extends Error {
  readonly failures: readonly BrandContrastFailure[];
  constructor(message: string, failures: readonly BrandContrastFailure[] = []) {
    super(message);
    this.name = 'BrandThemeError';
    this.failures = failures;
  }
}

export interface BrandContrastFailure {
  mode: 'light' | 'dark';
  foreground: string;
  background: string;
  minimum: number;
  ratio: number;
}

/** Edit distance between two short ids (single-row Levenshtein). */
function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0] as number;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j] as number;
      row[j] = Math.min(
        above + 1,
        (row[j - 1] as number) + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return row[b.length] as number;
}

/**
 * Up to `limit` ids from `known` nearest to `id`: ids that contain it (or that
 * it contains) first, then by edit distance, ties in `known` order. Only ids
 * within half the longer length are suggested, so unrelated names stay out.
 */
export function closestIds(id: string, known: readonly string[], limit = 3): string[] {
  return known
    .map((candidate, index) => {
      const contains = candidate.includes(id) || id.includes(candidate);
      return { candidate, index, distance: contains ? 0 : editDistance(id, candidate) };
    })
    .filter(
      ({ candidate, distance }) => distance <= Math.ceil(Math.max(id.length, candidate.length) / 2)
    )
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

/**
 * The library theme a brand names (`brand.libraryTheme`), or `undefined` when
 * the brand builds its own theme. A library brand needs no generated module:
 * the prototype's `defaultTheme` is the library id and the renderer loads it.
 * Throws `BrandThemeError` (with the closest ids) when the library does not
 * know the id.
 */
export function brandLibraryThemeId(brand: BlueprintBrand): string | undefined {
  const id = brand.libraryTheme;
  if (id === undefined || getLibraryThemeMeta(id)) return id;
  const near = closestIds(
    id,
    THEME_LIBRARY_META.map((meta) => meta.id)
  );
  throw new BrandThemeError(
    `Unknown library theme "${id}"${near.length > 0 ? ` (closest: ${near.join(', ')})` : ''}.`
  );
}

/**
 * Stable theme id from brand or blueprint name (`Acme Labs` → `acme-labs`);
 * a library brand's id is the library theme id.
 */
export function brandThemeId(brand: BlueprintBrand, blueprintName?: string): string {
  if (brand.libraryTheme) return brand.libraryTheme;
  if (brand.id) return brand.id;
  const source = brand.name ?? blueprintName ?? 'brand';
  const slug = source
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length === 0) return 'brand';
  // Theme ids (and so export names) start with a letter: `3D Print` → `brand-3d-print`.
  const id = /^[a-z]/.test(slug) ? slug : `brand-${slug}`;
  return id.slice(0, 40).replace(/-+$/, '');
}

const EXPORT_NAME = /^[A-Za-z_$][\w$]*$/;

/**
 * `acme-labs` → `acmeLabsTheme` for the generated module export. Throws
 * `BrandThemeError` for an id that cannot become a valid identifier.
 */
export function brandThemeExportName(themeId: string): string {
  const camel = themeId.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  const name = `${camel}Theme`;
  if (!EXPORT_NAME.test(name)) {
    throw new BrandThemeError(
      `Brand theme id "${themeId}" does not map to a valid export name; use lowercase kebab-case.`
    );
  }
  return name;
}

function themeDisplayName(brand: BlueprintBrand, blueprintName?: string): string {
  const raw = (brand.name ?? blueprintName ?? 'Brand').trim();
  return raw.slice(0, 40) || 'Brand';
}

function assertAa(theme: Theme): Theme {
  const failures: BrandContrastFailure[] = [];
  for (const mode of ['light', 'dark'] as const) {
    const palette = theme[mode];
    for (const [foreground, background] of TEXT_CONTRAST_PAIRS) {
      try {
        const ratio = contrastRatio(palette[foreground], palette[background]);
        if (ratio < 4.5) {
          failures.push({ mode, foreground, background, minimum: 4.5, ratio });
        }
      } catch {
        failures.push({ mode, foreground, background, minimum: 4.5, ratio: 0 });
      }
    }
    for (const [foreground, background] of UI_CONTRAST_PAIRS) {
      try {
        const ratio = contrastRatio(palette[foreground], palette[background]);
        if (ratio < 3) {
          failures.push({ mode, foreground, background, minimum: 3, ratio });
        }
      } catch {
        failures.push({ mode, foreground, background, minimum: 3, ratio: 0 });
      }
    }
  }
  if (failures.length > 0) {
    throw new BrandThemeError(
      `Brand theme "${theme.id}" fails WCAG AA (${failures.length} pair(s)).`,
      failures
    );
  }
  return theme;
}

function applyFinishes(
  theme: Theme,
  brand: BlueprintBrand,
  profile: StyleProfile | undefined
): Theme {
  const fontId = brand.font ?? profile?.font;
  const pairing = fontId ? getFontPairing(fontId) : undefined;
  if (fontId && !pairing) {
    throw new BrandThemeError(`Unknown font pairing "${fontId}".`);
  }
  const radius = brand.radius ?? profile?.radius;
  const density = brand.density ?? profile?.density;
  const style = profile?.style;

  return defineTheme({
    id: theme.id,
    name: theme.name,
    description: theme.description,
    light: theme.light,
    dark: theme.dark,
    fontFamily: pairing?.fontFamily ?? theme.fontFamily,
    ...(pairing?.fontFamilyHeading !== undefined
      ? { fontFamilyHeading: pairing.fontFamilyHeading }
      : theme.fontFamilyHeading
        ? { fontFamilyHeading: theme.fontFamilyHeading }
        : {}),
    fontFamilyMono: pairing?.fontFamilyMono ?? theme.fontFamilyMono,
    radius: radius ?? theme.radius,
    density: density ?? theme.density,
    ...(style || theme.style ? { style: { ...(theme.style ?? {}), ...(style ?? {}) } } : {}),
  });
}

/**
 * Build a complete Theme from a validated blueprint brand block.
 * Throws `BrandThemeError` when the result fails AA or a catalog id is unknown,
 * and for a library brand, which ships by id (see `brandLibraryThemeId`).
 */
export function resolveBlueprintBrand(
  brand: BlueprintBrand,
  options: ResolveBrandOptions = {}
): Theme {
  try {
    return buildBrandTheme(brand, options);
  } catch (error) {
    // A theme the core schema rejects is a blueprint problem, not an internal error.
    if (error instanceof z.ZodError || (error as Error | null)?.name === 'ZodError') {
      const issue = (error as z.ZodError).issues[0];
      throw new BrandThemeError(
        `Brand theme is invalid: ${issue ? `${issue.path.map(String).join('.') || '(root)'} — ${issue.message}` : 'unknown error'}`
      );
    }
    throw error;
  }
}

function buildBrandTheme(brand: BlueprintBrand, options: ResolveBrandOptions): Theme {
  if (brand.libraryTheme) {
    throw new BrandThemeError(
      `Brand uses library theme "${brand.libraryTheme}"; it ships by id, so there is no theme to build.`
    );
  }
  const id = brandThemeId(brand, options.blueprintName);
  const name = themeDisplayName(brand, options.blueprintName);
  const profile = brand.styleProfile ? getStyleProfile(brand.styleProfile) : undefined;
  if (brand.styleProfile && !profile) {
    throw new BrandThemeError(`Unknown style profile "${brand.styleProfile}".`);
  }

  let base: Theme;
  if (brand.seed) {
    base = createThemeFromSeed({
      id,
      name,
      seed: brand.seed,
      ...(brand.secondary ? { secondary: brand.secondary } : {}),
      ...(profile?.style ? { style: profile.style } : {}),
    });
  } else {
    const presetId = brand.preset as string;
    const preset = BUILTIN_THEMES.find((theme) => theme.id === presetId);
    if (!preset) {
      throw new BrandThemeError(`Unknown theme preset "${presetId}".`);
    }
    base = defineTheme({
      ...preset,
      id,
      name,
      description: `Brand theme from the ${preset.name} preset.`,
      light: { ...preset.light },
      dark: { ...preset.dark },
      ...(preset.style ? { style: { ...preset.style } } : {}),
    });
  }

  // When seed already applied profile.style via createThemeFromSeed, still
  // apply font/radius/density (and style again is idempotent via merge).
  const finished = applyFinishes(base, brand, profile);
  return assertAa(finished);
}

/**
 * TypeScript module body for `src/generated/brand-theme.ts` (no header).
 * The CLI wraps it with the generate hash header.
 */
export function emitBrandThemeModule(theme: Theme): string {
  const exportName = brandThemeExportName(theme.id);
  return `import { defineTheme, type Theme } from '@protoyard/core';

/** On-brand theme derived from blueprint.json \`brand\` (Task 128). */
export const ${exportName}: Theme = defineTheme(${JSON.stringify(theme, null, 2)});

export default ${exportName};
`;
}
