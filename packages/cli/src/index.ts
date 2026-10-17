/**
 * Programmatic API of @protoyard/cli. The `protoyard` binary is a thin layer
 * over these functions; scripts (benchmarks, CI helpers) import them directly.
 */

export type { ControlServer, ControlServerOptions } from './control-server.ts';
export {
  DEFAULT_CONTROL_PORT,
  DEFAULT_GALLERY_PORT,
  defaultAllowedOrigins,
  startControlServer,
} from './control-server.ts';
export type { BuildManifest } from './lib/build.ts';
export {
  BUILD_MANIFEST_FILENAME,
  BUILD_MANIFEST_FORMAT,
  scanForForeignCode,
  verifyDist,
} from './lib/build.ts';
export { digestDirectory, sha256File, sha256Text } from './lib/checksum.ts';
export type { FolderKind, ManifestLocation } from './lib/discovery.ts';
export {
  listManifestLocations,
  MANIFEST_MAX_BYTES,
  readManifest,
  validateManifestData,
} from './lib/discovery.ts';
export type { Envelope, ErrorCode } from './lib/output.ts';
export { CliError, ExitCode, errorEnvelope, successEnvelope } from './lib/output.ts';
export type { WorkspacePaths } from './lib/paths.ts';
export { childPath, isInside, resolveWorkspaceRoot, workspacePaths } from './lib/paths.ts';
export type {
  IndexResult,
  Registry,
  RegistryEntry,
  RegistryIssue,
  RegistryQuery,
} from './lib/registry.ts';
export {
  buildIndex,
  compareEntries,
  filterEntries,
  findEntry,
  REGISTRY_FORMAT,
  REGISTRY_VERSION,
  readRegistry,
} from './lib/registry.ts';
export { zipDirectory } from './lib/zip.ts';
export { createProgram, runCli } from './program.ts';
export { createProvider, PROVIDER_IDS } from './publish/index.ts';
export type { PublishInput, PublishProvider, PublishResult } from './publish/types.ts';
