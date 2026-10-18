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
  AUDIT_REDACTED,
  type AuditAction,
  type AuditChange,
  type AuditEntry,
  type AuditEvent,
  auditDiff,
  type BlueprintAuditService,
  blueprintUsesAudit,
  createAuditService,
  createAuditWriter,
} from './audit.ts';
export {
  type BrandContrastFailure,
  BrandThemeError,
  brandThemeExportName,
  brandThemeId,
  emitBrandThemeModule,
  getStyleProfile,
  type ResolveBrandOptions,
  resolveBlueprintBrand,
  STYLE_PROFILES,
  type StyleProfile,
} from './brand.ts';
export {
  type BlueprintFile,
  type BlueprintFileMetadata,
  createFileServices,
  DEFAULT_FILE_QUOTA_BYTES,
  type FileService,
  type FileServices,
  FileUploadError,
  type FileUploadProgress,
} from './files.ts';
export {
  appendMigration,
  applyUpgradeOps,
  type BlueprintMigration,
  type DiffBlueprintsOptions,
  defaultForField,
  diffBlueprints,
  fieldProperty,
  MigrationError,
  toDatabaseVersion,
  type UpgradeOp,
} from './migrations.ts';
export {
  type BlueprintNotificationService,
  createNotificationService,
  createNotificationWriter,
  type NotificationEvent,
} from './notifications.ts';
export { CAPABILITIES, derivePolicy, type EntityCapabilityMap } from './policy.ts';
export {
  BLUEPRINT_SCHEMA_URL,
  type Blueprint,
  type BlueprintBrand,
  type BlueprintBrandInput,
  BlueprintBrandSchema,
  type BlueprintEntity,
  type BlueprintField,
  type BlueprintInput,
  type BlueprintNotificationRule,
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
  PermissionActionSchema,
  parseBlueprint,
  RESERVED_FIELD_NAMES,
  RoleSchema,
  ScreenSchema,
  safeParseBlueprint,
} from './schema.ts';
export {
  BULK_CHUNK,
  createEntityServices,
  EntityInUseError,
  EntityNotFoundError,
  type EntityService,
  type EntityServices,
  type ExportCsvFilter,
  ImportCsvError,
  type ImportCsvOptions,
  type ImportCsvResult,
  UNDO_WINDOW_MS,
} from './services.ts';
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
