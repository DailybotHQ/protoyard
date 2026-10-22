/**
 * Text the debug panel copies or downloads. Deck data is untrusted: JSON is
 * written with every invisible, control and bidirectional character escaped
 * as `\uXXXX` (JSON-equivalent, so the data round-trips), so pasted slide JSON
 * can never reorder or hide text in an editor or a prompt (Trojan Source).
 */

/** Pretty JSON with every invisible character escaped (the shared definition in `@protoyard/decks/text`). */
export { inertJson } from '@protoyard/decks/text';

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
