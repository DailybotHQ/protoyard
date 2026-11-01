// A compiled design system as a prototype theme (written by `protoyard ds use`):
// re-exported because prototypes depend on the runtime, not on @protoyard/themes,
// and src/prototype.ts must load in Node (validate, spec), so not from the renderer.
export { defineDesignSystemTheme, type ShippedDesignSystem } from '@protoyard/themes';
export {
  createPrototypeRuntime,
  MAX_INSPECTOR_PAGE,
  type ProtoyardRuntime,
} from './create-runtime.ts';
export {
  IDENTITY_TABLES,
  type IdentityController,
  type IdentityOps,
  IdentityValidationError,
  type IdentityWriteOptions,
  type MembershipInput,
  type OrganizationInput,
  type PersonaInput,
} from './identity.ts';
export type { MatchMedia, RuntimeOptions } from './options.ts';
export { InvalidOverrideError } from './overrides.ts';
export {
  checkWorld,
  DEFAULT_WRITE_CHUNK,
  isStaleWorld,
  type LoadTimings,
  type PendingLink,
  type RuntimeLoadOptions,
  type ScenarioControllerExtras,
  type StaleWorld,
  UnknownScenarioError,
  type WorldVersions,
} from './scenarios.ts';
export {
  SNAPSHOT_MAX_ROWS,
  type SnapshotControllerExtras,
  SnapshotImportError,
  snapshotFilename,
  stripBinaryFields,
} from './snapshots.ts';
export {
  CUSTOM_THEMES_KEY,
  MAX_CUSTOM_THEMES,
  MAX_THEME_JSON_BYTES,
  THEME_FILE_FORMAT,
  type ThemeControllerExtras,
} from './theme.ts';
