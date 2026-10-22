import { MESSAGE_LIMITS } from './limits.ts';
import {
  type ChatMessage,
  ChatMessageSchema,
  MESSAGE_BLOCK_TYPES,
  MESSAGE_FORMAT,
  MESSAGE_FORMAT_PREFIX,
  type MessageBlock,
  textIssue,
} from './schema.ts';

export type MessageIssueCode =
  | 'invalid-json'
  | 'invalid-input'
  | 'too-large'
  | 'too-deep'
  | 'too-many'
  | 'unsafe-key'
  | 'unsupported-version'
  | 'invalid-message';

export interface MessageIssue {
  code: MessageIssueCode;
  path: (string | number)[];
  /** `$["blocks"][2]["url"]` */
  jsonPath: string;
  message: string;
}

/** A block this version does not know, replaced by a plain text block. */
export interface DegradedBlock {
  index: number;
  originalType: string;
}

export type ChatMessageResult =
  | { success: true; message: ChatMessage; degraded: DegradedBlock[]; issues: [] }
  | { success: false; message: null; degraded: []; issues: MessageIssue[] };

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const KNOWN = new Set<string>(MESSAGE_BLOCK_TYPES);

function jsonPath(path: readonly (string | number)[]): string {
  return path.reduce<string>(
    (out, segment) => `${out}[${typeof segment === 'number' ? segment : JSON.stringify(segment)}]`,
    '$'
  );
}

function issue(code: MessageIssueCode, path: (string | number)[], message: string): MessageIssue {
  return { code, path, jsonPath: jsonPath(path), message };
}

function fail(issues: MessageIssue[]): ChatMessageResult {
  return { success: false, message: null, degraded: [], issues };
}

/** Plain JSON only, within depth, without prototype keys; returns the first problem. */
function structureIssue(value: unknown): MessageIssue | null {
  const stack: { value: unknown; path: (string | number)[]; depth: number }[] = [
    { value, path: [], depth: 0 },
  ];
  const seen = new Set<object>();
  while (stack.length) {
    const item = stack.pop() as (typeof stack)[number];
    const current = item.value;
    if (current === null || ['string', 'number', 'boolean'].includes(typeof current)) {
      if (typeof current === 'number' && !Number.isFinite(current)) {
        return issue('invalid-input', item.path, 'Numbers must be finite.');
      }
      continue;
    }
    if (typeof current !== 'object') {
      return issue(
        'invalid-input',
        item.path,
        `A message is plain JSON; found a ${typeof current}.`
      );
    }
    if (item.depth >= MESSAGE_LIMITS.maxDepth) {
      return issue(
        'too-deep',
        item.path,
        `The message nests deeper than ${MESSAGE_LIMITS.maxDepth} levels.`
      );
    }
    if (seen.has(current))
      return issue('invalid-input', item.path, 'The message contains a cycle.');
    seen.add(current);
    if (Array.isArray(current)) {
      current.forEach((child, index) => {
        stack.push({ value: child, path: [...item.path, index], depth: item.depth + 1 });
      });
      continue;
    }
    const proto = Object.getPrototypeOf(current);
    if (proto !== Object.prototype && proto !== null) {
      return issue('invalid-input', item.path, 'A message is plain JSON objects and arrays only.');
    }
    for (const key of Object.keys(current)) {
      if (UNSAFE_KEYS.has(key))
        return issue('unsafe-key', [...item.path, key], `The key "${key}" is not allowed.`);
      stack.push({
        value: (current as Record<string, unknown>)[key],
        path: [...item.path, key],
        depth: item.depth + 1,
      });
    }
  }
  return null;
}

/** The plain text an unknown block becomes: its own safe `fallback`, else a notice. */
function fallbackText(block: Record<string, unknown>, type: string): string {
  const own = block.fallback;
  if (
    typeof own === 'string' &&
    own.length > 0 &&
    own.length <= MESSAGE_LIMITS.maxLabelLength &&
    !textIssue(own)
  ) {
    return own;
  }
  const shown = type.length > 40 ? `${type.slice(0, 40)}…` : type;
  // The type is untrusted too: name it only when it is itself safe text.
  if (textIssue(shown) || /["<>]/.test(shown))
    return 'This message has content this app cannot show.';
  return `This message has content this app cannot show ("${shown}").`;
}

/**
 * Validates an untrusted chat message (a value, or JSON text). In order: JSON
 * parsing, the byte budget, plain-JSON structure (depth, prototype keys,
 * cycles), the format version, the block budget, then every block. A block
 * whose `type` this version does not know becomes a plain text block
 * (listed in `degraded`); an invalid known block, an unsafe URL or markup in
 * any string rejects the message with path-addressed issues. Never throws.
 */
export function parseChatMessage(input: unknown): ChatMessageResult {
  let value = input;
  if (typeof input === 'string') {
    if (new TextEncoder().encode(input).length > MESSAGE_LIMITS.maxBytes) {
      return fail([
        issue('too-large', [], `The message is larger than ${MESSAGE_LIMITS.maxBytes} bytes.`),
      ]);
    }
    try {
      value = JSON.parse(input);
    } catch {
      return fail([issue('invalid-json', [], 'The message is not valid JSON.')]);
    }
  }
  const structural = structureIssue(value);
  if (structural) return fail([structural]);
  if (new TextEncoder().encode(JSON.stringify(value)).length > MESSAGE_LIMITS.maxBytes) {
    return fail([
      issue('too-large', [], `The message is larger than ${MESSAGE_LIMITS.maxBytes} bytes.`),
    ]);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return fail([issue('invalid-input', [], 'A message is an object with "format" and "blocks".')]);
  }
  const record = value as Record<string, unknown>;
  const format = record.format;
  if (
    typeof format === 'string' &&
    format.startsWith(MESSAGE_FORMAT_PREFIX) &&
    format !== MESSAGE_FORMAT
  ) {
    return fail([
      issue(
        'unsupported-version',
        ['format'],
        `Message format "${format.slice(0, 40)}" needs a newer Protoyard (this version reads ${MESSAGE_FORMAT}).`
      ),
    ]);
  }
  const blocks = record.blocks;
  if (Array.isArray(blocks) && blocks.length > MESSAGE_LIMITS.maxBlocks) {
    return fail([
      issue('too-many', ['blocks'], `A message has at most ${MESSAGE_LIMITS.maxBlocks} blocks.`),
    ]);
  }

  const degraded: DegradedBlock[] = [];
  const candidate = Array.isArray(blocks)
    ? {
        ...record,
        blocks: blocks.map((block, index) => {
          if (block === null || typeof block !== 'object' || Array.isArray(block)) return block;
          const type = (block as Record<string, unknown>).type;
          if (typeof type !== 'string' || KNOWN.has(type)) return block;
          degraded.push({ index, originalType: type });
          return {
            type: 'text',
            format: 'plain',
            text: fallbackText(block as Record<string, unknown>, type),
            replaces:
              type.length > MESSAGE_LIMITS.maxLabelLength || textIssue(type) ? 'unknown' : type,
          };
        }),
      }
    : record;

  const parsed = ChatMessageSchema.safeParse(candidate);
  if (!parsed.success) {
    return fail(
      parsed.error.issues.map((zodIssue) =>
        issue('invalid-message', zodIssue.path as (string | number)[], zodIssue.message)
      )
    );
  }
  return { success: true, message: parsed.data, degraded, issues: [] };
}

function blockText(block: MessageBlock): string[] {
  switch (block.type) {
    case 'text':
      return [block.text];
    case 'buttons':
      return [block.buttons.map((button) => `[${button.label}]`).join(' ')];
    case 'select':
      return [
        block.label ?? block.placeholder,
        ...block.options.map((option) => `- ${option.label}`),
      ];
    case 'form':
      return [block.title, ...block.fields.map((field) => `- ${field.label}`)];
    case 'table': {
      const lines = block.title ? [block.title] : [];
      lines.push(block.columns.map((column) => column.header).join(' | '));
      for (const row of block.rows) {
        lines.push(block.columns.map((column) => String(row[column.key] ?? '')).join(' | '));
      }
      return lines;
    }
    case 'link_preview':
      return [[block.title, block.url].filter(Boolean).join(' — ')];
  }
}

/**
 * A plain-text rendering of a parsed message, for notifications, previews,
 * transcripts and clients that show no blocks. Markdown stays as written.
 */
export function messagePlainText(message: ChatMessage): string {
  const lines = message.blocks.flatMap(blockText);
  for (const attachment of message.attachments) lines.push(`Attachment: ${attachment.name}`);
  return lines.join('\n');
}
