/**
 * The one definition of "invisible" characters and of a safe deck source,
 * shared by every surface that copies deck data to a clipboard, a prompt or a
 * terminal (the debug panel, the copy-link control, `protoyard deck`). Deck
 * data, share links and pasted references are untrusted: an invisible or
 * bidirectional character can reorder or hide text (Trojan Source), and a
 * source string that reaches a suggested command can carry shell syntax.
 */

/**
 * Control, zero-width, invisible-format and bidirectional characters. Tab,
 * line feed and carriage return are not included: callers that print one line
 * collapse whitespace themselves, and JSON escapes them.
 */
export function isInvisibleCodePoint(code: number): boolean {
  return (
    (code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0xad ||
    code === 0x61c ||
    code === 0x180e ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x2028 && code <= 0x202e) ||
    (code >= 0x2060 && code <= 0x206f) ||
    code === 0xfeff ||
    (code >= 0xfff9 && code <= 0xfffb)
  );
}

/** Pretty JSON with every invisible character escaped as `\uXXXX`, so it round-trips. */
export function inertJson(value: unknown, space = 2): string {
  const text = JSON.stringify(value, null, space) ?? 'null';
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    // JSON.stringify already escapes C0 controls inside strings; the newlines it adds stay.
    out +=
      code > 0x1f && isInvisibleCodePoint(code) ? `\\u${code.toString(16).padStart(4, '0')}` : char;
  }
  return out;
}

/** A prototype or deck slug, the same shape the deck schema gives ids. */
export const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * A relative deck file path that is safe to print inside a suggested command
 * and to resolve inside a workspace: letters, digits, `_`, `-`, `.` and `/`
 * only, ending in `.json`, with no absolute start, empty, `.` or `..` segment.
 */
export function isSafeDeckPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 256) return false;
  if (!/^[A-Za-z0-9_][A-Za-z0-9_./-]*\.json$/.test(value)) return false;
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/** A share-link content namespace (`bp-…`): a token with no shell or path syntax. */
export function isSafeShareId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
}
