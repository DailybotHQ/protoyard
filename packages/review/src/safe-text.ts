/**
 * Characters that can break a line or disguise text: C0/C1 controls, the
 * line and paragraph separators, and bidi marks, embeddings, overrides and
 * isolates (U+200E/F, U+202A-202E, U+2066-2069). The review schema refuses
 * them in single-line anchor fields; capture and the Markdown report strip them.
 */
export function isUnsafeLineChar(code: number): boolean {
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0x200e ||
    code === 0x200f ||
    code === 0x2028 ||
    code === 0x2029 ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

/** Collapses every whitespace run to one space, then drops unsafe characters. */
export function toSafeLine(value: string): string {
  let out = '';
  for (const ch of value.replace(/\s+/g, ' ')) {
    if (!isUnsafeLineChar(ch.charCodeAt(0))) out += ch;
  }
  return out;
}

/** True when `value` holds a character `toSafeLine` would drop or a newline. */
export function hasUnsafeLineChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) if (isUnsafeLineChar(value.charCodeAt(i))) return true;
  return false;
}
