/**
 * `@protoyard/views-ui/editor` — dependency-free Markdown rich-text editor on a
 * textarea (no contenteditable library): toolbar and shortcuts, Write / Preview
 * tabs or a split view, `@` / `#` completion, `/` slash commands, a character
 * limit and draft autosave. The preview and `RichTextView` render the safe
 * model as elements, never HTML.
 */
export { caretCoordinates } from './caret.ts';
export { default as LinkMenu } from './LinkMenu.svelte';
export { default as MarkdownEditor } from './MarkdownEditor.svelte';
export { default as MarkdownPreview } from './MarkdownPreview.svelte';
export { default as RichTextView } from './RichTextView.svelte';
export {
  clearSlashQuery,
  DEFAULT_SLASH_COMMANDS,
  filterSlashCommands,
  type SlashCommand,
  type SlashCommandId,
  type SlashMatch,
  slashAt,
} from './slash.ts';
export type { EditorSuggestion } from './types.ts';
