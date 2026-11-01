import {
  BLOCK_CONTENT_LIMITS,
  type Block,
  BlockIdSchema,
  CODE_LANGUAGES,
  safeParseBlock,
} from '@protoyard/blocks';
import { documentFromMarkdown, documentToMarkdown } from '@texuli/document/markdown';
import {
  DOCUMENT_FORMAT,
  DOCUMENT_FORMAT_VERSION,
  type DocumentBlock,
  type DocumentInline,
  type DocumentJsonObject,
  inlinePlainText,
  type ListItem,
  type TexuliDocument,
} from '@texuli/document/model';
// schema-core: the same validator without @texuli/deck (G133). Protoyard never writes an inline
// deck into a document (non-text blocks are `component` embeds), so an inline deck is refused.
import { type DocumentDiagnostic, validateDocument } from '@texuli/document/schema-core';
import { type DocDocument, DocDocumentSchema, PAGE_DOCUMENT_LIMITS } from './schema.ts';

/**
 * The bridge between a `kind: "doc"` blueprint body and a `@texuli/document`
 * document (PLAN_008 T-documents). The blueprint body stays the stored and
 * shared format (every blueprint and share link keeps validating); reading
 * tools, the `@texuli/pages` editor and the DOCX, PDF and Markdown writers
 * work on the Texuli document this module builds. There is no second
 * document model here: every Texuli value is validated by
 * `validateDocument` at the untrusted tier before it is returned.
 *
 * - Text blocks (heading, text, list, quote, callout, divider, code) become
 *   native document blocks, so the editor can change them.
 * - Every other block (chart, table, form, timeline, embedded app…) is a
 *   Protoyard block: it becomes a `component` embed with the host ref
 *   `protoyard-block/<key>` and a readable title. The editor can move or
 *   remove it, and `texuliDocumentToDoc` puts the original block back.
 * - In `export` mode, host blocks become what a static file can hold: a
 *   table (tables and charts with labels and series), a list (stats,
 *   timelines, steps), or the title text.
 */

/** Host refs of Protoyard blocks inside a Texuli document. */
export const HOST_BLOCK_REF_PREFIX = 'protoyard-block/' as const;

export type DocConversionMode = 'edit' | 'export';

export interface DocToTexuliOptions {
  /** `edit` (default) keeps host blocks as refs; `export` flattens them for files. */
  mode?: DocConversionMode;
  /**
   * Export mode: `block` (default) writes tables as wrapped `@texuli/blocks`
   * tables, which DOCX and PDF print as tables and Markdown as GFM tables
   * (since Texuli 0.10.0, G112); `list` writes a caption and one bullet per
   * row, for a reader that wants plain lines.
   */
  tables?: 'block' | 'list';
}

export interface DocToTexuliResult {
  document: TexuliDocument;
  /** Protoyard blocks behind each `protoyard-block/<key>` embed, by key. */
  hostBlocks: ReadonlyMap<string, Block>;
}

/** Something the conversion could not keep, said in plain words. */
export interface DocConversionNote {
  /** The Texuli block it concerns. */
  id?: string;
  code: 'dropped' | 'truncated' | 'split';
  message: string;
}

export type TexuliToDocResult =
  | { ok: true; doc: DocDocument; notes: DocConversionNote[] }
  | { ok: false; notes: DocConversionNote[]; issues: string[] };

/** Thrown only when a converted document fails Texuli validation (a bug, never user input). */
export class DocConversionError extends Error {
  readonly issues: readonly DocumentDiagnostic[];
  constructor(issues: readonly DocumentDiagnostic[]) {
    super(
      `The doc could not be converted to a Texuli document: ${issues
        .slice(0, 3)
        .map((issue) => `${issue.jsonPath ?? ''} ${issue.message}`.trim())
        .join('; ')}`
    );
    this.name = 'DocConversionError';
    this.issues = issues;
  }
}

const L = BLOCK_CONTENT_LIMITS;
const TEXULI_TITLE_MAX = 500;

/**
 * Unique Texuli ids: `top(key)` keeps a block's own key; `derived(base)`
 * never takes a key reserved for a top-level block or an id already used.
 */
function idAllocator(reserved: ReadonlySet<string>) {
  const used = new Set<string>();
  const derived = (base: string): string => {
    let id = base.slice(0, 60);
    let n = 2;
    while (used.has(id) || reserved.has(id)) {
      id = `${base.slice(0, 56)}-${n}`;
      n += 1;
    }
    used.add(id);
    return id;
  };
  const top = (key: string): string => {
    if (used.has(key)) return derived(key);
    used.add(key);
    return key;
  };
  return { top, derived };
}

function textRun(text: string): DocumentInline[] {
  return text ? [{ type: 'text', text, marks: [] }] : [];
}

function clip(text: string, max: number): string {
  const chars = [...text];
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}

/** Markdown to Texuli blocks with ids from `allocate(prefix)`; plain text on failure. */
function markdownBlocks(
  markdown: string,
  prefix: string,
  allocate: (base: string) => string
): DocumentBlock[] {
  let counter = 0;
  const imported = documentFromMarkdown(markdown, {
    newId: () => {
      counter += 1;
      return allocate(counter === 1 ? prefix : `${prefix}-${counter}`);
    },
  });
  if (imported.ok && imported.document.blocks.length > 0) return imported.document.blocks;
  return [{ id: allocate(prefix), type: 'paragraph', content: textRun(markdown) }];
}

/** The inline runs of one line of Markdown (list items, summaries). */
function markdownInline(markdown: string): DocumentInline[] {
  const imported = documentFromMarkdown(markdown, { newId: () => 'tmp' });
  const first = imported.ok ? imported.document.blocks[0] : undefined;
  if (first && (first.type === 'paragraph' || first.type === 'heading')) return first.content;
  return textRun(markdown);
}

/** The readable name of a host block (its embed title and file fallback). */
export function hostBlockTitle(block: Block): string {
  const record = block as Record<string, unknown>;
  for (const key of ['title', 'caption', 'label', 'question', 'name']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return clip(value.trim(), TEXULI_TITLE_MAX);
  }
  if (block.type === 'chart') {
    const title = (block.spec as { title?: unknown }).title;
    if (typeof title === 'string' && title.trim()) return clip(title.trim(), TEXULI_TITLE_MAX);
  }
  const words = block.type.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

/** A wrapped `@texuli/blocks` table (`columns: [{ id, label }]`, `rows: [{ [id]: cell }]`). */
function wrappedTable(
  id: string,
  caption: string,
  header: readonly string[],
  rows: readonly (readonly unknown[])[]
): DocumentBlock {
  const columns = header.map((label, index) => ({ id: `c${index + 1}`, label }));
  const props: DocumentJsonObject = {
    caption,
    columns,
    rows: rows.map((row) =>
      Object.fromEntries(columns.map((column, index) => [column.id, cellText(row[index])]))
    ),
  };
  return { id, type: 'block', family: 'data', block: 'table', props };
}

/** A table as a block, or as a caption and one bullet per row. */
function tableBlocks(
  id: string,
  caption: string,
  header: readonly string[],
  rows: readonly (readonly unknown[])[],
  tables: 'block' | 'list',
  allocate: (base: string) => string
): DocumentBlock[] {
  if (tables === 'block') return [wrappedTable(id, caption, header, rows)];
  const lines = rows.map((row) =>
    header
      .map((label, index) => {
        const value = cellText(row[index]);
        return label ? `${label}: ${value}` : value;
      })
      .filter((part) => part && !part.endsWith(': '))
      .join(' · ')
  );
  return [
    {
      id: allocate(`${id}-caption`),
      type: 'paragraph',
      content: [{ type: 'text', text: caption, marks: [{ type: 'strong' }] }],
    },
    plainList(id, 'bullet', lines, allocate),
  ];
}

function plainList(
  id: string,
  kind: 'bullet' | 'ordered',
  lines: readonly string[],
  allocate: (base: string) => string
): DocumentBlock {
  return {
    id,
    type: 'list',
    kind,
    items: lines.map((line, index) => ({
      id: allocate(`${id}-i${index + 1}`),
      blocks: [{ id: allocate(`${id}-p${index + 1}`), type: 'paragraph', content: textRun(line) }],
    })),
  };
}

/** What a static file holds for a host block (export mode). */
function exportBlocks(
  block: Block,
  key: string,
  top: (key: string) => string,
  allocate: (base: string) => string,
  tables: 'block' | 'list'
): DocumentBlock[] | null {
  const id = (): string => top(key);
  switch (block.type) {
    case 'table':
      return tableBlocks(
        id(),
        block.caption,
        block.columns.map((column) => column.label),
        block.rows,
        tables,
        allocate
      );
    case 'chart': {
      const spec = block.spec as { title?: unknown; labels?: unknown; series?: unknown };
      if (!Array.isArray(spec.labels) || !Array.isArray(spec.series)) return null;
      const series = spec.series.filter(
        (row): row is { label: string; values: unknown[] } =>
          typeof row === 'object' &&
          row !== null &&
          typeof (row as { label?: unknown }).label === 'string' &&
          Array.isArray((row as { values?: unknown }).values)
      );
      if (series.length === 0) return null;
      const rows = spec.labels.map((label, index) => [
        cellText(label),
        ...series.map((row) => row.values[index]),
      ]);
      return tableBlocks(
        id(),
        hostBlockTitle(block),
        ['', ...series.map((row) => row.label)],
        rows,
        tables,
        allocate
      );
    }
    case 'stat':
      return [
        plainList(
          id(),
          'bullet',
          block.items.map((item) =>
            [`${item.value} ${item.label}`, item.delta ? `(${item.delta})` : '', item.context ?? '']
              .filter(Boolean)
              .join(' ')
          ),
          allocate
        ),
      ];
    case 'timeline':
      return [
        plainList(
          id(),
          'bullet',
          block.events.map((event) =>
            [`${event.time}: ${event.title}`, event.body ?? ''].filter(Boolean).join('. ')
          ),
          allocate
        ),
      ];
    case 'steps':
      return [
        plainList(
          id(),
          'ordered',
          block.items.map((step) => [step.title, step.body ?? ''].filter(Boolean).join(': ')),
          allocate
        ),
      ];
    default:
      return null;
  }
}

function listKind(style: string | undefined): 'bullet' | 'ordered' | 'todo' {
  if (style === 'number') return 'ordered';
  if (style === 'check') return 'todo';
  return 'bullet';
}

/**
 * The Texuli document for a doc blueprint body, validated at the untrusted
 * tier. Deterministic: the same doc always gives the same document and ids.
 */
export function docToTexuliDocument(
  doc: DocDocument,
  options: DocToTexuliOptions = {}
): DocToTexuliResult {
  const mode = options.mode ?? 'edit';
  const keys = doc.blocks.map((block, index) => block.id ?? `block-${index + 1}`);
  const { top, derived: allocateDerived } = idAllocator(new Set(keys));
  const allocate = top;
  const hostBlocks = new Map<string, Block>();
  const blocks: DocumentBlock[] = [];

  doc.blocks.forEach((block, index) => {
    const key = keys[index] as string;
    switch (block.type) {
      case 'heading': {
        const level = Math.min(4, Math.max(1, block.level ?? 2)) as 1 | 2 | 3 | 4;
        if (mode === 'export' && block.eyebrow) {
          blocks.push({
            id: allocateDerived(`${key}-eyebrow`),
            type: 'paragraph',
            content: [{ type: 'text', text: block.eyebrow, marks: [{ type: 'strong' }] }],
          });
        }
        blocks.push({ id: allocate(key), type: 'heading', level, content: textRun(block.text) });
        if (mode === 'export' && block.subtitle) {
          blocks.push({
            id: allocateDerived(`${key}-subtitle`),
            type: 'paragraph',
            content: [{ type: 'text', text: block.subtitle, marks: [{ type: 'em' }] }],
          });
        }
        break;
      }
      case 'text': {
        const imported = markdownBlocks(block.markdown, key, (base) =>
          base === key ? top(key) : allocateDerived(base)
        );
        blocks.push(...imported);
        break;
      }
      case 'list': {
        const kind = listKind(block.style);
        const items: ListItem[] = block.items.map((item, itemIndex) => ({
          id: allocateDerived(`${key}-i${itemIndex + 1}`),
          ...(kind === 'todo' ? { checked: item.done === true } : {}),
          blocks: [
            {
              id: allocateDerived(`${key}-p${itemIndex + 1}`),
              type: 'paragraph',
              content: markdownInline(item.text),
            },
          ],
        }));
        blocks.push({ id: allocate(key), type: 'list', kind, items });
        break;
      }
      case 'quote': {
        const inner = markdownBlocks(block.quote, `${key}-q`, allocateDerived);
        if (mode === 'export' && block.cite) {
          inner.push({
            id: allocateDerived(`${key}-cite`),
            type: 'paragraph',
            content: textRun(`— ${[block.cite, block.role].filter(Boolean).join(', ')}`),
          });
        }
        blocks.push({ id: allocate(key), type: 'quote', blocks: inner });
        break;
      }
      case 'callout':
        blocks.push({
          id: allocate(key),
          type: 'callout',
          tone: 'info',
          ...(block.title ? { title: block.title } : {}),
          blocks: markdownBlocks(block.body, `${key}-b`, allocateDerived),
        });
        break;
      case 'divider':
        blocks.push({ id: allocate(key), type: 'divider' });
        break;
      case 'code':
        blocks.push({
          id: allocate(key),
          type: 'code',
          ...(block.lang === 'text' ? {} : { lang: block.lang }),
          text: block.code,
        });
        break;
      default: {
        const flattened =
          mode === 'export'
            ? exportBlocks(block, key, top, allocateDerived, options.tables ?? 'block')
            : null;
        if (flattened) {
          blocks.push(...flattened);
          break;
        }
        hostBlocks.set(key, block);
        blocks.push({
          id: allocate(key),
          type: 'embed',
          kind: 'component',
          ref: `${HOST_BLOCK_REF_PREFIX}${key}`,
          title: hostBlockTitle(block),
        });
      }
    }
  });

  const first = doc.blocks[0];
  if (mode === 'export' && !(first?.type === 'heading' && (first.level ?? 2) === 1)) {
    blocks.unshift({
      id: allocateDerived('doc-title'),
      type: 'heading',
      level: 1,
      content: textRun(doc.title),
    });
  }

  const candidate: TexuliDocument = {
    format: DOCUMENT_FORMAT,
    formatVersion: DOCUMENT_FORMAT_VERSION,
    meta: {
      title: doc.title,
      ...(doc.description ? { description: doc.description } : {}),
      locale: 'en',
    },
    ...(doc.print?.pageBreaks === 'heading'
      ? {
          page: {
            size: 'a4' as const,
            orientation: 'portrait' as const,
            breaks: blocks
              .filter((row, index) => index > 0 && row.type === 'heading' && row.level <= 2)
              .map((row) => row.id),
          },
        }
      : {}),
    blocks,
  };
  const checked = validateDocument(candidate);
  if (!checked.ok) throw new DocConversionError(checked.issues);
  return { document: checked.document, hostBlocks };
}

/** Markdown of a block list, without the trailing newline. */
function blocksMarkdown(blocks: readonly DocumentBlock[]): string {
  return documentToMarkdown({ meta: { title: '' }, blocks: [...blocks] }, { embeds: 'title' })
    .replace(/\s+$/, '')
    .trim();
}

function inlineMarkdown(content: readonly DocumentInline[]): string {
  return blocksMarkdown([{ id: 'x', type: 'paragraph', content: [...content] }]);
}

/** A Protoyard block id from a Texuli id, when it is one. */
function protoyardId(id: string, used: Set<string>): string | undefined {
  if (!BlockIdSchema.safeParse(id).success || used.has(id)) return undefined;
  used.add(id);
  return id;
}

/** Splits long Markdown at paragraph or word boundaries into chunks of at most `max`. */
function chunks(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text;
  while ([...rest].length > max) {
    const head = [...rest].slice(0, max).join('');
    let cut = head.lastIndexOf('\n\n');
    if (cut < max / 2) cut = head.lastIndexOf(' ');
    if (cut < max / 2) cut = head.length;
    out.push(head.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * The doc blueprint body for an edited Texuli document. Blocks the editor
 * did not change come back exactly as they were in `base` (eyebrows, icons,
 * tones and every host block); changed text blocks are rebuilt from the
 * Texuli blocks. Anything with no doc equivalent (a nested page, an image
 * without a size, a catalog embed) is left out and named in `notes`.
 */
export function texuliDocumentToDoc(edited: TexuliDocument, base: DocDocument): TexuliToDocResult {
  const notes: DocConversionNote[] = [];
  const checked = validateDocument(edited);
  if (!checked.ok) {
    return {
      ok: false,
      notes,
      issues: checked.issues.map((issue) => `${issue.jsonPath ?? ''} ${issue.message}`.trim()),
    };
  }
  const original = docToTexuliDocument(base, { mode: 'edit' });
  const baseKeys = base.blocks.map((block, index) => block.id ?? `block-${index + 1}`);
  const baseByKey = new Map(baseKeys.map((key, index) => [key, base.blocks[index] as Block]));
  // The Texuli rendering of each base block, by the Texuli id of its first block.
  const renderedByFirstId = new Map<string, { key: string; json: string; length: number }>();
  {
    let cursor = 0;
    base.blocks.forEach((block, index) => {
      const single = docToTexuliDocument({ ...base, blocks: [block] }, { mode: 'edit' });
      const length = single.document.blocks.length;
      const slice = original.document.blocks.slice(cursor, cursor + length);
      const first = slice[0];
      if (first) {
        renderedByFirstId.set(first.id, {
          key: baseKeys[index] as string,
          json: JSON.stringify(slice),
          length,
        });
      }
      cursor += length;
    });
  }

  const used = new Set<string>();
  const out: Block[] = [];
  const push = (block: Block): void => {
    const parsed = safeParseBlock(block);
    if (parsed.success) out.push(parsed.data);
    else
      notes.push({
        ...(block.id ? { id: block.id } : {}),
        code: 'dropped',
        message: `A ${block.type} block did not fit the doc format and was left out.`,
      });
  };
  const keepBase = (key: string): void => {
    const block = baseByKey.get(key);
    if (!block) return;
    if (block.id && used.has(block.id)) {
      const { id: _drop, ...rest } = block;
      push(rest as Block);
      return;
    }
    if (block.id) used.add(block.id);
    push(block);
  };

  const convert = (blocks: readonly DocumentBlock[], topLevel: boolean): void => {
    for (let index = 0; index < blocks.length; index += 1) {
      const node = blocks[index] as DocumentBlock;
      if (topLevel) {
        const rendered = renderedByFirstId.get(node.id);
        if (rendered) {
          const slice = blocks.slice(index, index + rendered.length);
          if (JSON.stringify(slice) === rendered.json) {
            keepBase(rendered.key);
            index += rendered.length - 1;
            continue;
          }
        }
      }
      const previous = baseByKey.get(node.id);
      const id = protoyardId(node.id, used);
      const tone = previous?.tone ? { tone: previous.tone } : {};
      switch (node.type) {
        case 'paragraph': {
          const markdown = inlineMarkdown(node.content);
          if (!markdown) break;
          const parts = chunks(markdown, L.markdown);
          if (parts.length > 1)
            notes.push({
              id: node.id,
              code: 'split',
              message: 'A long paragraph was split into several text blocks.',
            });
          parts.forEach((part, partIndex) => {
            push({
              type: 'text',
              ...(partIndex === 0 && id ? { id } : {}),
              markdown: part,
              ...(previous?.type === 'text' && previous.size ? { size: previous.size } : {}),
              ...(previous?.type === 'text' && previous.align ? { align: previous.align } : {}),
              ...tone,
            });
          });
          break;
        }
        case 'heading': {
          const text = inlinePlainText(node.content).replace(/\s+/g, ' ').trim();
          if (!text) break;
          const was = previous?.type === 'heading' ? previous : undefined;
          push({
            type: 'heading',
            ...(id ? { id } : {}),
            text: clip(text, 200),
            level: node.level,
            ...(was?.eyebrow ? { eyebrow: was.eyebrow } : {}),
            ...(was?.subtitle ? { subtitle: was.subtitle } : {}),
            ...(was?.align ? { align: was.align } : {}),
            ...tone,
          });
          break;
        }
        case 'code': {
          const was = previous?.type === 'code' ? previous : undefined;
          const lang = (CODE_LANGUAGES as readonly string[]).includes(node.lang ?? '')
            ? (node.lang as (typeof CODE_LANGUAGES)[number])
            : 'text';
          if (!node.text.trim()) break;
          push({
            type: 'code',
            ...(id ? { id } : {}),
            code: node.text,
            lang,
            ...(was?.filename ? { filename: was.filename } : {}),
            ...(was?.caption ? { caption: was.caption } : {}),
            ...(was?.lineNumbers !== undefined ? { lineNumbers: was.lineNumbers } : {}),
            ...tone,
          });
          break;
        }
        case 'list': {
          const was = previous?.type === 'list' ? previous : undefined;
          const style =
            node.kind === 'ordered'
              ? 'number'
              : node.kind === 'todo'
                ? 'check'
                : was?.style === 'icon'
                  ? 'icon'
                  : 'bullet';
          const fallbackIcon = was?.items.at(-1)?.icon;
          const items = node.items
            .map((item, itemIndex) => {
              const text = clip(
                blocksMarkdown(item.blocks).replace(/\n+/g, ' ').trim(),
                L.shortMarkdown
              );
              if (!text) return null;
              return {
                text,
                ...(style === 'check' ? { done: item.checked === true } : {}),
                ...(style === 'icon'
                  ? { icon: was?.items[itemIndex]?.icon ?? fallbackIcon ?? 'check' }
                  : {}),
              };
            })
            .filter((item) => item !== null);
          for (let start = 0; start < items.length; start += L.listItems) {
            if (start > 0)
              notes.push({
                id: node.id,
                code: 'split',
                message: `A list longer than ${L.listItems} items was split.`,
              });
            push({
              type: 'list',
              ...(start === 0 && id ? { id } : {}),
              style,
              items: items.slice(start, start + L.listItems),
              ...tone,
            } as Block);
          }
          break;
        }
        case 'quote': {
          const was = previous?.type === 'quote' ? previous : undefined;
          const quote = clip(blocksMarkdown(node.blocks), L.shortMarkdown);
          if (!quote) break;
          push({
            type: 'quote',
            ...(id ? { id } : {}),
            quote,
            ...(was?.cite ? { cite: was.cite } : {}),
            ...(was?.role ? { role: was.role } : {}),
            ...(was?.avatar ? { avatar: was.avatar } : {}),
            ...tone,
          });
          break;
        }
        case 'callout': {
          const was = previous?.type === 'callout' ? previous : undefined;
          const body = clip(blocksMarkdown(node.blocks), 1_000);
          if (!body) break;
          push({
            type: 'callout',
            ...(id ? { id } : {}),
            ...(node.title ? { title: clip(node.title, 120) } : {}),
            body,
            ...(was?.icon ? { icon: was.icon } : {}),
            ...tone,
          });
          break;
        }
        case 'divider': {
          const was = previous?.type === 'divider' ? previous : undefined;
          push({
            type: 'divider',
            ...(id ? { id } : {}),
            ...(was?.label ? { label: was.label } : {}),
            ...(was?.variant ? { variant: was.variant } : {}),
            ...tone,
          });
          break;
        }
        case 'toggle': {
          const summary = inlineMarkdown(node.summary);
          if (summary) push({ type: 'text', ...(id ? { id } : {}), markdown: `**${summary}**` });
          convert(node.blocks, false);
          break;
        }
        case 'columns':
          for (const column of node.columns) convert(column.blocks, false);
          break;
        case 'embed': {
          const key = node.ref?.startsWith(HOST_BLOCK_REF_PREFIX)
            ? node.ref.slice(HOST_BLOCK_REF_PREFIX.length)
            : null;
          if (key && baseByKey.has(key)) {
            used.delete(node.id);
            keepBase(key);
          } else {
            notes.push({
              id: node.id,
              code: 'dropped',
              message: `The ${node.kind} embed "${node.title ?? node.kind}" has no doc equivalent and was left out.`,
            });
          }
          break;
        }
        case 'block': {
          const parsed = safeParseBlock({ ...node.props, type: node.block, id: node.id });
          if (parsed.success) {
            used.add(node.id);
            push(parsed.data);
          } else {
            notes.push({
              id: node.id,
              code: 'dropped',
              message: `The ${node.block} block has no doc equivalent and was left out.`,
            });
          }
          break;
        }
        case 'media':
          notes.push({
            id: node.id,
            code: 'dropped',
            message: `The image "${node.alt || node.ref}" was left out: doc images need a width and height in the blueprint.`,
          });
          break;
        case 'page-link':
          notes.push({
            id: node.id,
            code: 'dropped',
            message: `The link to the page "${node.title}" was left out: a doc is one page.`,
          });
          break;
      }
    }
  };
  convert(checked.document.blocks, true);

  if (out.length > PAGE_DOCUMENT_LIMITS.maxDocBlocks) {
    notes.push({
      code: 'truncated',
      message: `A doc holds at most ${PAGE_DOCUMENT_LIMITS.maxDocBlocks} blocks; the rest were left out.`,
    });
    out.length = PAGE_DOCUMENT_LIMITS.maxDocBlocks;
  }
  if (out.length === 0) {
    return { ok: false, notes, issues: ['A doc needs at least one block.'] };
  }
  const parsed = DocDocumentSchema.safeParse({ ...base, blocks: out });
  if (!parsed.success) {
    return {
      ok: false,
      notes,
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`),
    };
  }
  return { ok: true, doc: parsed.data, notes };
}
