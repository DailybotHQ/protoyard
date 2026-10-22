import { createRng, type LayoutId } from '@protoyard/core';
import { entityLabel } from './app-model.ts';
import { canonicalJson } from './identity.ts';
import type { DeckBlueprint, DocBlueprint, PageBlueprint } from './kinds/envelope.ts';
import { type Blueprint, type BlueprintBrand, parseBlueprint } from './schema.ts';

/**
 * Deterministic blueprint variants for `protoyard quick --variants` (ADR-031).
 * Each variant changes the shell, not the domain: its layout, theme, spacing
 * density and which entity comes first. Entities, fields, roles and data stay
 * the same, so variants of one idea compare like for like.
 *
 * The theme and layout catalogs come from the caller (the CLI reads them from
 * @protoyard/themes and @protoyard/core), so this module needs no theme code.
 * Randomness is a core seeded RNG over the caller's seed plus the blueprint's
 * canonical JSON: the same input always yields byte-identical variants.
 */

/** Built-in theme presets a brand can name (`brand.preset`); other theme ids are library themes. */
export const VARIANT_THEME_PRESETS = [
  'violet',
  'ocean',
  'emerald',
  'rose',
  'amber',
  'monochrome',
] as const;
export const VARIANT_DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
export type VariantDensity = (typeof VARIANT_DENSITIES)[number];
/** `brand.density` multipliers (the schema allows 0.75–1.25). */
export const VARIANT_DENSITY_SCALE: Readonly<Record<VariantDensity, number>> = {
  compact: 0.85,
  comfortable: 1,
  spacious: 1.15,
};
export const VARIANT_MAX_COUNT = 8;

export interface VariantAxes {
  /** Layout ids to choose from; omitted or empty keeps the blueprint's layout. */
  layouts?: readonly LayoutId[];
  /** Theme ids: a built-in preset (`ocean`) or a library theme id; omitted keeps the brand. */
  themes?: readonly string[];
  /**
   * Densities to choose from (default: all three). Density needs a preset or
   * seed brand: a library theme carries its own, so it is not varied there.
   */
  densities?: readonly VariantDensity[];
  /** Vary which entity comes first in navigation and screens (default true). */
  emphasis?: boolean;
}

export interface DeriveVariantsOptions {
  /** 1 to 8. */
  count: number;
  /** Any string; the same seed and blueprint give the same variants. */
  seed?: string;
  axes?: VariantAxes;
}

export interface VariantChanges {
  layout?: LayoutId;
  theme?: string;
  density?: VariantDensity;
  /** Entity name moved first. */
  primaryEntity?: string;
}

export interface BlueprintVariant {
  /** `v1` … `v8`. */
  id: string;
  /** What changed, for people: `Rail layout · Ocean theme · Compact · Bookings first`. */
  label: string;
  changes: VariantChanges;
  blueprint: Blueprint;
}

interface Combo {
  layout: LayoutId | null;
  theme: string | null;
  density: VariantDensity | null;
  primary: string | null;
}

const PRESETS: ReadonlySet<string> = new Set(VARIANT_THEME_PRESETS);

function titleCase(id: string): string {
  return id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/** Whether a brand built from `theme` (or the current brand) can carry `brand.density`. */
function densityApplies(blueprint: Blueprint, theme: string | null): boolean {
  if (theme !== null) return PRESETS.has(theme);
  const brand = blueprint.brand;
  return brand !== undefined && brand.libraryTheme === undefined;
}

function combos(blueprint: Blueprint, axes: VariantAxes): Combo[] {
  const layouts: (LayoutId | null)[] = axes.layouts?.length ? unique(axes.layouts) : [null];
  const themes: (string | null)[] = axes.themes?.length ? unique(axes.themes) : [null];
  const densities = unique(axes.densities ?? VARIANT_DENSITIES);
  const primaries: (string | null)[] =
    axes.emphasis === false || blueprint.entities.length < 2
      ? [null]
      : blueprint.entities.map((entity) => entity.name);
  const out: Combo[] = [];
  for (const layout of layouts) {
    for (const theme of themes) {
      const options: (VariantDensity | null)[] =
        densities.length > 0 && densityApplies(blueprint, theme) ? densities : [null];
      for (const density of options) {
        for (const primary of primaries) out.push({ layout, theme, density, primary });
      }
    }
  }
  return out;
}

function themedBrand(blueprint: Blueprint, combo: Combo): BlueprintBrand | undefined {
  const current = blueprint.brand;
  if (combo.theme === null) {
    if (combo.density === null || current === undefined) return current;
    const { density: _density, ...rest } = current;
    return { ...rest, ...densityKey(combo.density) };
  }
  const name = current?.name;
  if (PRESETS.has(combo.theme)) {
    return {
      ...(name === undefined ? {} : { name }),
      preset: combo.theme as BlueprintBrand['preset'],
      ...(combo.density === null ? {} : densityKey(combo.density)),
    };
  }
  return { ...(name === undefined ? {} : { name }), libraryTheme: combo.theme };
}

/** `comfortable` is the default spacing, so it drops `brand.density` instead of writing 1. */
function densityKey(density: VariantDensity): { density?: number } {
  return density === 'comfortable' ? {} : { density: VARIANT_DENSITY_SCALE[density] };
}

function moveFirst<T>(items: readonly T[], matches: (item: T) => boolean): T[] {
  return [...items.filter(matches), ...items.filter((item) => !matches(item))];
}

function apply(blueprint: Blueprint, combo: Combo): Blueprint {
  const next = structuredClone(blueprint) as Blueprint;
  if (combo.layout !== null) {
    const mobile = next.layout?.mobile;
    next.layout = { id: combo.layout, ...(mobile === undefined ? {} : { mobile }) };
  }
  const brand = themedBrand(next, combo);
  if (brand === undefined) delete next.brand;
  else next.brand = brand;
  if (combo.primary !== null) {
    const primary = combo.primary;
    next.entities = moveFirst(next.entities, (entity) => entity.name === primary);
    next.screens = moveFirst(
      next.screens,
      (screen) => 'entity' in screen && screen.entity === primary
    );
  }
  return parseBlueprint(next);
}

function label(blueprint: Blueprint, combo: Combo): string {
  const parts: string[] = [];
  if (combo.layout !== null) parts.push(`${titleCase(combo.layout)} layout`);
  if (combo.theme !== null) parts.push(`${titleCase(combo.theme)} theme`);
  if (combo.density !== null) parts.push(titleCase(combo.density));
  if (combo.primary !== null) {
    const entity = blueprint.entities.find((candidate) => candidate.name === combo.primary);
    if (entity) parts.push(`${entityLabel(entity)} first`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'As written';
}

function changes(combo: Combo): VariantChanges {
  return {
    ...(combo.layout === null ? {} : { layout: combo.layout }),
    ...(combo.theme === null ? {} : { theme: combo.theme }),
    ...(combo.density === null ? {} : { density: combo.density }),
    ...(combo.primary === null ? {} : { primaryEntity: combo.primary }),
  };
}

/**
 * Returns `count` distinct, valid variants of `blueprint`, none identical to
 * the blueprint itself. Throws a RangeError when the axes cannot produce that
 * many, and the schema's error when a catalog id is invalid (for example an
 * unknown layout).
 */
export function deriveVariants(
  blueprint: Blueprint,
  options: DeriveVariantsOptions
): BlueprintVariant[] {
  const { count } = options;
  if (!Number.isInteger(count) || count < 1 || count > VARIANT_MAX_COUNT) {
    throw new RangeError(`count must be an integer from 1 to ${VARIANT_MAX_COUNT} (got ${count}).`);
  }
  const base = parseBlueprint(blueprint);
  const baseJson = canonicalJson(base);
  const rng = createRng(`protoyard-variants:${options.seed ?? ''}:${baseJson}`);
  const seen = new Set([baseJson]);
  const variants: BlueprintVariant[] = [];
  for (const combo of rng.shuffle(combos(base, options.axes ?? {}))) {
    if (variants.length === count) break;
    const next = apply(base, combo);
    const json = canonicalJson(next);
    if (seen.has(json)) continue;
    seen.add(json);
    variants.push({
      id: `v${variants.length + 1}`,
      label: label(base, combo),
      changes: changes(combo),
      blueprint: next,
    });
  }
  if (variants.length < count) {
    throw new RangeError(
      `Only ${variants.length} distinct variant(s) are possible with these axes; add layouts or themes, or lower the count.`
    );
  }
  return variants;
}

// ── Content kinds (decks, pages, docs) ───────────────────────────────────────

/** Deck transitions a variant may set (`deck.style.transition`). */
export const VARIANT_DECK_TRANSITIONS = ['none', 'fade', 'slide', 'zoom', 'morph'] as const;
export type VariantDeckTransition = (typeof VARIANT_DECK_TRANSITIONS)[number];

/**
 * What a content-kind variant may change. A deck varies its own style
 * (`deck.style`: theme, transition, density, font pair); a page or doc has no
 * renderer style yet, so it varies its brand (theme and density), like an
 * app's shell. Slides, sections, blocks and text never change.
 */
export interface KindVariantAxes {
  /** Theme ids: a built-in preset or a library theme id. */
  themes?: readonly string[];
  /** Deck only (default: every transition). */
  transitions?: readonly VariantDeckTransition[];
  /** Default: all three. */
  densities?: readonly VariantDensity[];
  /** Deck only: font pairing ids (`@protoyard/themes` FONT_CATALOG). */
  fontPairs?: readonly string[];
}

export interface KindVariantChanges {
  theme?: string;
  transition?: VariantDeckTransition;
  density?: VariantDensity;
  fontPair?: string;
}

export interface KindBlueprintVariant<B extends DeckBlueprint | PageBlueprint | DocBlueprint> {
  /** `v1` … `v8`. */
  id: string;
  /** What changed: `Ocean theme · Fade transition · Compact · Humanist fonts`. */
  label: string;
  changes: KindVariantChanges;
  blueprint: B;
}

export interface DeriveKindVariantsOptions {
  /** 1 to 8. */
  count: number;
  /** Any string; the same seed and blueprint give the same variants. */
  seed?: string;
  axes?: KindVariantAxes;
}

interface KindCombo {
  theme: string | null;
  transition: VariantDeckTransition | null;
  density: VariantDensity | null;
  fontPair: string | null;
}

function kindCombos(kind: 'deck' | 'page' | 'doc', axes: KindVariantAxes): KindCombo[] {
  const deck = kind === 'deck';
  const themes: (string | null)[] = axes.themes?.length ? unique(axes.themes) : [null];
  const transitions: (VariantDeckTransition | null)[] = deck
    ? unique(axes.transitions ?? VARIANT_DECK_TRANSITIONS)
    : [null];
  const densities = unique(axes.densities ?? VARIANT_DENSITIES);
  const fontPairs: (string | null)[] =
    deck && axes.fontPairs?.length ? unique(axes.fontPairs) : [null];
  const out: KindCombo[] = [];
  for (const theme of themes) {
    // A page or doc brand carries a density only with a preset (a library theme has its own).
    const options: (VariantDensity | null)[] =
      densities.length === 0 || (!deck && theme !== null && !PRESETS.has(theme))
        ? [null]
        : densities;
    for (const transition of transitions.length > 0 ? transitions : [null]) {
      for (const density of options) {
        for (const fontPair of fontPairs) out.push({ theme, transition, density, fontPair });
      }
    }
  }
  return out;
}

function applyKind<B extends DeckBlueprint | PageBlueprint | DocBlueprint>(
  blueprint: B,
  combo: KindCombo
): B {
  const next = structuredClone(blueprint) as B;
  if (next.kind === 'deck') {
    const style = { ...next.deck.style };
    if (combo.theme !== null) {
      // A theme and a palette seed are exclusive (as in Deck Studio).
      delete style.paletteSeed;
      style.theme = combo.theme;
    }
    if (combo.transition !== null) style.transition = combo.transition;
    if (combo.density !== null) style.density = combo.density;
    if (combo.fontPair !== null) style.fontPair = combo.fontPair;
    next.deck = { ...next.deck, style };
    return next;
  }
  const brand = themedBrand(next as unknown as Blueprint, {
    layout: null,
    theme: combo.theme,
    density: combo.density,
    primary: null,
  });
  if (brand === undefined) delete (next as { brand?: unknown }).brand;
  else (next as { brand?: BlueprintBrand }).brand = brand;
  return next;
}

function kindLabel(combo: KindCombo): string {
  const parts: string[] = [];
  if (combo.theme !== null) parts.push(`${titleCase(combo.theme)} theme`);
  if (combo.transition !== null) parts.push(`${titleCase(combo.transition)} transition`);
  if (combo.density !== null) parts.push(titleCase(combo.density));
  if (combo.fontPair !== null) parts.push(`${titleCase(combo.fontPair)} fonts`);
  return parts.length > 0 ? parts.join(' · ') : 'As written';
}

function kindChanges(combo: KindCombo): KindVariantChanges {
  return {
    ...(combo.theme === null ? {} : { theme: combo.theme }),
    ...(combo.transition === null ? {} : { transition: combo.transition }),
    ...(combo.density === null ? {} : { density: combo.density }),
    ...(combo.fontPair === null ? {} : { fontPair: combo.fontPair }),
  };
}

/**
 * `count` distinct variants of a deck, page or doc, none identical to it:
 * only the style axes change (see `KindVariantAxes`). Deterministic like
 * `deriveVariants`: the same blueprint, seed and axes give byte-identical
 * variants. The caller validates the result (`safeParseAnyBlueprint`) when
 * an axis value may be unknown. Throws a RangeError when the axes cannot
 * produce that many.
 */
export function deriveKindVariants<B extends DeckBlueprint | PageBlueprint | DocBlueprint>(
  blueprint: B,
  options: DeriveKindVariantsOptions
): KindBlueprintVariant<B>[] {
  const { count } = options;
  if (!Number.isInteger(count) || count < 1 || count > VARIANT_MAX_COUNT) {
    throw new RangeError(`count must be an integer from 1 to ${VARIANT_MAX_COUNT} (got ${count}).`);
  }
  const baseJson = canonicalJson(blueprint);
  const rng = createRng(`protoyard-kind-variants:${options.seed ?? ''}:${baseJson}`);
  const seen = new Set([baseJson]);
  const variants: KindBlueprintVariant<B>[] = [];
  for (const combo of rng.shuffle(kindCombos(blueprint.kind, options.axes ?? {}))) {
    if (variants.length === count) break;
    const next = applyKind(blueprint, combo);
    const json = canonicalJson(next);
    if (seen.has(json)) continue;
    seen.add(json);
    variants.push({
      id: `v${variants.length + 1}`,
      label: kindLabel(combo),
      changes: kindChanges(combo),
      blueprint: next,
    });
  }
  if (variants.length < count) {
    throw new RangeError(
      `Only ${variants.length} distinct variant(s) are possible with these axes; add themes or lower the count.`
    );
  }
  return variants;
}
