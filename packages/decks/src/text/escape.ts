/**
 * Markdown output helpers. Every string from deck data goes through one of
 * these, so nothing an author (or an attacker) types can become Markdown
 * structure, raw HTML, a link, or a Trojan Source reordering in the twin.
 */

// C0 controls except tab and line feed, DEL, C1 controls; zero-width
// characters and marks; bidi embeddings, overrides and isolates; word joiners
// and the BOM. Built from code points so no literal invisible character ever
// sits in this source file (Trojan Source).
const INVISIBLE_RANGES: readonly (readonly [number, number])[] = [
  [0x00, 0x08],
  [0x0b, 0x1f],
  [0x7f, 0x9f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2069],
  [0xfeff, 0xfeff],
];

function isInvisible(code: number): boolean {
  return INVISIBLE_RANGES.some(([from, to]) => code >= from && code <= to);
}

/** Removes control, bidi and zero-width characters; normalizes line endings. */
export function stripInvisible(text: string): string {
  let out = '';
  for (const char of text.replace(/\r\n?/g, '\n')) {
    if (!isInvisible(char.codePointAt(0) ?? 0)) out += char;
  }
  return out;
}

/** Characters that are Markdown or HTML syntax anywhere in a line. */
const ANYWHERE = /[\\`*_{}[\]<>|~&]/g;
/** `https://…` and `www.…` would become links when the twin is read back. */
const AUTOLINK_SCHEME = /\b([a-z][a-z0-9+.-]{0,31}):(?=\/\/)/gi;
const AUTOLINK_WWW = /\b(www)\./gi;

/**
 * Escapes inline syntax in a fragment of plain text, keeping its spacing (so
 * it can sit between other inline nodes). Bare URLs stay text, not links.
 */
export function escapeFragment(text: string): string {
  return stripInvisible(text)
    .replace(/\s+/g, ' ')
    .replace(ANYWHERE, '\\$&')
    .replace(AUTOLINK_SCHEME, '$1\\:')
    .replace(AUTOLINK_WWW, '$1\\.');
}

/**
 * Escapes block syntax that only matters at the start of a line: ATX headings,
 * list markers, setext underlines and ordered-list numbers.
 */
export function escapeLineStart(line: string): string {
  return line
    .replace(/^(\s*)([#+\-=])(?=\s|$|[#=])/, '$1\\$2')
    .replace(/^(\s*\d{1,9})([.)])(?=\s|$)/, '$1\\$2');
}

/** Escapes one line of plain text: inline syntax everywhere, block syntax at its start. */
function escapeLine(line: string): string {
  return escapeLineStart(escapeFragment(line).trim());
}

/** Plain text as inert Markdown, keeping line breaks as paragraphs. */
export function escapeText(text: string): string {
  return stripInvisible(text)
    .split('\n')
    .map((line) => escapeLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Plain text on one line (titles, table cells, list items). */
export function escapeInline(text: string): string {
  return escapeLine(text);
}

/**
 * A link or image destination with spaces, parentheses, angle brackets and
 * backslashes percent-encoded, so it can never end the link early (readable by
 * CommonMark and by `@protoyard/ai/markdown`).
 */
export function linkTarget(url: string): string {
  return stripInvisible(url).replace(
    /[\s()<>\\]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`
  );
}

/** A code fence longer than any backtick run inside `text` (at least three). */
export function fenceFor(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  return '`'.repeat(Math.max(3, longest + 1));
}

/** A fenced code block; the language is reduced to a safe identifier. */
export function codeFence(code: string, lang = ''): string {
  const body = stripInvisible(code).replace(/\n+$/, '');
  const fence = fenceFor(body);
  const info = lang.replace(/[^\w+-]/g, '').slice(0, 24);
  return `${fence}${info}\n${body}\n${fence}`;
}

/** Inline code with a delimiter longer than any backtick run inside. */
export function inlineCode(text: string): string {
  const body = stripInvisible(text).replace(/\s+/g, ' ');
  const longest = Math.max(0, ...(body.match(/`+/g) ?? []).map((run) => run.length));
  const tick = '`'.repeat(longest + 1);
  const pad = body.startsWith('`') || body.endsWith('`') ? ' ' : '';
  return `${tick}${pad}${body}${pad}${tick}`;
}

/** A Markdown table from plain cells (header first). Empty when there are no columns. */
export function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  if (header.length === 0) return '';
  const width = header.length;
  const cell = (value: string | undefined) => escapeInline(value ?? '') || ' ';
  const line = (cells: readonly string[]) =>
    `| ${Array.from({ length: width }, (_, i) => cell(cells[i])).join(' | ')} |`;
  return [line(header), `| ${header.map(() => '---').join(' | ')} |`, ...rows.map(line)].join('\n');
}
