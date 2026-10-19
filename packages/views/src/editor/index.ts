/**
 * `@protoyard/views/editor` — markdown text commands for the textarea editor
 * in `@protoyard/views-ui/editor`: bold/italic/code/strike, links, headings,
 * lists and quotes, code blocks, list continuation and `@`/`#` completion.
 * Pure functions over `{ text, start, end }`.
 */
export {
  applyCompletion,
  continueList,
  type InlineMark,
  insertCodeBlock,
  insertLink,
  type LineFormat,
  replaceSelection,
  setHeading,
  type TextState,
  type TriggerMatch,
  toggleInline,
  toggleLines,
  triggerAt,
} from './commands.ts';
