/**
 * `@protoyard/views/editor` — bounded safe editor documents and markdown text
 * commands for `@protoyard/views-ui/editor`. Documents are plain data; HTML is
 * never parsed, stored or rendered.
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
export {
  EDITOR_DOCUMENT_MAX_BLOCKS,
  EDITOR_DOCUMENT_MAX_LENGTH,
  EDITOR_DOCUMENT_MAX_LIST_ITEMS,
  type EditorBlock,
  type EditorDocument,
  EditorDocumentSchema,
  type EditorInline,
  type EditorMark,
  parseEditorDocument,
  safeHref,
  serializeEditorDocument,
} from './document.ts';
