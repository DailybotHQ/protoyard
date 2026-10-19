/**
 * `@protoyard/views-ui/editor` — a lightweight Markdown editor on a textarea
 * (no contenteditable library): toolbar and shortcuts, Write / Preview tabs or
 * a split view, `@` and `#` completion, a character limit and draft autosave.
 * The preview renders the shared safe parser's AST as elements, never HTML.
 */
export { default as MarkdownEditor } from './MarkdownEditor.svelte';
export { default as MarkdownPreview } from './MarkdownPreview.svelte';
export type { EditorSuggestion } from './types.ts';
