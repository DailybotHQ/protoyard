import type { PrototypeDefinition, Theme } from '@protoyard/core';
import { brandLibraryThemeId, resolveBlueprintBrand } from '../brand.ts';
import {
  type AnyContentBlueprint,
  defineKindPrototype,
  type KindRuntimeOptions,
} from './runtime.ts';

/**
 * Brand resolution for content kinds, kept apart from `runtime.ts`: a seed
 * brand needs the palette generator (`createThemeFromSeed`), so only callers
 * that resolve a brand at run time (the player, `definePrototypeFromPage`)
 * load it. Generated kind prototypes get the resolved theme from
 * `protoyard generate` and call `defineKindPrototype` directly.
 */

/** The theme id a content blueprint opens in: its library theme, its built brand theme, or null. */
export function kindDefaultThemeId(doc: AnyContentBlueprint): string | null {
  if (!doc.brand) return null;
  return (
    brandLibraryThemeId(doc.brand) ??
    resolveBlueprintBrand(doc.brand, { blueprintName: doc.name }).id
  );
}

/** The built brand theme a content blueprint registers, or null (no brand, or a library brand). */
export function kindBrandTheme(doc: AnyContentBlueprint): Theme | null {
  if (!doc.brand || brandLibraryThemeId(doc.brand)) return null;
  return resolveBlueprintBrand(doc.brand, { blueprintName: doc.name });
}

/**
 * Builds a `definePrototype`-valid definition for a deck, page or doc. Throws
 * `BrandThemeError` for an unknown library theme or a brand that fails AA,
 * like the app path.
 */
export function defineKindRuntime(
  doc: AnyContentBlueprint,
  options: KindRuntimeOptions
): PrototypeDefinition {
  const brandTheme = kindBrandTheme(doc);
  return defineKindPrototype(doc, {
    ...options,
    brandTheme,
    defaultThemeId: brandTheme?.id ?? kindDefaultThemeId(doc),
  });
}
