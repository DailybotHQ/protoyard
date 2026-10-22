/** Backward-compatible location for the command engine and its contracts. */

export type {
  CommandAction,
  CommandEntry,
  CommandKind,
  CommandRegistry,
  CommandSearchSource,
  CreateCommandsOptions,
  RecentRecord,
  RouteLike,
} from '@protoyard/views/commands';
export {
  COMMAND_QUERY_MAX_LENGTH,
  COMMAND_RESULT_MAX,
  createCommands,
  eventShortcut,
  normalizeShortcut,
  rankCommands,
  scoreCommand,
} from '@protoyard/views/commands';
