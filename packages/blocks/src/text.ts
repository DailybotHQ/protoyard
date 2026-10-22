import { inlineText, type MdBlock, type MdDocument, parseMarkdown } from '@protoyard/ai';
import type { Block, ChartBlock } from './schema/index.ts';
import { forEachBlock, toJsonPath } from './schema/index.ts';

/**
 * Pure text helpers over block trees (no DOM). Used by docs (TOC, print),
 * decks (notes, Markdown twin), authoring (word counts) and kind summaries.
 */

/** One node from {@link walkBlocks}. */
export interface WalkedBlock {
  block: Block;
  /** Path segments from the root list (numbers and property names). */
  path: readonly (string | number)[];
  /** Blueprint-style JSONPath, for example `$[0]["panels"][1]["blocks"][0]`. */
  jsonPath: string;
  /**
   * Nesting depth by string path segments (container property names). Top-level
   * blocks have depth 0.
   */
  depth: number;
}

/**
 * Depth-first walk of every block, including those nested in columns, tabs and
 * reveals. Order matches {@link forEachBlock}.
 */
export function walkBlocks(blocks: readonly Block[]): WalkedBlock[] {
  const out: WalkedBlock[] = [];
  forEachBlock(blocks, (block, path) => {
    out.push({
      block,
      path,
      jsonPath: toJsonPath(path),
      depth: path.filter((segment) => typeof segment === 'string').length,
    });
  });
  return out;
}

/** Stable slug for a heading label (DocsLayout headingId rules). */
export function slugifyHeading(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

/** Unique slug among `used`, appending `-2`, `-3`, … when needed. */
export function uniqueSlug(label: string, used: ReadonlySet<string>): string {
  const base = slugifyHeading(label);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function joinParts(parts: readonly string[]): string {
  return parts
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function markdownPlain(source: string): string {
  return mdDocumentText(parseMarkdown(source));
}

function mdDocumentText(doc: MdDocument): string {
  return doc.blocks.map(mdBlockText).filter(Boolean).join('\n\n').trim();
}

function mdBlockText(block: MdBlock): string {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
      return inlineText(block.children);
    case 'code':
    case 'chart':
      return block.text;
    case 'list':
      return block.items
        .map((item) => item.children.map(mdBlockText).filter(Boolean).join(' '))
        .filter(Boolean)
        .join('\n');
    case 'quote':
      return block.children.map(mdBlockText).filter(Boolean).join('\n');
    case 'table':
      return [
        ...block.header.map((cell) => inlineText(cell)),
        ...block.rows.flatMap((row) => row.map((cell) => inlineText(cell))),
      ]
        .filter(Boolean)
        .join(' ');
    case 'rule':
      return '';
    default:
      return '';
  }
}

function chartTitle(block: Pick<ChartBlock, 'spec'>): string {
  const spec = block.spec as { title?: string; labels?: string[] };
  return joinParts([spec.title ?? '', ...(spec.labels ?? []).map(String)]);
}

/**
 * Plain text of one block (no children of containers). Suitable for search,
 * notes checks and short summaries. Markdown fields are stripped to plain text
 * via `@protoyard/ai` `parseMarkdown` / `inlineText`.
 */
export function blockText(block: Block): string {
  switch (block.type) {
    case 'heading':
      return joinParts([block.eyebrow ?? '', block.text, block.subtitle ?? '']);
    case 'text':
      return markdownPlain(block.markdown);
    case 'list':
      return joinParts(block.items.map((item) => markdownPlain(item.text)));
    case 'quote':
      return joinParts([markdownPlain(block.quote), block.cite ?? '', block.role ?? '']);
    case 'callout':
      return joinParts([block.title ?? '', markdownPlain(block.body)]);
    case 'divider':
      return block.label ?? '';
    case 'image':
      return joinParts([block.alt ?? '', block.caption ?? '', block.credit ?? '']);
    case 'video':
      return joinParts([block.label, block.caption ?? '']);
    case 'people':
      return joinParts([
        block.title ?? '',
        ...block.people.flatMap((person) => [person.name, person.role ?? '', person.bio ?? '']),
      ]);
    case 'stat':
      return joinParts([
        block.title ?? '',
        ...block.items.flatMap((item) => [
          item.value,
          item.label,
          item.delta ?? '',
          item.context ?? '',
        ]),
        block.source ?? '',
      ]);
    case 'table': {
      const headers = block.columns.map((column) => column.label);
      const cells = block.rows.flatMap((row) =>
        row.map((cell) => (cell === null ? '' : String(cell)))
      );
      return joinParts([block.caption, ...headers, ...cells]);
    }
    case 'chart':
      return chartTitle(block);
    case 'code':
      return joinParts([block.filename ?? '', block.caption ?? '', block.code]);
    case 'timeline':
      return joinParts([
        block.title ?? '',
        ...block.events.flatMap((event) => [
          event.time,
          event.title,
          event.body ? markdownPlain(event.body) : '',
        ]),
      ]);
    case 'steps':
      return joinParts([
        block.title ?? '',
        ...block.items.flatMap((item) => [item.title, item.body ? markdownPlain(item.body) : '']),
      ]);
    case 'comparison':
      return joinParts([
        block.title ?? '',
        ...block.columns.map((column) => column.label),
        ...block.rows.flatMap((row) => [
          row.label,
          ...row.values.map((value) =>
            typeof value === 'boolean' ? (value ? 'yes' : 'no') : value
          ),
        ]),
      ]);
    case 'cards':
      return joinParts([
        block.title ?? '',
        ...block.items.flatMap((card) => [
          card.eyebrow ?? '',
          card.title,
          card.body ? markdownPlain(card.body) : '',
          card.imageAlt ?? '',
        ]),
      ]);
    case 'icon':
      return block.label ?? '';
    case 'cta':
      return joinParts([
        block.title ?? '',
        block.body ? markdownPlain(block.body) : '',
        ...block.actions.map((action) => action.label),
        block.footnote ?? '',
      ]);
    case 'columns':
    case 'tabs':
    case 'reveal':
      return '';
    case 'poll':
      return joinParts([block.question, ...block.options.map((option) => option.label)]);
    case 'quiz':
      return joinParts([
        block.title ?? '',
        ...block.questions.flatMap((question) => [
          markdownPlain(question.prompt),
          ...question.choices.map((choice) => choice.label),
          question.explanation ? markdownPlain(question.explanation) : '',
        ]),
      ]);
    case 'calculator':
      return joinParts([
        block.title ?? '',
        block.description ? markdownPlain(block.description) : '',
        ...block.inputs.map((input) => input.label),
        ...block.outputs.map((output) => output.label),
      ]);
    case 'counter':
      return joinParts([block.label, block.unit ?? '']);
    case 'chart-controls':
      return chartTitle(block);
    case 'map':
      return joinParts([
        block.title ?? '',
        block.label,
        ...block.points.flatMap((point) => [point.label, point.description ?? '']),
      ]);
    case 'embed-app':
      return joinParts([block.title, block.startLabel ?? '']);
    case 'form':
      return joinParts([
        block.title ?? '',
        block.description ? markdownPlain(block.description) : '',
        ...block.fields.map((field) => field.label),
        block.submitLabel,
        block.successMessage,
      ]);
    case 'flow':
      return joinParts(block.nodes.map((node) => node.label));
    case 'tree':
      return joinParts(block.nodes.map((node) => node.label));
    case 'board':
      return joinParts(
        block.columns.flatMap((column) => [column.title, ...column.cards.map((card) => card.title)])
      );
    case 'terminal':
      return joinParts(block.lines.map((line) => line.text));
    default: {
      const _exhaustive: never = block;
      void _exhaustive;
      return '';
    }
  }
}

/**
 * Plain text of a block list, depth-first, including nested container children.
 * Separate blocks with a blank line so word counts stay stable.
 */
export function blocksText(blocks: readonly Block[]): string {
  const parts: string[] = [];
  forEachBlock(blocks, (block) => {
    const text = blockText(block);
    if (text) parts.push(text);
  });
  return parts.join('\n\n').trim();
}

/** Word count for plain text (Unicode letters/numbers; apostrophes inside words). */
export function countWords(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  const matches = normalized.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu);
  return matches?.length ?? 0;
}

/** Word count over a block list (nested included). */
export function countBlockWords(blocks: readonly Block[]): number {
  return countWords(blocksText(blocks));
}

/** One outline entry from a heading block. */
export interface OutlineEntry {
  /** Stable unique slug for deep links (`#id`). */
  id: string;
  /** Visible heading label. */
  label: string;
  /** Outline level 1–4 (from the heading block; default 2). */
  level: 1 | 2 | 3 | 4;
  /** JSONPath of the heading block. */
  jsonPath: string;
  /** Block id when the author set one. */
  blockId?: string;
}

/**
 * Document outline from heading blocks, depth-first. Slugs are unique and
 * stable for a fixed tree (same rules as DocsLayout).
 */
export function outlineOf(blocks: readonly Block[]): OutlineEntry[] {
  const used = new Set<string>();
  const entries: OutlineEntry[] = [];
  forEachBlock(blocks, (block, path) => {
    if (block.type !== 'heading') return;
    const label = block.text.trim();
    if (!label) return;
    const rawLevel = block.level ?? 2;
    const level = (rawLevel < 1 ? 1 : rawLevel > 4 ? 4 : rawLevel) as 1 | 2 | 3 | 4;
    let id = block.id ? slugifyHeading(block.id) : slugifyHeading(label);
    if (used.has(id)) id = uniqueSlug(label, used);
    used.add(id);
    entries.push({
      id,
      label,
      level,
      jsonPath: toJsonPath(path),
      ...(block.id !== undefined ? { blockId: block.id } : {}),
    });
  });
  return entries;
}

/** Escape Markdown control characters in plain text. */
export function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+\-.!|>])/g, '\\$1');
}

function mdInline(text: string): string {
  return escapeMarkdown(text);
}

function stripNull(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: strip hostile NUL from untrusted markdown
  return text.replace(/\u0000/g, '');
}

function blockToMarkdown(block: Block): string {
  switch (block.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, block.level ?? 2));
      const hashes = '#'.repeat(level);
      return [
        block.eyebrow ? `*${mdInline(block.eyebrow)}*` : '',
        `${hashes} ${mdInline(block.text)}`,
        block.subtitle ? mdInline(block.subtitle) : '',
      ]
        .filter(Boolean)
        .join('\n\n');
    }
    case 'text':
      return stripNull(block.markdown).trim();
    case 'list': {
      const style = block.style ?? 'bullet';
      return block.items
        .map((item, i) => {
          const body = stripNull(item.text).trim();
          if (style === 'number') return `${i + 1}. ${body}`;
          if (style === 'check') return `- [${item.done ? 'x' : ' '}] ${body}`;
          return `- ${body}`;
        })
        .join('\n');
    }
    case 'quote': {
      const body = stripNull(block.quote)
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
      const cite = block.cite ? `\n>\n> — ${mdInline(block.cite)}` : '';
      return `${body}${cite}`;
    }
    case 'callout': {
      const title = block.title ? `**${mdInline(block.title)}**\n\n` : '';
      const body = stripNull(block.body).trim();
      return `> ${title}${body}`.split('\n').join('\n> ');
    }
    case 'divider':
      return block.label ? `---\n\n*${mdInline(block.label)}*\n\n---` : '---';
    case 'image':
      return `![${mdInline(block.alt ?? '')}](${block.src})${
        block.caption ? `\n\n*${mdInline(block.caption)}*` : ''
      }`;
    case 'video':
      return `*[Video: ${mdInline(block.label)}]*`;
    case 'people':
      return [
        block.title ? `### ${mdInline(block.title)}` : '',
        ...block.people.map(
          (person) =>
            `- **${mdInline(person.name)}**${person.role ? ` — ${mdInline(person.role)}` : ''}`
        ),
      ]
        .filter(Boolean)
        .join('\n');
    case 'stat':
      return [
        block.title ? `### ${mdInline(block.title)}` : '',
        ...block.items.map((item) => `- **${mdInline(item.value)}** ${mdInline(item.label)}`),
      ]
        .filter(Boolean)
        .join('\n');
    case 'table': {
      const header = block.columns.map((column) => mdInline(column.label));
      const sep = block.columns.map(() => '---');
      const rows = block.rows.map((row) =>
        row.map((cell) => mdInline(cell === null ? '' : String(cell))).join(' | ')
      );
      return [
        `| ${header.join(' | ')} |`,
        `| ${sep.join(' | ')} |`,
        ...rows.map((row) => `| ${row} |`),
      ].join('\n');
    }
    case 'chart': {
      const title = chartTitle(block);
      return title ? `*[Chart: ${mdInline(title)}]*` : '*[Chart]*';
    }
    case 'code': {
      const lang = block.lang === 'text' ? '' : block.lang;
      return `${block.filename ? `\`${mdInline(block.filename)}\`\n\n` : ''}\`\`\`${lang}\n${stripNull(block.code)}\n\`\`\``;
    }
    case 'timeline':
      return [
        block.title ? `### ${mdInline(block.title)}` : '',
        ...block.events.map(
          (event) =>
            `- **${mdInline(event.time)} — ${mdInline(event.title)}**${
              event.body ? `\n  ${stripNull(event.body).trim()}` : ''
            }`
        ),
      ]
        .filter(Boolean)
        .join('\n');
    case 'steps':
      return [
        block.title ? `### ${mdInline(block.title)}` : '',
        ...block.items.map(
          (item, i) =>
            `${i + 1}. **${mdInline(item.title)}**${
              item.body ? `\n   ${stripNull(item.body).trim()}` : ''
            }`
        ),
      ]
        .filter(Boolean)
        .join('\n');
    case 'comparison': {
      const header = block.columns.map((column) => mdInline(column.label));
      const rows = block.rows.map((row) =>
        [
          mdInline(row.label),
          ...row.values.map((value) =>
            typeof value === 'boolean' ? (value ? 'yes' : 'no') : mdInline(value)
          ),
        ].join(' | ')
      );
      return [
        block.title ? `### ${mdInline(block.title)}\n` : '',
        `| | ${header.join(' | ')} |`,
        `| --- | ${header.map(() => '---').join(' | ')} |`,
        ...rows.map((row) => `| ${row} |`),
      ]
        .filter(Boolean)
        .join('\n');
    }
    case 'cards':
      return [
        block.title ? `### ${mdInline(block.title)}` : '',
        ...block.items.map(
          (card) =>
            `#### ${mdInline(card.title)}${card.body ? `\n\n${stripNull(card.body).trim()}` : ''}`
        ),
      ]
        .filter(Boolean)
        .join('\n\n');
    case 'icon':
      return block.label ? `*[Icon: ${mdInline(block.label)}]*` : '';
    case 'cta':
      return [
        block.title ? `### ${mdInline(block.title)}` : '',
        block.body ? stripNull(block.body).trim() : '',
        ...block.actions.map((action) => `- [${mdInline(action.label)}](${action.href})`),
        block.footnote ? `*${mdInline(block.footnote)}*` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
    case 'columns':
      return block.columns
        .map((column, i) => {
          const body = blocksToMarkdown(column).trim();
          return body ? `<!-- column ${i + 1} -->\n\n${body}` : '';
        })
        .filter(Boolean)
        .join('\n\n');
    case 'tabs':
      return block.panels
        .map((panel) => {
          const body = blocksToMarkdown(panel.blocks).trim();
          return body ? `### ${mdInline(panel.label)}\n\n${body}` : `### ${mdInline(panel.label)}`;
        })
        .join('\n\n');
    case 'reveal': {
      const body = blocksToMarkdown(block.blocks).trim();
      return `### ${mdInline(block.label)}\n\n${body}`;
    }
    case 'poll':
      return [
        `**${mdInline(block.question)}**`,
        ...block.options.map((option) => `- ${mdInline(option.label)}`),
      ].join('\n');
    case 'quiz':
      return [
        block.title ? `### ${mdInline(block.title)}` : '',
        ...block.questions.map(
          (question, i) =>
            `${i + 1}. ${stripNull(question.prompt).trim()}\n${question.choices
              .map((choice) => `   - ${mdInline(choice.label)}`)
              .join('\n')}`
        ),
      ]
        .filter(Boolean)
        .join('\n\n');
    case 'calculator':
    case 'counter':
    case 'chart-controls':
    case 'map':
    case 'embed-app': {
      const plain = blockText(block);
      return plain ? `*${mdInline(plain)}*` : '';
    }
    case 'form':
      return [
        block.title ? `### ${mdInline(block.title)}` : '',
        block.description ? stripNull(block.description).trim() : '',
        ...block.fields.map((field) => `- ${mdInline(field.label)}`),
      ]
        .filter(Boolean)
        .join('\n\n');
    case 'flow':
      return block.nodes.map((node, index) => `${index + 1}. ${mdInline(node.label)}`).join('\n');
    case 'tree': {
      const depthOf = (id: string): number => {
        let depth = 0;
        let parent = block.nodes.find((node) => node.id === id)?.parentId ?? null;
        while (parent !== null && depth < 64) {
          depth += 1;
          const parentId: string = parent;
          parent = block.nodes.find((node) => node.id === parentId)?.parentId ?? null;
        }
        return depth;
      };
      return block.nodes
        .map((node) => `${'  '.repeat(depthOf(node.id))}- ${mdInline(node.label)}`)
        .join('\n');
    }
    case 'board':
      return block.columns
        .map(
          (column) =>
            `**${mdInline(column.title)}**${column.cards.map((card) => `\n- ${mdInline(card.title)}`).join('')}`
        )
        .join('\n\n');
    case 'terminal':
      return `\`\`\`text\n${block.lines.map((line) => (line.kind === 'prompt' ? `$ ${stripNull(line.text)}` : stripNull(line.text))).join('\n')}\n\`\`\``;
    default: {
      const _exhaustive: never = block;
      void _exhaustive;
      return '';
    }
  }
}

/**
 * Bounded Markdown twin of a block list (deck notes twin, print export).
 * Plain labels are escaped; author markdown fields pass through without HTML.
 * Nested containers expand in document order.
 */
export function blocksToMarkdown(blocks: readonly Block[]): string {
  return blocks
    .map((block) => blockToMarkdown(block))
    .filter((part) => part.trim().length > 0)
    .join('\n\n')
    .trim();
}
