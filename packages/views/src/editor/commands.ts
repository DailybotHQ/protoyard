/**
 * Markdown editing as pure text transforms: text plus a selection in, new
 * text plus a selection out. The textarea editor applies them; they never
 * touch the DOM, so they run in tests and on any input.
 */

export interface TextState {
  text: string;
  /** Selection start and end (equal for a caret). */
  start: number;
  end: number;
}

export type InlineMark = 'bold' | 'italic' | 'strike' | 'code';
export type LineFormat = 'bullet' | 'numbered' | 'task' | 'quote';

const MARKERS: Record<InlineMark, string> = { bold: '**', italic: '_', strike: '~~', code: '`' };
const PLACEHOLDERS: Record<InlineMark, string> = {
  bold: 'bold text',
  italic: 'italic text',
  strike: 'struck text',
  code: 'code',
};

/** Replaces the selection with `insert`, selecting `[selectFrom, selectTo)` inside it (default: caret after). */
export function replaceSelection(
  state: TextState,
  insert: string,
  selectFrom = insert.length,
  selectTo = selectFrom
): TextState {
  const text = state.text.slice(0, state.start) + insert + state.text.slice(state.end);
  return { text, start: state.start + selectFrom, end: state.start + selectTo };
}

/**
 * Wraps the selection in a mark (`**bold**`), or unwraps it when it is
 * already wrapped (inside or just outside the selection). An empty selection
 * inserts a selected placeholder.
 */
export function toggleInline(state: TextState, mark: InlineMark): TextState {
  const marker = MARKERS[mark];
  const n = marker.length;
  const selected = state.text.slice(state.start, state.end);
  if (selected.length >= 2 * n && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(n, -n);
    return replaceSelection(state, inner, 0, inner.length);
  }
  if (
    state.text.slice(state.start - n, state.start) === marker &&
    state.text.slice(state.end, state.end + n) === marker
  ) {
    const text = state.text.slice(0, state.start - n) + selected + state.text.slice(state.end + n);
    return { text, start: state.start - n, end: state.end - n };
  }
  const inner = selected || PLACEHOLDERS[mark];
  return replaceSelection(state, `${marker}${inner}${marker}`, n, n + inner.length);
}

/** Turns the selection into `[label](https://)` with the URL selected, ready to type over. */
export function insertLink(state: TextState, url = 'https://'): TextState {
  const label = state.text.slice(state.start, state.end) || 'link text';
  const insert = `[${label}](${url})`;
  return replaceSelection(state, insert, label.length + 3, label.length + 3 + url.length);
}

/** Start of the line containing `index`. */
function lineStart(text: string, index: number): number {
  return text.lastIndexOf('\n', index - 1) + 1;
}

/** End of the line containing `index` (before its newline). */
function lineEnd(text: string, index: number): number {
  const at = text.indexOf('\n', index);
  return at === -1 ? text.length : at;
}

/** Applies `edit` to every line the selection touches; keeps the selection on those lines. */
function editLines(state: TextState, edit: (lines: string[]) => string[]): TextState {
  const from = lineStart(state.text, state.start);
  const to = lineEnd(
    state.text,
    Math.max(
      state.start,
      state.end - (state.end > state.start && state.text[state.end - 1] === '\n' ? 1 : 0)
    )
  );
  const lines = edit(state.text.slice(from, to).split('\n'));
  const block = lines.join('\n');
  const text = state.text.slice(0, from) + block + state.text.slice(to);
  return state.start === state.end
    ? { text, start: from + (lines[0]?.length ?? 0), end: from + (lines[0]?.length ?? 0) }
    : { text, start: from, end: from + block.length };
}

const LINE_PATTERN: Record<LineFormat, RegExp> = {
  bullet: /^(\s*)[-*+] (?!\[[ xX]\] )/,
  numbered: /^(\s*)\d+[.)] /,
  task: /^(\s*)[-*+] \[[ xX]\] /,
  quote: /^(\s*)> ?/,
};
const ANY_LIST = /^(\s*)(?:[-*+] (?:\[[ xX]\] )?|\d+[.)] )/;

/** Toggles a list or quote prefix on every selected line (numbered lists count from 1). */
export function toggleLines(state: TextState, format: LineFormat): TextState {
  return editLines(state, (lines) => {
    const pattern = LINE_PATTERN[format];
    const content = lines.filter((line) => line.trim() !== '');
    if (content.length > 0 && content.every((line) => pattern.test(line))) {
      return lines.map((line) => line.replace(pattern, '$1'));
    }
    let n = 0;
    return lines.map((line) => {
      if (line.trim() === '') return line;
      const bare = format === 'quote' ? line : line.replace(ANY_LIST, '$1');
      const indent = /^\s*/.exec(bare)?.[0] ?? '';
      const rest = bare.slice(indent.length);
      n++;
      const prefix =
        format === 'bullet'
          ? '- '
          : format === 'task'
            ? '- [ ] '
            : format === 'quote'
              ? '> '
              : `${n}. `;
      return `${indent}${prefix}${rest}`;
    });
  });
}

/** Sets the heading level (1–6) of the selected lines; the same level again removes it. */
export function setHeading(state: TextState, level: 1 | 2 | 3 | 4 | 5 | 6): TextState {
  return editLines(state, (lines) => {
    const marker = `${'#'.repeat(level)} `;
    const all = lines.every((line) => line.startsWith(marker));
    return lines.map((line) => {
      const bare = line.replace(/^#{1,6} /, '');
      return all ? bare : `${marker}${bare}`;
    });
  });
}

/** Wraps the selected lines in a fenced code block (or inserts an empty one). */
export function insertCodeBlock(state: TextState, lang = ''): TextState {
  const selected = state.text.slice(state.start, state.end);
  const before = state.start > 0 && state.text[state.start - 1] !== '\n' ? '\n' : '';
  const body = selected || 'code';
  const insert = `${before}\`\`\`${lang}\n${body}\n\`\`\`\n`;
  const at = before.length + 4 + lang.length;
  return replaceSelection(state, insert, at, at + body.length);
}

/**
 * Enter inside a list: continues it with the next marker (numbers count up,
 * tasks start unchecked); Enter on an empty item ends the list. Returns null
 * when the caret is not in a list item, so the default newline applies.
 */
export function continueList(state: TextState): TextState | null {
  if (state.start !== state.end) return null;
  const from = lineStart(state.text, state.start);
  const line = state.text.slice(from, lineEnd(state.text, state.start));
  const match = /^(\s*)([-*+] \[[ xX]\] |[-*+] |(\d+)([.)]) |> )/.exec(line);
  if (!match) return null;
  const [prefix, indent = '', marker = '', number, dot] = match;
  if (line.trim() === prefix.trim()) {
    // An empty item: end the list by removing its marker.
    const text = state.text.slice(0, from) + state.text.slice(from + prefix.length);
    return { text, start: from, end: from };
  }
  const next =
    number !== undefined ? `${Number(number) + 1}${dot} ` : marker.replace(/\[[xX]\]/, '[ ]');
  return replaceSelection(state, `\n${indent}${next}`);
}

export interface TriggerMatch {
  trigger: string;
  /** Typed after the trigger. */
  query: string;
  /** Index of the trigger character. */
  start: number;
}

/**
 * The `@name` / `#ref` being typed at the caret: the trigger must start the
 * text or follow whitespace or an opening bracket, and the query is letters,
 * digits, `.`, `_` or `-` up to the caret.
 */
export function triggerAt(
  state: TextState,
  triggers: readonly string[] = ['@', '#']
): TriggerMatch | null {
  if (state.start !== state.end) return null;
  const before = state.text.slice(Math.max(0, state.start - 64), state.start);
  const match = /(^|[\s([{])([^\s\w])([\w.-]*)$/u.exec(before);
  if (!match) return null;
  const trigger = match[2] as string;
  if (!triggers.includes(trigger)) return null;
  const query = match[3] as string;
  return { trigger, query, start: state.start - query.length - 1 };
}

/** Replaces the typed `@que` with `@value ` and puts the caret after it. */
export function applyCompletion(state: TextState, match: TriggerMatch, value: string): TextState {
  const insert = `${match.trigger}${value} `;
  const text = state.text.slice(0, match.start) + insert + state.text.slice(state.end);
  const caret = match.start + insert.length;
  return { text, start: caret, end: caret };
}
