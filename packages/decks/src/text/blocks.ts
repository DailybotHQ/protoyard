import { safeHref, safeImageSrc } from '@protoyard/ai/markdown';
import { type Block, blockText } from '@protoyard/blocks';
import { chartTable } from './chart.ts';
import { codeFence, escapeInline, escapeText, linkTarget, table } from './escape.ts';
import { richText } from './rich.ts';

/**
 * Markdown for free-slide blocks. Plain fields are escaped and Markdown
 * fields go through the safe AST (`richText`), so the twin never carries raw
 * author HTML. Headings start at `level` (the slide heading's child level).
 */

function heading(level: number, text: string): string {
  return `${'#'.repeat(Math.min(6, Math.max(1, level)))} ${escapeInline(text)}`;
}

const join = (parts: readonly string[], separator = '\n\n') =>
  parts.filter((part) => part.trim().length > 0).join(separator);

/** Indents continuation lines of a list item body under its marker. */
const under = (text: string, by: string) => text.split('\n').join(`\n${by}`);

function link(label: string, href: string): string {
  const safe = safeHref(href);
  return safe ? `[${escapeInline(label)}](${linkTarget(safe)})` : escapeInline(label);
}

function blockMarkdown(block: Block, level: number): string {
  const offset = level - 1;
  switch (block.type) {
    case 'heading':
      return join([
        block.eyebrow ? `*${escapeInline(block.eyebrow)}*` : '',
        heading(level + Math.max(0, (block.level ?? 2) - 1), block.text),
        block.subtitle ? escapeText(block.subtitle) : '',
      ]);
    case 'text':
      return richText(block.markdown, offset);
    case 'list': {
      const style = block.style ?? 'bullet';
      return block.items
        .map((item, i) => {
          const marker =
            style === 'number'
              ? `${i + 1}. `
              : style === 'check'
                ? `- [${item.done ? 'x' : ' '}] `
                : '- ';
          return `${marker}${under(richText(item.text, offset), ' '.repeat(marker.length))}`;
        })
        .join('\n');
    }
    case 'quote': {
      const cite = [block.cite, block.role].filter(Boolean).join(', ');
      return [
        ...richText(block.quote, offset).split('\n'),
        ...(cite ? ['', `— ${escapeInline(cite)}`] : []),
      ]
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n');
    }
    case 'callout':
      return join([
        block.title ? `**${escapeInline(block.title)}**` : '',
        richText(block.body, offset),
      ])
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n');
    case 'divider':
      return block.label ? `---\n\n*${escapeInline(block.label)}*` : '---';
    case 'image': {
      const src = safeImageSrc(block.src);
      const alt = escapeInline(block.alt ?? '');
      // Inline data URIs are noise in a text twin; the alt text carries the meaning.
      const image =
        src && !src.startsWith('data:') ? `![${alt}](${linkTarget(src)})` : `*\\[Image: ${alt}\\]*`;
      return join([image, block.caption ? `*${escapeInline(block.caption)}*` : '']);
    }
    case 'video':
      return `*\\[Video: ${escapeInline(block.label)}\\]*`;
    case 'people':
      return join([
        block.title ? heading(level, block.title) : '',
        block.people
          .map((p) => `- **${escapeInline(p.name)}**${p.role ? ` — ${escapeInline(p.role)}` : ''}`)
          .join('\n'),
      ]);
    case 'stat':
      return join([
        block.title ? heading(level, block.title) : '',
        block.items
          .map((item) => `- **${escapeInline(item.value)}** ${escapeInline(item.label)}`)
          .join('\n'),
      ]);
    case 'table':
      return join([
        block.caption ? `*${escapeInline(block.caption)}*` : '',
        table(
          block.columns.map((c) => c.label),
          block.rows.map((row) => row.map((cell) => (cell === null ? '' : String(cell))))
        ),
      ]);
    case 'chart':
      return chartTable(block.spec);
    case 'code':
      return join([
        block.filename ? `*${escapeInline(block.filename)}*` : '',
        codeFence(block.code, block.lang === 'text' ? '' : block.lang),
        block.caption ? `*${escapeInline(block.caption)}*` : '',
      ]);
    case 'timeline':
      return join([
        block.title ? heading(level, block.title) : '',
        block.events
          .map(
            (event) =>
              `- **${escapeInline(event.time)}** ${escapeInline(event.title)}${
                event.body ? `\n  ${under(richText(event.body, offset), '  ')}` : ''
              }`
          )
          .join('\n'),
      ]);
    case 'steps':
      return join([
        block.title ? heading(level, block.title) : '',
        block.items
          .map(
            (item, i) =>
              `${i + 1}. **${escapeInline(item.title)}**${item.body ? `\n   ${under(richText(item.body, offset), '   ')}` : ''}`
          )
          .join('\n'),
      ]);
    case 'comparison':
      return join([
        block.title ? heading(level, block.title) : '',
        table(
          ['', ...block.columns.map((c) => c.label)],
          block.rows.map((row) => [
            row.label,
            ...row.values.map((v) => (typeof v === 'boolean' ? (v ? 'Yes' : 'No') : (v ?? ''))),
          ])
        ),
      ]);
    case 'cards':
      return join([
        block.title ? heading(level, block.title) : '',
        ...block.items.map((card) =>
          join([heading(level + 1, card.title), card.body ? richText(card.body, offset + 1) : ''])
        ),
      ]);
    case 'cta':
      return join([
        block.title ? heading(level, block.title) : '',
        block.body ? richText(block.body, offset) : '',
        block.actions.map((action) => `- ${link(action.label, action.href)}`).join('\n'),
        block.footnote ? `*${escapeInline(block.footnote)}*` : '',
      ]);
    case 'columns':
      return join(block.columns.map((column) => blocksMarkdown(column, level)));
    case 'tabs':
      return join(
        block.panels.map((panel) =>
          join([heading(level, panel.label), blocksMarkdown(panel.blocks, level + 1)])
        )
      );
    case 'reveal':
      return join([heading(level, block.label), blocksMarkdown(block.blocks, level + 1)]);
    case 'icon':
      return block.label ? `*\\[Icon: ${escapeInline(block.label)}\\]*` : '';
    default: {
      // Interactive and diagram blocks: their plain text (Markdown fields are
      // stripped through the same safe AST by blockText), clearly marked.
      const plain = blockText(block);
      return plain ? `*\\[${escapeInline(block.type)}\\]* ${escapeInline(plain)}` : '';
    }
  }
}

/** Markdown for a list of blocks, in document order. */
export function blocksMarkdown(blocks: readonly Block[], level = 3): string {
  return join(blocks.map((block) => blockMarkdown(block, level)));
}
