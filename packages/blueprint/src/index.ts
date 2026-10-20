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
  type AggregateCell,
  type AggregateQuerySpec,
  type AggregateResult,
  type AggregateSpec,
  aggregate,
  type BucketUnit,
  bucketStartUtc,
  createAggregateQuery,
  MAX_BUCKETS,
  NO_GROUP,
} from './aggregate.ts';
export {
  type AppLayout,
  type AppModel,
  type AppNavGroup,
  type AppNavItem,
  type AppRoute,
  type AppRouteTarget,
  deriveAppModel,
  entityLabel,
  screenHasOwnView,
  screenNavIcon,
} from './app-model.ts';
export {
  ARCHETYPE_IDS as KIT_ARCHETYPE_IDS,
  ARCHETYPE_KIT_ENTRY_POINTS,
  type ArchetypeKitEntryPoint,
  ArchetypeSchema,
  type BlueprintArchetype,
  type BlueprintArchetypeInput,
} from './archetypes/index.ts';
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
  type BlueprintAuthoringDiagnostic,
  type BlueprintAuthoringValidation,
  type BlueprintDiagnosticPath,
  validateBlueprintForAuthoring,
} from './authoring-validation.ts';
export {
  AVATAR_IDS,
  type AvatarField,
  type AvatarId,
  avatarFields,
  isAvatarId,
  nextAvatar,
  primaryAvatarField,
} from './avatar.ts';
export {
  type BrandContrastFailure,
  BrandThemeError,
  brandLibraryThemeId,
  brandThemeExportName,
  brandThemeId,
  closestIds,
  emitBrandThemeModule,
  getStyleProfile,
  type ResolveBrandOptions,
  resolveBlueprintBrand,
  STYLE_PROFILES,
  type StyleProfile,
} from './brand.ts';
export {
  ARCHETYPE_IDS,
  ARCHETYPES,
  type Archetype,
  type BriefOptions,
  type BriefResult,
  blueprintFromBrief,
  fieldFromPhrase,
  GENERIC_ARCHETYPE,
  MAX_BRIEF_LENGTH,
  PEOPLE_ENTITIES,
  type SuggestedLayout,
} from './brief/index.ts';
export { guardCsvFormula, needsCsvFormulaGuard, unguardCsvFormula } from './csv-guard.ts';
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
  BLUEPRINT_NAMESPACE_PREFIX,
  type BlueprintIdentity,
  blueprintIdentity,
  canonicalJson,
} from './identity.ts';
export {
  appendMigration,
  applyUpgradeOps,
  type BlueprintMigration,
  type DiffBlueprintsOptions,
  defaultForField,
  deriveDatabaseVersions,
  diffBlueprints,
  fieldProperty,
  latestSchemaVersion,
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
export { blueprintScenarios } from './scenarios.ts';
export {
  AGGREGATES,
  type Aggregate,
  BLUEPRINT_SCHEMA_URL,
  type Blueprint,
  type BlueprintBrand,
  type BlueprintBrandInput,
  BlueprintBrandSchema,
  type BlueprintDashboardWidget,
  type BlueprintEntity,
  type BlueprintField,
  type BlueprintHistoryEntry,
  BlueprintHistoryEntrySchema,
  type BlueprintInput,
  type BlueprintNotificationRule,
  type BlueprintRole,
  BlueprintSchema,
  type BlueprintScreen,
  type BlueprintScreenFilter,
  type BlueprintScreenInput,
  type BlueprintScreenNav,
  BUCKET_UNITS,
  blueprintIssues,
  blueprintJsonSchema,
  CHART_KINDS,
  DashboardWidgetSchema,
  type DateWindow,
  DateWindowSchema,
  DETAIL_TABS,
  dashboardWidgets,
  dateWindowDays,
  ENTITY_ACTIONS,
  type EntityAction,
  EntityFeaturesSchema,
  EntitySchema,
  entityTable,
  FIELD_KINDS,
  FIELD_TRENDS,
  type FieldKind,
  FieldSchema,
  PermissionActionSchema,
  parseBlueprint,
  RESERVED_FIELD_NAMES,
  RESERVED_SCREEN_PATHS,
  RoleSchema,
  SCREEN_NAV_ICONS,
  SCREEN_TYPES,
  ScreenBucketSchema,
  ScreenFilterSchema,
  type ScreenNavIcon,
  ScreenNavSchema,
  ScreenSchema,
  type ScreenType,
  SETTINGS_SECTIONS,
  safeParseBlueprint,
  screenPath,
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
  DEFAULT_UNTRUSTED_BLUEPRINT_LIMITS,
  loadUntrustedBlueprint,
  type UntrustedBlueprintIssue,
  type UntrustedBlueprintLimits,
  type UntrustedBlueprintResult,
} from './untrusted.ts';
export {
  deriveInputSchemas,
  type EntityInput,
  type EntityInputSchemas,
  fieldLabel,
  inputProperty,
  parseMoneyText,
} from './validation.ts';
