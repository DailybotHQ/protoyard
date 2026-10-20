import {
  definePrototype,
  type GenerateContext,
  type PrototypeDefinition,
  parseManifest,
  type Theme,
  type WorldSeed,
} from '@protoyard/core';
import { type AppModel, deriveAppModel } from './app-model.ts';
import { brandLibraryThemeId, resolveBlueprintBrand } from './brand.ts';
import { blueprintGeneratorVersion } from './generator-version.ts';
import { deriveDatabaseVersions, latestSchemaVersion } from './migrations.ts';
import { derivePolicy } from './policy.ts';
import { blueprintScenarios } from './scenarios.ts';
import type { Blueprint } from './schema.ts';
import { deriveIntegrity } from './storage.ts';

/**
 * A complete prototype definition derived from a blueprint at runtime
 * (ADR-029): what `protoyard generate` writes as files, built in memory so
 * the player can run a blueprint with no build. Codegen and the player share
 * every derivation (database versions, policy, integrity, scenarios, brand
 * theme, app model), so a blueprint behaves the same at both levels.
 */

export interface RuntimeDefinitionOptions {
  /** Storage namespace (IndexedDB names): usually the blueprint's content namespace (`bp-…`). */
  namespace: string;
  /** Manifest slug; defaults to the namespace (which must then be a valid slug of at most 48 characters). */
  slug?: string;
  /** Manifest version (default `0.1.0`). */
  version?: string;
}

export interface RuntimeDefinition {
  definition: PrototypeDefinition;
  appModel: AppModel;
}

/** Scenario a blueprint prototype opens in (one of `blueprintScenarios`). */
export const BLUEPRINT_DEFAULT_SCENARIO = 'active';

/**
 * The theme id a blueprint opens in: its library theme, the id of the theme
 * its brand builds, or null without a brand. `protoyard generate` writes it to
 * `protoyard.json` and the player uses it as `defaultTheme`. Throws
 * `BrandThemeError` for an unknown library theme or a brand that fails AA.
 */
export function brandDefaultThemeId(blueprint: Blueprint): string | null {
  if (!blueprint.brand) return null;
  const libraryTheme = brandLibraryThemeId(blueprint.brand);
  if (libraryTheme) return libraryTheme;
  return resolveBlueprintBrand(blueprint.brand, { blueprintName: blueprint.name }).id;
}

/** The theme a blueprint's brand builds, or null for no brand or a library brand (shipped by id). */
export function blueprintBrandTheme(blueprint: Blueprint): Theme | null {
  if (!blueprint.brand || brandLibraryThemeId(blueprint.brand)) return null;
  return resolveBlueprintBrand(blueprint.brand, { blueprintName: blueprint.name });
}

/**
 * Builds a `definePrototype`-valid definition from a parsed blueprint, plus
 * its app model. The world generator loads lazily (`@protoyard/blueprint/generator`
 * stays out of the caller's initial chunk until a scenario seeds).
 */
export function definePrototypeFromBlueprint(
  blueprint: Blueprint,
  options: RuntimeDefinitionOptions
): RuntimeDefinition {
  const slug = options.slug ?? options.namespace;
  const scenarios = blueprintScenarios(blueprint);
  const appModel = deriveAppModel(blueprint);
  const theme = blueprintBrandTheme(blueprint);
  const manifest = parseManifest({
    id: `local.${slug}`,
    slug,
    kind: 'prototype',
    name: blueprint.name,
    description: blueprint.description ?? '',
    version: options.version ?? '0.1.0',
    category: blueprint.category ?? blueprint.catalog?.category ?? 'general',
    tags: blueprint.tags,
    ...(blueprint.icon ? { icon: blueprint.icon } : {}),
    defaultScenario: BLUEPRINT_DEFAULT_SCENARIO,
    defaultTheme: brandDefaultThemeId(blueprint) ?? 'violet',
    preview: {
      viewport: 'desktop',
      layout: { id: appModel.layout.id },
    },
    storage: { namespace: options.namespace, schemaVersion: latestSchemaVersion(blueprint) },
    scenarios: scenarios.map((scenario) => scenario.id),
  });
  const definition = definePrototype({
    manifest,
    database: { versions: deriveDatabaseVersions(blueprint) },
    scenarios,
    policy: derivePolicy(blueprint),
    integrity: deriveIntegrity(blueprint),
    ...(theme ? { themes: [theme] } : {}),
    async generate(ctx: GenerateContext): Promise<WorldSeed> {
      const { createBlueprintGenerator } = await import('./generator.ts');
      return createBlueprintGenerator(blueprint).generate(ctx);
    },
    generatorVersion: blueprintGeneratorVersion(blueprint),
  });
  return { definition, appModel };
}
