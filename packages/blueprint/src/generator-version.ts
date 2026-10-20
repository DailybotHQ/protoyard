import { hashString } from '@protoyard/core';
import { GENERATOR_SDK_VERSION } from '@protoyard/scenarios';
import type { Blueprint } from './schema.ts';

/**
 * The world generator's version, apart from the generator itself: the
 * runtime definition needs it synchronously, while the generator
 * (`@protoyard/blueprint/generator`) loads lazily when a scenario seeds.
 */

/** Bump when the same blueprint + seed can produce a different world shape. */
export const BLUEPRINT_GENERATOR_SDK = 6;

/** Stable hash of a blueprint's generative surface (entities, fields, features). */
export function hashBlueprint(blueprint: Blueprint): number {
  const payload = {
    name: blueprint.name,
    entities: blueprint.entities.map((entity) => ({
      name: entity.name,
      plural: entity.plural,
      table: entity.table ?? null,
      titleField: entity.titleField,
      ownerField: entity.ownerField ?? null,
      seedCount: entity.seedCount ?? null,
      features: entity.features,
      fields: entity.fields.map((field) => ({
        name: field.name,
        kind: field.kind,
        required: field.required,
        fake: 'fake' in field ? (field.fake ?? null) : null,
        ...('values' in field ? { values: field.values } : {}),
        ...('min' in field ? { min: field.min ?? null, max: field.max ?? null } : {}),
        ...('minLength' in field
          ? { minLength: field.minLength ?? null, maxLength: field.maxLength ?? null }
          : {}),
        ...('cardinality' in field ? { to: field.to, cardinality: field.cardinality } : {}),
        ...(field.kind === 'geo' ? { region: field.region ?? null } : {}),
        ...('weights' in field ? { weights: field.weights ?? null } : {}),
        ...('window' in field ? { window: field.window ?? null } : {}),
        ...('trend' in field ? { trend: field.trend ?? null } : {}),
        ...('default' in field ? { default: field.default ?? null } : {}),
      })),
    })),
  };
  return hashString(JSON.stringify(payload));
}

export function blueprintGeneratorVersion(blueprint: Blueprint): number {
  return (
    (hashBlueprint(blueprint) ^
      ((BLUEPRINT_GENERATOR_SDK * 1_000_003) >>> 0) ^
      ((GENERATOR_SDK_VERSION * 97) >>> 0)) >>>
    0
  );
}
