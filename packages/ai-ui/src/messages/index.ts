/**
 * `@protoyard/ai-ui/messages` — renders `protoyard.message@1` chat messages
 * from `@protoyard/ai/messages`: text (plain or safe markdown), buttons with
 * confirmations, selects, forms, tables, link previews, attachments and the
 * fallback for unknown blocks. A lazy subpath, never in the ai-ui root.
 * Callbacks only: the prototype's services decide what an action does.
 */
export { default as ChatMessageBlocks } from './ChatMessageBlocks.svelte';
export { formatBytes, formatCell, hostOf } from './format.ts';
export type { MessageActionEvent, MessageActionHandler, MessageFormValue } from './types.ts';
