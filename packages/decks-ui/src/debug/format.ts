/**
 * Text the debug panel copies or downloads. Deck data is untrusted: JSON is
 * written with every invisible, control and bidirectional character escaped
 * as `\uXXXX` (JSON-equivalent, so the data round-trips), so pasted slide JSON
 * can never reorder or hide text in an editor or a prompt (Trojan Source).
 */

/** C0/C1 controls, zero-width, line/paragraph separators, bidi controls, BOM. */
function isInvisible(code: number): boolean {
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x200b && code <= 0x200f) ||
    code === 0x2028 ||
    code === 0x2029 ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2060 && code <= 0x2069) ||
    code === 0xfeff
  );
}

/** Pretty JSON with every invisible character escaped. */
export function inertJson(value: unknown): string {
  const text = JSON.stringify(value, null, 2) ?? 'null';
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    // JSON.stringify already escapes C0 controls (and keeps the newlines it adds).
    out += code > 0x1f && isInvisible(code) ? `\\u${code.toString(16).padStart(4, '0')}` : char;
  }
  return out;
}

/** A safe download name: `<slug>.deck.json`. */
export function deckFileName(deckId: string | null | undefined): string {
  const slug = (deckId ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return `${slug || 'deck'}.deck.json`;
}

/** Saves `text` as a file in the browser (an object URL, no network). False where that is impossible. */
export function downloadText(text: string, fileName: string, doc: Document = document): boolean {
  const win = doc.defaultView;
  if (!win || typeof win.URL?.createObjectURL !== 'function') return false;
  try {
    const url = win.URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = doc.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    link.style.display = 'none';
    doc.body.append(link);
    link.click();
    link.remove();
    win.setTimeout(() => win.URL.revokeObjectURL(url), 0);
    return true;
  } catch {
    return false;
  }
}
