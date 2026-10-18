/**
 * `@protoyard/blueprint` — data-only blueprints (ADR-017). A `blueprint.json`
 * describes a product (entities, fields, relations, roles, screens) without
 * any executable code; this package validates it and derives what a
 * prototype needs from it.
 *
 * Framework-agnostic: it depends only on `@protoyard/core` and zod and never
 * imports Svelte (ADR-002).
 */

/** Version of the blueprint document format. Bumped only on breaking changes. */
export const BLUEPRINT_FORMAT_VERSION = 1;

export {
  BLUEPRINT_SCHEMA_URL,
  type Blueprint,
  type BlueprintEntity,
  type BlueprintField,
  type BlueprintInput,
  type BlueprintRole,
  BlueprintSchema,
  type BlueprintScreen,
  blueprintIssues,
  blueprintJsonSchema,
  ENTITY_ACTIONS,
  type EntityAction,
  EntityFeaturesSchema,
  EntitySchema,
  entityTable,
  FIELD_KINDS,
  type FieldKind,
  FieldSchema,
  parseBlueprint,
  RESERVED_FIELD_NAMES,
  RoleSchema,
  ScreenSchema,
  safeParseBlueprint,
} from './schema.ts';
export {
  deriveIntegrity,
  deriveStores,
  entityStoreString,
  FEATURE_STORE_STRINGS,
  FEATURE_TABLES,
  relationProperty,
  storeIndexForField,
} from './storage.ts';
export {
  deriveInputSchemas,
  type EntityInput,
  type EntityInputSchemas,
  fieldLabel,
  inputProperty,
  parseMoneyText,
} from './validation.ts';
