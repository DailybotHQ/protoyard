/**
 * A tiny, safe Markdown subset for chat bodies. It produces a plain data tree
 * that components render as real elements — never HTML strings — so message
 * text (typed by anyone) cannot inject markup.
 *
 * Supported: paragraphs (with soft line breaks), `-`/`*`/`•` and `1.` lists,
 * pipe tables, **bold**, *italic*, `code` and @mentions. Unclosed markers
 * (common mid-stream) fall back to literal text.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'em'; text: string }
  | { type: 'code'; text: string }
  | { type: 'mention'; handle: string };

export type Block =
  | { type: 'paragraph'; lines: Inline[][] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'table'; header: Inline[][]; rows: Inline[][][] };

const INLINE = /(\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*|`[^`\n]+`|(?<![\w@])@[a-z][a-z0-9_-]*)/gi;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const UNORDERED = /^\s*[-*•]\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_DIVIDER = /^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*(:?-{2,}:?\s*)?\|?\s*$/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > last) out.push({ type: 'text', text: text.slice(last, index) });
    if (token.startsWith('**')) out.push({ type: 'strong', text: token.slice(2, -2) });
    else if (token.startsWith('*')) out.push({ type: 'em', text: token.slice(1, -1) });
    else if (token.startsWith('`')) out.push({ type: 'code', text: token.slice(1, -1) });
    else out.push({ type: 'mention', handle: token.slice(1).toLowerCase() });
    last = index + token.length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

function cells(row: string): Inline[][] {
  const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => parseInline(cell.trim()));
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (!line.trim()) {
      i++;
      continue;
    }

    if (TABLE_ROW.test(line) && TABLE_DIVIDER.test(lines[i + 1] ?? '')) {
      const header = cells(line);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i] ?? '')) {
        rows.push(cells(lines[i] ?? ''));
        i++;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    const ordered = ORDERED.test(line);
    if (ordered || UNORDERED.test(line)) {
      const pattern = ordered ? ORDERED : UNORDERED;
      const items: Inline[][] = [];
      while (i < lines.length) {
        const item = pattern.exec(lines[i] ?? '');
        if (!item) break;
        items.push(parseInline(item[1] ?? ''));
        i++;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paragraph: Inline[][] = [];
    while (i < lines.length) {
      const current = lines[i] ?? '';
      if (!current.trim() || ORDERED.test(current) || UNORDERED.test(current)) break;
      if (TABLE_ROW.test(current) && TABLE_DIVIDER.test(lines[i + 1] ?? '')) break;
      paragraph.push(parseInline(current));
      i++;
    }
    blocks.push({ type: 'paragraph', lines: paragraph });
  }
  return blocks;
}

/** Plain one-line text for previews, search results and announcements. */
export function plainText(source: string, max = 120): string {
  const flat = source
    .replace(/\|?\s*:?-{2,}:?\s*\|/g, ' ')
    .replace(/[*`|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}
