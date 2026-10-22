import { formatDeckHash } from '@protoyard/decks';

/**
 * The one-line slide reference the "Copy slide reference" button copies, to
 * point a teammate or a coding agent at an exact slide and step:
 * `<title> · <slide-id> · #/<id>/<step>`.
 */
export interface SlideReferenceInput {
  /** The slide's title, else the deck's; the slide id stands in when both are empty. */
  title?: string | null;
  slideId: string;
  step: number;
}

const SEPARATOR = ' · ';

/** Control, zero-width and bidi characters never reach the clipboard (Trojan Source). */
function isInvisible(code: number): boolean {
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2060 && code <= 0x2069) ||
    code === 0xfeff
  );
}

/** One line of visible text: invisible characters dropped, whitespace collapsed. */
export function cleanReferenceText(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    out += isInvisible(code) ? ' ' : char;
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function slideReference({ title, slideId, step }: SlideReferenceInput): string {
  const hash = formatDeckHash(slideId, step);
  const label = cleanReferenceText(title ?? '') || slideId;
  return [label, slideId, hash].join(SEPARATOR);
}
