/**
 * Short inline Markdown (a quiz prompt, an explanation) as text parts: bold,
 * italic and code keep their emphasis, a link keeps only its text. The parts
 * render as Svelte text nodes inside `<strong>`, `<em>` or `<code>`, never as
 * HTML. A family that already loads the full Markdown renderer uses that
 * instead; this keeps small families from paying for it.
 */
export interface InlinePart {
  text: string;
  mark?: 'strong' | 'em' | 'code';
}

const INLINE = /\*\*(.+?)\*\*|\*([^*\s](?:[^*]*[^*\s])?)\*|`([^`]+)`|\[([^\]]+)\]\([^)\s]*\)/g;

export function inlineParts(source: string): InlinePart[] {
  const text = source.replace(/\s*\n\s*/g, ' ');
  const parts: InlinePart[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    const [, strong, em, code, link] = match;
    if (strong !== undefined) parts.push({ text: strong, mark: 'strong' });
    else if (em !== undefined) parts.push({ text: em, mark: 'em' });
    else if (code !== undefined) parts.push({ text: code, mark: 'code' });
    else parts.push({ text: link ?? '' });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
