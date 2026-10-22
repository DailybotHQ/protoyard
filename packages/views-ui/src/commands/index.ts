/**
 * `@protoyard/views-ui/commands` — the app command palette. `createCommands`
 * builds the list from route metadata, registered actions and recent records,
 * filtered by capability and re-filtered on persona switches. Async providers,
 * nested steps and create fallbacks come from the pure views engine;
 * `AppCommandPalette` adds ⌘K / Ctrl+K and action shortcuts, and loads its
 * dialog lazily on first open. DevTools keep Ctrl/⌘ + `.`.
 */

export { isMacPlatform, shortcutKeys, shortcutLabel } from '../lib/platform.ts';
export { default as AppCommandPalette } from './AppCommandPalette.svelte';
export {
  COMMAND_QUERY_MAX_LENGTH,
  COMMAND_RESULT_MAX,
  type CommandAction,
  type CommandEntry,
  type CommandKind,
  type CommandRegistry,
  type CommandSearchSource,
  type CreateCommandsOptions,
  createCommands,
  eventShortcut,
  normalizeShortcut,
  type RecentRecord,
  type RouteLike,
  rankCommands,
  scoreCommand,
} from './registry.ts';
