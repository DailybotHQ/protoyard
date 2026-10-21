/** Player source resolution: share links, same-origin files and the picker. */
export {
  EMBEDDED_BLUEPRINT_ID,
  loadBlueprintFromFile,
  loadBlueprintFromSrc,
  type ResolvedSource,
  type ResolveSourceInput,
  readEmbeddedBlueprint,
  resolveSource,
  resolveSrcUrl,
  type SourceIssue,
  type SourceKind,
  supportsDeflateRaw,
} from './resolve.ts';
export {
  bootIssues,
  type PlayerState,
  type StartedPlayer,
  type StartPlayerOptions,
  startPlayer,
} from './start.ts';
