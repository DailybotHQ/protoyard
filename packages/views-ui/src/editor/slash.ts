/**
 * Slash-menu commands for the Markdown editor. Each entry replaces a typed
 * `/query` with a block transform from `@protoyard/views/editor`.
 */

import { insertCodeBlock, setHeading, type TextState, toggleLines } from '@protoyard/views/editor';

export type SlashCommandId =
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bullet'
  | 'numbered'
  | 'task'
  | 'quote'
  | 'code';

export interface SlashCommand {
  id: SlashCommandId;
  /** Shown in the menu. */
  label: string;
  /** Compact glyph in the menu. */
  glyph: string;
  /** Matched against the typed query. */
  keywords: readonly string[];
  apply: (state: TextState) => TextState;
}

export const DEFAULT_SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    id: 'heading1',
    label: 'Heading 1',
    glyph: 'H1',
    keywords: ['heading', 'h1', 'title'],
    apply: (state) => setHeading(state, 1),
  },
  {
    id: 'heading2',
    label: 'Heading 2',
    glyph: 'H2',
    keywords: ['heading', 'h2', 'subtitle'],
    apply: (state) => setHeading(state, 2),
  },
  {
    id: 'heading3',
    label: 'Heading 3',
    glyph: 'H3',
    keywords: ['heading', 'h3'],
    apply: (state) => setHeading(state, 3),
  },
  {
    id: 'bullet',
    label: 'Bulleted list',
    glyph: '•',
    keywords: ['bullet', 'list', 'ul'],
    apply: (state) => toggleLines(state, 'bullet'),
  },
  {
    id: 'numbered',
    label: 'Numbered list',
    glyph: '1.',
    keywords: ['numbered', 'ordered', 'ol'],
    apply: (state) => toggleLines(state, 'numbered'),
  },
  {
    id: 'task',
    label: 'Task list',
    glyph: '☑',
    keywords: ['task', 'todo', 'checkbox'],
    apply: (state) => toggleLines(state, 'task'),
  },
  {
    id: 'quote',
    label: 'Quote',
    glyph: '❝',
    keywords: ['quote', 'blockquote'],
    apply: (state) => toggleLines(state, 'quote'),
  },
  {
    id: 'code',
    label: 'Code block',
    glyph: '</>',
    keywords: ['code', 'fence', 'pre'],
    apply: (state) => insertCodeBlock(state),
  },
];

export interface SlashMatch {
  /** Index of the `/` character. */
  start: number;
  query: string;
}

/**
 * A `/` slash menu at the caret: the slash must start the line or follow
 * whitespace, and the query is letters up to the caret.
 */
export function slashAt(state: TextState): SlashMatch | null {
  if (state.start !== state.end) return null;
  const before = state.text.slice(Math.max(0, state.start - 64), state.start);
  const match = /(^|[\s])\/([a-z0-9]*)$/i.exec(before);
  if (!match) return null;
  const query = match[2] ?? '';
  return { start: state.start - query.length - 1, query };
}

/** Drop the typed `/query` so a block command can rewrite the line. */
export function clearSlashQuery(state: TextState, match: SlashMatch): TextState {
  const text = state.text.slice(0, match.start) + state.text.slice(state.end);
  return { text, start: match.start, end: match.start };
}

export function filterSlashCommands(
  query: string,
  commands: readonly SlashCommand[] = DEFAULT_SLASH_COMMANDS
): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...commands];
  return commands.filter(
    (command) =>
      command.id.includes(q) ||
      command.label.toLowerCase().includes(q) ||
      command.keywords.some((keyword) => keyword.startsWith(q) || keyword.includes(q))
  );
}
