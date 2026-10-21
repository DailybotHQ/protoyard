import { z } from 'zod';

/** Markdown-backed editor documents are bounded data, never HTML. */
export const EDITOR_DOCUMENT_MAX_LENGTH = 32_000;
export const EDITOR_DOCUMENT_MAX_BLOCKS = 256;
export const EDITOR_DOCUMENT_MAX_LIST_ITEMS = 100;
const EDITOR_TEXT_MAX_LENGTH = 8_000;

export type EditorMark = 'bold' | 'italic' | 'strike';

const TextSchema = z.string().max(EDITOR_TEXT_MAX_LENGTH);
const MarkSchema = z.enum(['bold', 'italic', 'strike']);

const InlineLeafSchema = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('text'), text: TextSchema, marks: z.array(MarkSchema).max(3) })
    .strict(),
  z.object({ type: z.literal('code'), text: TextSchema }).strict(),
  z
    .object({
      type: z.literal('mention'),
      id: z.string().min(1).max(64),
      label: z.string().min(1).max(120),
    })
    .strict(),
]);
const InlineSchema = z.discriminatedUnion('type', [
  InlineLeafSchema,
  z
    .object({
      type: z.literal('link'),
      href: z.string().max(2_048),
      children: z.array(InlineLeafSchema).max(128),
    })
    .strict()
    .superRefine((link, ctx) => {
      if (!safeHref(link.href))
        ctx.addIssue({ code: 'custom', message: 'Unsafe link target', path: ['href'] });
    }),
]);

const BlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), children: z.array(InlineSchema).max(512) }).strict(),
  z
    .object({
      type: z.literal('heading'),
      level: z.number().int().min(1).max(6),
      children: z.array(InlineSchema).max(512),
    })
    .strict(),
  z
    .object({
      type: z.literal('list'),
      ordered: z.boolean(),
      start: z.number().int().min(1).max(1_000_000),
      items: z
        .array(
          z
            .object({ checked: z.boolean().nullable(), children: z.array(InlineSchema).max(512) })
            .strict()
        )
        .min(1)
        .max(EDITOR_DOCUMENT_MAX_LIST_ITEMS),
    })
    .strict(),
  z
    .object({
      type: z.literal('codeBlock'),
      language: z
        .string()
        .max(32)
        .regex(/^[a-z0-9+#.-]*$/),
      text: z.string().max(12_000),
    })
    .strict(),
  z.object({ type: z.literal('quote'), children: z.array(InlineSchema).max(512) }).strict(),
]);

export const EditorDocumentSchema = z
  .object({ version: z.literal(1), blocks: z.array(BlockSchema).max(EDITOR_DOCUMENT_MAX_BLOCKS) })
  .strict();

export type EditorInline = z.infer<typeof InlineSchema>;
export type EditorBlock = z.infer<typeof BlockSchema>;
export type EditorDocument = z.infer<typeof EditorDocumentSchema>;

/** A link target suitable for an anchor. Rejects ignored controls and all non-web schemes. */
export function safeHref(raw: string): string | null {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: browser-ignored controls must not hide a scheme.
  const href = raw.replace(/[\u0000- \u007f-\u009f]/g, '');
  if (!href || /^[/\\]{2}/.test(href.replace(/\\/g, '/'))) return null;
  if (/^(?:https?|mailto):/i.test(href)) return href;
  return /^[a-z][a-z0-9+.-]*:/i.test(href) ? null : href;
}

function textNode(text: string, marks: EditorMark[] = []): EditorInline {
  return { type: 'text', text, marks };
}

function closeAt(input: string, token: string, from: number): number {
  for (let index = from; index < input.length; index++) {
    if (input[index] === '\\') {
      index++;
      continue;
    }
    if (input.startsWith(token, index)) return index;
  }
  return -1;
}

function linkTargetEnd(input: string, from: number): number {
  let depth = 1;
  for (let index = from; index < input.length; index++) {
    if (input[index] === '\\') {
      index++;
      continue;
    }
    if (input[index] === '(') depth++;
    else if (input[index] === ')' && --depth === 0) return index;
  }
  return -1;
}

function parseInline(input: string, marks: EditorMark[] = [], depth = 0): EditorInline[] {
  if (depth > 8) return input ? [textNode(input, marks)] : [];
  const nodes: EditorInline[] = [];
  let plain = '';
  const flush = () => {
    if (plain) nodes.push(textNode(plain, marks));
    plain = '';
  };

  for (let index = 0; index < input.length; ) {
    if (input[index] === '\\' && index + 1 < input.length) {
      plain += input[index + 1];
      index += 2;
      continue;
    }

    if (input.startsWith('@{', index)) {
      const end = input.indexOf('}', index + 2);
      const body = end > index ? input.slice(index + 2, end) : '';
      const separator = body.indexOf('|');
      const id = separator > 0 ? body.slice(0, separator) : '';
      const label = separator > 0 ? body.slice(separator + 1) : '';
      if (/^[\w.-]{1,64}$/.test(id) && label.length > 0 && label.length <= 120) {
        flush();
        nodes.push({ type: 'mention', id, label });
        index = end + 1;
        continue;
      }
    }

    if (input[index] === '[') {
      const labelEnd = closeAt(input, ']', index + 1);
      if (labelEnd >= 0 && input[labelEnd + 1] === '(') {
        const targetEnd = linkTargetEnd(input, labelEnd + 2);
        if (targetEnd >= 0) {
          const label = input.slice(index + 1, labelEnd);
          const href = safeHref(input.slice(labelEnd + 2, targetEnd).trim());
          flush();
          const children = parseInline(label, marks, depth + 1).flatMap((node) =>
            node.type === 'link' ? node.children : [node]
          );
          if (href) nodes.push({ type: 'link', href, children });
          else nodes.push(...children);
          index = targetEnd + 1;
          continue;
        }
      }
    }

    if (input[index] === '`') {
      const end = closeAt(input, '`', index + 1);
      if (end > index + 1) {
        flush();
        nodes.push({ type: 'code', text: input.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }

    const marker = input.startsWith('**', index)
      ? '**'
      : input.startsWith('~~', index)
        ? '~~'
        : input[index] === '*' || input[index] === '_'
          ? input[index]
          : null;
    if (marker) {
      const end = closeAt(input, marker, index + marker.length);
      if (end > index + marker.length) {
        flush();
        const mark: EditorMark = marker === '**' ? 'bold' : marker === '~~' ? 'strike' : 'italic';
        nodes.push(
          ...parseInline(input.slice(index + marker.length, end), [...marks, mark], depth + 1)
        );
        index = end + marker.length;
        continue;
      }
    }

    plain += input[index];
    index++;
  }
  flush();
  return nodes;
}

function parseListItem(
  line: string
): { ordered: boolean; start: number; checked: boolean | null; text: string } | null {
  const ordered = /^\s*(\d{1,9})[.)]\s+(.*)$/.exec(line);
  if (ordered)
    return { ordered: true, start: Number(ordered[1]), checked: null, text: ordered[2] ?? '' };
  const unordered = /^\s*[-*+]\s+(.*)$/.exec(line);
  if (!unordered) return null;
  const content = unordered[1] ?? '';
  const task = /^\[([ xX])\]\s*(.*)$/.exec(content);
  return {
    ordered: false,
    start: 1,
    checked: task ? task[1]?.toLowerCase() === 'x' : null,
    text: task ? (task[2] ?? '') : content,
  };
}

/** Parses the supported Markdown subset into a bounded, plain-data editor document. */
export function parseEditorDocument(markdown: string): EditorDocument {
  if (typeof markdown !== 'string') throw new TypeError('Editor document must be text.');
  if (markdown.length > EDITOR_DOCUMENT_MAX_LENGTH)
    throw new RangeError('Editor document is too large.');
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: EditorBlock[] = [];
  const paragraph: string[] = [];
  const flushParagraph = () => {
    const content = paragraph.splice(0).join('\n').trim();
    if (content) blocks.push({ type: 'paragraph', children: parseInline(content) });
  };

  for (let index = 0; index < lines.length; ) {
    const line = lines[index] ?? '';
    if (!line.trim()) {
      flushParagraph();
      index++;
      continue;
    }
    const fence = /^\s*```([a-zA-Z0-9+#.-]{0,32})\s*$/.exec(line);
    if (fence) {
      flushParagraph();
      const code: string[] = [];
      index++;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index] ?? ''))
        code.push(lines[index++] ?? '');
      if (index < lines.length) index++;
      blocks.push({
        type: 'codeBlock',
        language: (fence[1] ?? '').toLowerCase(),
        text: code.join('\n'),
      });
      continue;
    }
    const heading = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({
        type: 'heading',
        level: heading[1]?.length ?? 1,
        children: parseInline(heading[2] ?? ''),
      });
      index++;
      continue;
    }
    const listItem = parseListItem(line);
    if (listItem) {
      flushParagraph();
      const items: Extract<EditorBlock, { type: 'list' }>['items'] = [];
      const ordered = listItem.ordered;
      const start = listItem.start;
      while (index < lines.length) {
        const item = parseListItem(lines[index] ?? '');
        if (!item || item.ordered !== ordered) break;
        items.push({ checked: item.checked, children: parseInline(item.text) });
        index++;
      }
      blocks.push({ type: 'list', ordered, start, items });
      continue;
    }
    if (/^\s{0,3}> ?/.test(line)) {
      flushParagraph();
      const quote: string[] = [];
      while (index < lines.length && /^\s{0,3}> ?/.test(lines[index] ?? '')) {
        quote.push((lines[index] ?? '').replace(/^\s{0,3}> ?/, ''));
        index++;
      }
      blocks.push({ type: 'quote', children: parseInline(quote.join('\n')) });
      continue;
    }
    paragraph.push(line);
    index++;
  }
  flushParagraph();
  return EditorDocumentSchema.parse({ version: 1, blocks });
}

function escapeText(text: string): string {
  return [...text]
    .map((character) =>
      ['\\', '*', '_', '~', '`', '[', ']', '@'].includes(character) ? `\\${character}` : character
    )
    .join('');
}

function serializeInline(nodes: readonly EditorInline[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'code') return `\`${node.text.replace(/`/g, '\\`')}\``;
      if (node.type === 'mention') return `@{${node.id}|${node.label.replace(/[{}]/g, '')}}`;
      if (node.type === 'link')
        return `[${serializeInline(node.children)}](${safeHref(node.href) ?? ''})`;
      let text = escapeText(node.text);
      for (const mark of node.marks) {
        const marker = mark === 'bold' ? '**' : mark === 'italic' ? '*' : '~~';
        text = `${marker}${text}${marker}`;
      }
      return text;
    })
    .join('');
}

/** Serializes a validated document to canonical safe Markdown. */
export function serializeEditorDocument(input: unknown): string {
  const document = EditorDocumentSchema.parse(input);
  const markdown = document.blocks
    .map((block) => {
      switch (block.type) {
        case 'paragraph':
          return serializeInline(block.children);
        case 'heading':
          return `${'#'.repeat(block.level)} ${serializeInline(block.children)}`;
        case 'quote':
          return `> ${serializeInline(block.children)}`;
        case 'codeBlock':
          return `\`\`\`${block.language}\n${block.text}\n\`\`\``;
        case 'list':
          return block.items
            .map((item, index) => {
              const prefix = block.ordered
                ? `${block.start + index}. `
                : item.checked === null
                  ? '- '
                  : `- [${item.checked ? 'x' : ' '}] `;
              return `${prefix}${serializeInline(item.children)}`;
            })
            .join('\n');
      }
      return '';
    })
    .join('\n\n');
  if (markdown.length > EDITOR_DOCUMENT_MAX_LENGTH)
    throw new RangeError('Serialized editor document is too large.');
  return markdown;
}
