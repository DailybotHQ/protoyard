import {
  type MdBlock,
  type MdDocument,
  type MdInline,
  parseMarkdown,
} from '@protoyard/ai/markdown';
import {
  codeFence,
  escapeFragment,
  escapeInline,
  escapeLineStart,
  escapeText,
  inlineCode,
  linkTarget,
} from './escape.ts';

/**
 * Serializes the safe Markdown AST from `@protoyard/ai/markdown` back to
 * Markdown. Author Markdown is never copied through as a raw string: it is
 * parsed first, so raw HTML stays escaped text and only links that passed
 * `safeHref` / `safeImageSrc` come out as links.
 */

/** `lineStart`: the first node opens a line (a paragraph), so block syntax is escaped there too. */
function inline(nodes: readonly MdInline[], lineStart = false): string {
  return nodes
    .map((node, i) => {
      const startsLine = lineStart && (i === 0 || nodes[i - 1]?.type === 'break');
      switch (node.type) {
        case 'text':
          return startsLine
            ? escapeLineStart(escapeFragment(node.text))
            : escapeFragment(node.text);
        case 'strong':
          return `**${inline(node.children)}**`;
        case 'em':
          return `*${inline(node.children)}*`;
        case 'del':
          return `~~${inline(node.children)}~~`;
        case 'code':
          return inlineCode(node.text);
        case 'link':
          return `[${inline(node.children)}](${linkTarget(node.href)})`;
        case 'image':
          return node.src
            ? `![${escapeInline(node.alt)}](${linkTarget(node.src)})`
            : escapeInline(node.alt);
        case 'attachment':
          return escapeFragment(node.label);
        case 'citation':
          return `\\[${node.index}\\]`;
        case 'break':
          return '\\\n';
        default: {
          const _exhaustive: never = node;
          void _exhaustive;
          return '';
        }
      }
    })
    .join('');
}

function indent(text: string, by: string): string {
  return text
    .split('\n')
    .map((line, i) => (i === 0 || line === '' ? line : `${by}${line}`))
    .join('\n');
}

function block(node: MdBlock, headingOffset: number): string {
  switch (node.type) {
    case 'paragraph':
      return inline(node.children, true).trim();
    case 'heading': {
      const level = Math.min(6, Math.max(1, node.level + headingOffset));
      return `${'#'.repeat(level)} ${inline(node.children)}`;
    }
    case 'code':
      return codeFence(node.text, node.lang);
    case 'chart':
      return codeFence(node.text, 'chart');
    case 'list':
      return node.items
        .map((item, i) => {
          const marker = node.ordered ? `${node.start + i}. ` : '- ';
          const task = item.checked === null ? '' : item.checked ? '[x] ' : '[ ] ';
          const body = blocks(item.children, headingOffset);
          return `${marker}${task}${indent(body, ' '.repeat(marker.length))}`;
        })
        .join('\n');
    case 'quote':
      return blocks(node.children, headingOffset)
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n');
    case 'table': {
      const width = node.header.length;
      const row = (cells: readonly MdInline[][]) =>
        `| ${Array.from({ length: width }, (_, i) => inline(cells[i] ?? []).replace(/\n/g, ' ') || ' ').join(' | ')} |`;
      return [
        row(node.header),
        `| ${node.header.map(() => '---').join(' | ')} |`,
        ...node.rows.map(row),
      ].join('\n');
    }
    case 'rule':
      return '---';
    default: {
      const _exhaustive: never = node;
      void _exhaustive;
      return '';
    }
  }
}

function blocks(nodes: readonly MdBlock[], headingOffset: number): string {
  return nodes
    .map((node) => block(node, headingOffset))
    .filter((part) => part.trim().length > 0)
    .join('\n\n');
}

/** Markdown for a parsed document; headings are shifted by `headingOffset` (clamped to 1–6). */
export function mdDocumentToMarkdown(doc: MdDocument, headingOffset = 0): string {
  const body = blocks(doc.blocks, headingOffset);
  const sources = doc.sources.map(
    (source) =>
      `\\[${source.index}\\] ${escapeInline(source.title)}${source.href ? ` ${linkTarget(source.href)}` : ''}`
  );
  return [body, ...(sources.length ? [sources.join('\n')] : [])]
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

/** Author Markdown, re-serialized from the safe AST. */
export function richText(markdown: string, headingOffset = 0): string {
  return mdDocumentToMarkdown(parseMarkdown(markdown), headingOffset);
}

/** Plain text as Markdown (re-exported for callers that mix both). */
export { escapeText };
