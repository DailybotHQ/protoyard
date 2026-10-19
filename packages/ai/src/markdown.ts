/**
 * A small markdown-subset parser for simulated model output. It returns a
 * plain-data AST that UI packages render with components and text nodes, so
 * nothing in a message can become markup: raw HTML stays literal text, there is
 * no `{@html}` anywhere, and every URL passes `safeHref` / `safeImageSrc`.
 *
 * Supported: paragraphs, headings, emphasis, strong, strikethrough, inline
 * code, fenced code blocks (an unterminated fence while streaming becomes a
 * code block with `closed: false`), ordered/unordered/task lists, block
 * quotes, tables, thematic breaks, links and bare URLs, images from the
 * prototype (relative paths or `attachment:<id>`), attachment links and
 * footnote-style citations (`[^1]` with `[^1]: Title https://…`).
 *
 * With `{ charts: true }`, a ```` ```chart ```` fence becomes a `chart` block
 * holding its raw text. The parser never interprets it: a renderer validates
 * it with `parseChartSpec` from `@protoyard/ai/chart` (zod) and shows a chart,
 * a table or an error note. Without the option it stays a code block, so other
 * consumers of this parser see no new block type.
 */

export type MdInline =
  | { type: 'text'; text: string }
  | { type: 'strong' | 'em' | 'del'; children: MdInline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: MdInline[] }
  | { type: 'image'; alt: string; src: string | null; attachmentId: string | null }
  | { type: 'attachment'; id: string; label: string }
  | { type: 'citation'; id: string; index: number }
  | { type: 'break' };

export type MdAlign = 'left' | 'center' | 'right' | null;

export type MdBlock =
  | { type: 'paragraph'; children: MdInline[] }
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: MdInline[] }
  | { type: 'code'; lang: string; text: string; closed: boolean }
  /** Only with `parseMarkdown(input, { charts: true })`; `text` is unvalidated JSON. */
  | { type: 'chart'; text: string; closed: boolean }
  | { type: 'list'; ordered: boolean; start: number; items: MdListItem[] }
  | { type: 'quote'; children: MdBlock[] }
  | { type: 'table'; align: MdAlign[]; header: MdInline[][]; rows: MdInline[][][] }
  | { type: 'rule' };

export interface MdListItem {
  /** `true`/`false` for task items (`- [x]`), `null` otherwise. */
  checked: boolean | null;
  children: MdBlock[];
}

export interface MdSource {
  id: string;
  /** 1-based number shown for the citation, in definition order. */
  index: number;
  title: string;
  href: string | null;
}

export interface MarkdownOptions {
  /** Turn ```` ```chart ```` fences into `chart` blocks (default false). */
  charts?: boolean;
}

export interface MdDocument {
  blocks: MdBlock[];
  sources: MdSource[];
}

/** Inputs longer than this are truncated; nesting deeper than MAX_DEPTH stays text. */
export const MARKDOWN_MAX_LENGTH = 100_000;
const MAX_DEPTH = 8;

const SAFE_SCHEME = /^(?:https?|mailto):/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const ID = /^[\w-]{1,64}$/;

/**
 * A link target the UI may put in `href`, or `null`. Allows http(s), mailto
 * and same-document/relative URLs; rejects every other scheme (`javascript:`,
 * `data:`, `vbscript:`…) after stripping the control characters and
 * whitespace browsers ignore, and rejects protocol-relative `//host`.
 */
export function safeHref(raw: string): string | null {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point.
  const url = raw.replace(/[\u0000- \u007f-\u009f]/g, '');
  if (!url) return null;
  // Reject protocol-relative forms browsers normalize, including `/\host` and `\/host`.
  const normalizedSlashes = url.replace(/\\/g, '/');
  if (/^\/{2}/.test(normalizedSlashes) || normalizedSlashes.startsWith('\\')) return null;
  if (SAFE_SCHEME.test(url)) return url;
  return HAS_SCHEME.test(url) ? null : url;
}

/** Images come only from the prototype: relative paths, never remote or `data:` URLs. */
export function safeImageSrc(raw: string): string | null {
  const url = safeHref(raw);
  if (!url || SAFE_SCHEME.test(url) || url.startsWith('#')) return null;
  // Extra guard: `/\host` must never become a remote image.
  if (/^[/\\]{2}/.test(url.replace(/\\/g, '/'))) return null;
  return url;
}

const attachmentRef = (href: string) => {
  const match = /^attachment:([\w-]{1,64})$/.exec(href.trim());
  return match ? (match[1] as string) : null;
};

// ── inline ────────────────────────────────────────────────────────────────

const PUNCT = /[!-/:-@[-`{-~]/;
const DELIMS = [
  ['**', 'strong'],
  ['__', 'strong'],
  ['~~', 'del'],
  ['*', 'em'],
  ['_', 'em'],
] as const;

/** Link labels and targets longer than this stay text, which keeps parsing linear. */
const MAX_LINK_SPAN = 1024;

/** Index of the `close` bracket matching the `open` at `from`, or -1. */
function matching(s: string, from: number, open: string, close: string): number {
  let depth = 0;
  const limit = Math.min(s.length, from + MAX_LINK_SPAN);
  for (let i = from; i < limit; i++) {
    if (s[i] === '\\') i++;
    else if (s[i] === open) depth++;
    else if (s[i] === close && --depth === 0) return i;
  }
  return -1;
}

function parseInline(s: string, citations: Map<string, number>, depth = 0): MdInline[] {
  const out: MdInline[] = [];
  let text = '';
  const push = (node: MdInline) => {
    if (text) out.push({ type: 'text', text });
    text = '';
    out.push(node);
  };
  const inner = (part: string) =>
    depth < MAX_DEPTH
      ? parseInline(part, citations, depth + 1)
      : [{ type: 'text' as const, text: part }];

  // A failed search for a closing delimiter fails from every later position
  // too, so remember it: unmatched `*` or backticks never rescan the input.
  const unmatched = new Set<string>();
  const at = (re: RegExp, i: number) => {
    re.lastIndex = i;
    return re.exec(s);
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i] as string;

    if (c === '\\' && i + 1 < s.length) {
      const next = s[i + 1] as string;
      if (next === '\n') push({ type: 'break' });
      else if (PUNCT.test(next)) text += next;
      else text += c + next;
      i += 2;
      continue;
    }
    if (c === '\n') {
      if (text.endsWith('  ')) {
        text = text.trimEnd();
        push({ type: 'break' });
      } else text = `${text.trimEnd()} `;
      i++;
      continue;
    }
    if (c === '`') {
      const ticks = at(/`+/y, i)?.[0] as string;
      const end = unmatched.has(ticks) ? -1 : s.indexOf(ticks, i + ticks.length);
      if (end < 0) unmatched.add(ticks);
      if (end > 0 && s[end + ticks.length] !== '`') {
        push({ type: 'code', text: s.slice(i + ticks.length, end).trim() });
        i = end + ticks.length;
        continue;
      }
      text += ticks;
      i += ticks.length;
      continue;
    }
    if (c === '[' && s[i + 1] === '^') {
      const match = at(/\[\^([\w-]{1,64})\]/y, i);
      const index = match ? citations.get(match[1] as string) : undefined;
      if (match && index !== undefined) {
        push({ type: 'citation', id: match[1] as string, index });
        i += match[0].length;
        continue;
      }
    }
    if ((c === '[' || (c === '!' && s[i + 1] === '[')) && depth < MAX_DEPTH) {
      const image = c === '!';
      const open = i + (image ? 1 : 0);
      const close = matching(s, open, '[', ']');
      const end = close > 0 && s[close + 1] === '(' ? matching(s, close + 1, '(', ')') : -1;
      if (end > 0) {
        const label = s.slice(open + 1, close);
        const target = s
          .slice(close + 2, end)
          .trim()
          .replace(/\s+"[^"]*"$/, '');
        const attachment = attachmentRef(target);
        i = end + 1;
        if (image) {
          const src = attachment ? null : safeImageSrc(target);
          if (attachment || src) push({ type: 'image', alt: label, src, attachmentId: attachment });
          else text += label;
        } else if (attachment) push({ type: 'attachment', id: attachment, label });
        else {
          const href = safeHref(target);
          const children = inner(label);
          if (href) push({ type: 'link', href, children });
          else {
            if (text) out.push({ type: 'text', text });
            text = '';
            out.push(...children);
          }
        }
        continue;
      }
    }
    const bare = c === 'h' && !/[\w/]$/.test(text) ? at(/https?:\/\/[^\s<>]+/y, i) : null;
    if (bare) {
      const url = bare[0].replace(/[.,;:!?)\]'"]+$/, '');
      push({ type: 'link', href: url, children: [{ type: 'text', text: url }] });
      i += url.length;
      continue;
    }
    const delim = DELIMS.find(([d]) => s.startsWith(d, i));
    if (delim && depth < MAX_DEPTH) {
      const [d, type] = delim;
      const prev = s[i - 1] ?? ' ';
      const intraword = d[0] === '_' && /\w/.test(prev);
      let end = -1;
      if (!intraword && !unmatched.has(d) && !/\s/.test(s[i + d.length] ?? ' ')) {
        for (let j = i + d.length + 1; j < s.length; j++) {
          if (s[j] === '\\') j++;
          else if (s.startsWith(d, j) && !/\s/.test(s[j - 1] as string)) {
            if (d.length === 1 && s[j + 1] === d) {
              j++;
              continue;
            }
            end = j;
            break;
          }
        }
        if (end < 0) unmatched.add(d);
      }
      if (end > 0) {
        push({ type, children: inner(s.slice(i + d.length, end)) });
        i = end + d.length;
        continue;
      }
      text += d;
      i += d.length;
      continue;
    }
    text += c;
    i++;
  }
  if (text) out.push({ type: 'text', text });
  return out;
}

// ── blocks ────────────────────────────────────────────────────────────────

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)/;
const HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/;
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}> ?/;
const ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])( +|$)(.*)$/;
const TABLE_DELIM = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

const isBlank = (line: string) => line.trim() === '';

function cells(line: string): string[] {
  const parts = line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/);
  return parts.map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function startsBlock(line: string, next: string | undefined): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    ITEM.test(line) ||
    (line.includes('|') && next !== undefined && TABLE_DELIM.test(next))
  );
}

function parseBlocks(
  lines: string[],
  citations: Map<string, number>,
  depth: number,
  charts = false
): MdBlock[] {
  const blocks: MdBlock[] = [];
  const inline = (s: string) => parseInline(s, citations);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    const next = lines[i + 1];
    if (isBlank(line)) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1] as string;
      const body: string[] = [];
      let closed = false;
      for (i++; i < lines.length; i++) {
        const l = lines[i] as string;
        if (l.trim().startsWith(marker) && l.trim().replace(/[`~]/g, '') === '') {
          closed = true;
          i++;
          break;
        }
        body.push(l);
      }
      const lang = (fence[2] ?? '').toLowerCase();
      blocks.push(
        charts && lang === 'chart'
          ? { type: 'chart', text: body.join('\n'), closed }
          : { type: 'code', lang, text: body.join('\n'), closed }
      );
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = (heading[1] as string).length as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({ type: 'heading', level, children: inline(heading[2] ?? '') });
      i++;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: 'rule' });
      i++;
      continue;
    }

    if (depth < MAX_DEPTH && QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i] as string)) {
        body.push((lines[i] as string).replace(QUOTE, ''));
        i++;
      }
      blocks.push({ type: 'quote', children: parseBlocks(body, citations, depth + 1, charts) });
      continue;
    }

    const item = depth < MAX_DEPTH ? ITEM.exec(line) : null;
    if (item) {
      const ordered = /\d/.test(item[2] as string);
      const items: MdListItem[] = [];
      let match: RegExpExecArray | null = item;
      while (match && /\d/.test(match[2] as string) === ordered) {
        const indent = (match[1] as string).length + (match[2] as string).length + 1;
        const body = [match[4] as string];
        for (i++; i < lines.length; i++) {
          const l = lines[i] as string;
          const lead = /^ */.exec(l)?.[0].length ?? 0;
          if (!isBlank(l) && lead < indent) break;
          if (isBlank(l) && !/^ +\S/.test(lines[i + 1] ?? '')) break;
          body.push(l.slice(Math.min(lead, indent)));
        }
        const task = /^\[([ xX])\]\s+/.exec(body[0] as string);
        if (task) body[0] = (body[0] as string).slice(task[0].length);
        items.push({
          checked: task ? task[1] !== ' ' : null,
          children: parseBlocks(body, citations, depth + 1, charts),
        });
        while (i < lines.length && isBlank(lines[i] as string)) i++;
        match = ITEM.exec(lines[i] ?? '');
      }
      const start = ordered ? Number.parseInt(item[2] as string, 10) : 1;
      blocks.push({ type: 'list', ordered, start, items });
      continue;
    }

    if (line.includes('|') && next !== undefined && TABLE_DELIM.test(next)) {
      const header = cells(line);
      const align = cells(next).map((cell): MdAlign => {
        const left = cell.startsWith(':');
        const right = cell.endsWith(':');
        return left && right ? 'center' : right ? 'right' : left ? 'left' : null;
      });
      const rows: MdInline[][][] = [];
      for (i += 2; i < lines.length && (lines[i] as string).includes('|'); i++) {
        const row = cells(lines[i] as string);
        rows.push(header.map((_, c) => inline(row[c] ?? '')));
      }
      blocks.push({
        type: 'table',
        align: header.map((_, c) => align[c] ?? null),
        header: header.map((cell) => inline(cell)),
        rows,
      });
      continue;
    }

    const body = [line.trimStart()];
    for (i++; i < lines.length; i++) {
      const l = lines[i] as string;
      if (isBlank(l) || startsBlock(l, lines[i + 1])) break;
      body.push(l.trimStart());
    }
    blocks.push({ type: 'paragraph', children: inline(body.join('\n').trimEnd()) });
  }
  return blocks;
}

const SOURCE = /^ {0,3}\[\^([\w-]{1,64})\]:\s*(.*)$/;

function parseSource(id: string, index: number, raw: string): MdSource {
  const link = /^\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(raw);
  if (link) return { id, index, title: link[1] as string, href: safeHref(link[2] as string) };
  const url = /\s*<?(\S+?)>?\s*$/.exec(raw);
  const href = url && /^https?:\/\//i.test(url[1] as string) ? safeHref(url[1] as string) : null;
  const title = (href && url ? raw.slice(0, url.index) : raw).replace(/[\s—–:-]+$/, '').trim();
  return { id, index, title: title || href || id, href };
}

/** Parses simulated model output into a render-safe document. Never throws. */
export function parseMarkdown(input: string, options: MarkdownOptions = {}): MdDocument {
  const lines = String(input ?? '')
    .slice(0, MARKDOWN_MAX_LENGTH)
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .split('\n');
  const sources: MdSource[] = [];
  const citations = new Map<string, number>();
  const body: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (FENCE.test(line)) inFence = !inFence;
    const source = inFence ? null : SOURCE.exec(line);
    const id = source?.[1];
    if (source && id && ID.test(id) && !citations.has(id)) {
      citations.set(id, sources.length + 1);
      sources.push(parseSource(id, sources.length + 1, source[2] as string));
    } else body.push(line);
  }
  return { blocks: parseBlocks(body, citations, 0, options.charts === true), sources };
}

/** Plain text of inline nodes (copy buttons, previews, accessible labels). */
export function inlineText(nodes: readonly MdInline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
        case 'code':
          return node.text;
        case 'image':
          return node.alt;
        case 'attachment':
          return node.label;
        case 'citation':
          return `[${node.index}]`;
        case 'break':
          return '\n';
        default:
          return inlineText(node.children);
      }
    })
    .join('');
}
