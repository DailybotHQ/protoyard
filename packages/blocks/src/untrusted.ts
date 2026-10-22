import { BLOCK_LIMITS, type BlockLimits } from './limits.ts';
import { type Block, type BlockParseResult, safeParseBlocks, toJsonPath } from './schema/index.ts';
import { base64DecodedBytes } from './schema/media.ts';

export type UntrustedBlockIssue = {
  code:
    | 'invalid-input'
    | 'too-large'
    | 'too-deep'
    | 'too-many'
    | 'unsafe-key'
    | 'invalid-json'
    | 'invalid-blocks';
  path: (string | number)[];
  jsonPath: string;
  message: string;
  fix: string;
};

export type UntrustedBlocksResult =
  | { success: true; blocks: Block[]; issues: [] }
  | { success: false; blocks: null; issues: UntrustedBlockIssue[] };

type CloneResult = { ok: true; value: unknown } | { ok: false; issue: UntrustedBlockIssue };

function stripUnsafe(value: string, allowNewlines: boolean, allowTabs: boolean): string {
  // Unicode line/paragraph separators become a real line break where one is
  // allowed, and a space in one-line fields.
  const normalized = value
    .replace(/\r\n/g, '\n')
    .replace(/[\u2028\u2029]/g, allowNewlines ? '\n' : ' ');
  return [...normalized]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      if (code === 0x0a && allowNewlines) return true;
      if (code === 0x09 && allowTabs) return true;
      return !(
        code <= 0x1f ||
        (code >= 0x7f && code <= 0x9f) ||
        code === 0x061c ||
        code === 0x200b ||
        code === 0x200e ||
        code === 0x200f ||
        (code >= 0x202a && code <= 0x202e) ||
        code === 0x2060 ||
        (code >= 0x2066 && code <= 0x2069) ||
        code === 0xfeff
      );
    })
    .join('');
}

function issue(
  code: UntrustedBlockIssue['code'],
  path: (string | number)[],
  message: string,
  fix: string
): UntrustedBlockIssue {
  return { code, path, jsonPath: toJsonPath(path), message, fix };
}

function fatal(
  code: UntrustedBlockIssue['code'],
  message: string,
  fix: string
): UntrustedBlockIssue {
  return issue(code, [], message, fix);
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function cappedLimits(limits: Partial<BlockLimits>): BlockLimits {
  return Object.fromEntries(
    Object.entries(BLOCK_LIMITS).map(([key, maximum]) => {
      const requested = limits[key as keyof BlockLimits];
      const value =
        typeof requested === 'number' && Number.isFinite(requested)
          ? Math.floor(Math.max(0, requested))
          : maximum;
      return [key, Math.min(maximum, value)];
    })
  ) as BlockLimits;
}

const MULTILINE_KEYS = new Set([
  'markdown',
  'quote',
  'body',
  'prompt',
  'explanation',
  'description',
]);
const TEXT_VALUE_KEYS = new Set([
  'text',
  'markdown',
  'quote',
  'body',
  'label',
  'title',
  'caption',
  'cite',
  'role',
  'eyebrow',
  'subtitle',
  'source',
  'time',
  'value',
  'question',
  'prompt',
  'explanation',
  'description',
  'name',
  'filename',
  'openLabel',
  'successMessage',
  'submitLabel',
  'help',
  'placeholder',
]);
const DATA_URI = /^data:[^,]*;base64,([A-Za-z0-9+/]*={0,2})$/;

function sanitizeJson(input: unknown, limits: BlockLimits): CloneResult {
  const ancestors = new WeakSet<object>();
  let visited = 0;
  const visit = (
    current: unknown,
    path: (string | number)[],
    depth: number,
    textContext: 'plain' | 'markdown' | 'code' = 'plain',
    listItem = false
  ): CloneResult => {
    visited += 1;
    if (visited > limits.maxBytes) {
      return {
        ok: false,
        issue: fatal(
          'too-large',
          'Block input contains too many JSON values.',
          `Keep the serialized input at or below ${limits.maxBytes} UTF-8 bytes.`
        ),
      };
    }
    if (depth > limits.maxDepth) {
      return {
        ok: false,
        issue: issue(
          'too-deep',
          path,
          `Block JSON exceeds the maximum nesting depth of ${limits.maxDepth}.`,
          `Flatten the document so blocks are at most ${limits.maxDepth} JSON levels deep.`
        ),
      };
    }
    if (typeof current === 'string') {
      if (current.length > limits.maxBytes || utf8Length(current) > limits.maxBytes) {
        return {
          ok: false,
          issue: issue(
            'too-large',
            path,
            `A block value exceeds the ${limits.maxBytes}-byte input limit.`,
            `Keep the input at or below ${limits.maxBytes} UTF-8 bytes.`
          ),
        };
      }
      const clean = stripUnsafe(
        current,
        textContext === 'markdown' || textContext === 'code',
        textContext === 'code'
      );
      if (
        TEXT_VALUE_KEYS.has(String(path.at(-1) ?? '')) &&
        !clean.startsWith('data:') &&
        [...clean].length > limits.maxTextLength
      ) {
        return {
          ok: false,
          issue: issue(
            'too-large',
            path,
            `Text exceeds the ${limits.maxTextLength}-character guard limit.`,
            `Shorten this text to at most ${limits.maxTextLength} characters.`
          ),
        };
      }
      return { ok: true, value: clean };
    }
    if (current === null || typeof current === 'boolean' || typeof current === 'number') {
      return { ok: true, value: current };
    }
    if (Array.isArray(current)) {
      if (ancestors.has(current)) {
        return {
          ok: false,
          issue: fatal(
            'invalid-input',
            'Block input must be acyclic JSON data.',
            'Pass JSON text or a plain, acyclic JSON value.'
          ),
        };
      }
      ancestors.add(current);
      const output: unknown[] = [];
      for (let index = 0; index < current.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
        if (!descriptor || !('value' in descriptor)) {
          return {
            ok: false,
            issue: issue(
              'invalid-input',
              [...path, index],
              'Block arrays must contain plain JSON values.',
              'Remove holes, accessors and non-data properties.'
            ),
          };
        }
        const child = visit(descriptor.value, [...path, index], depth + 1, textContext, listItem);
        if (!child.ok) return child;
        output.push(child.value);
      }
      ancestors.delete(current);
      return { ok: true, value: output };
    }
    if (typeof current !== 'object') {
      return {
        ok: false,
        issue: fatal(
          'invalid-input',
          'Input must be JSON text or plain JSON data.',
          'Provide a block array or its JSON text.'
        ),
      };
    }
    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) {
      return {
        ok: false,
        issue: fatal(
          'invalid-input',
          'Block objects must be plain JSON data.',
          'Remove custom prototypes and pass plain JSON objects.'
        ),
      };
    }
    if (ancestors.has(current)) {
      return {
        ok: false,
        issue: fatal(
          'invalid-input',
          'Block input must be acyclic JSON data.',
          'Pass JSON text or a plain, acyclic JSON value.'
        ),
      };
    }
    ancestors.add(current);
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    const record = current as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (key === '__proto__' || key === 'constructor') {
        return {
          ok: false,
          issue: issue(
            'unsafe-key',
            [...path, key],
            `Block input contains the unsafe key "${key}".`,
            'Remove prototype-related keys from the input.'
          ),
        };
      }
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || !('value' in descriptor)) {
        return {
          ok: false,
          issue: issue(
            'invalid-input',
            [...path, key],
            'Block objects must contain plain JSON values.',
            'Remove getters and setters from the input.'
          ),
        };
      }
      const safeKey = stripUnsafe(key, false, false);
      if (safeKey === '__proto__' || safeKey === 'constructor') {
        return {
          ok: false,
          issue: issue(
            'unsafe-key',
            [...path, safeKey],
            `Block input contains the unsafe key "${safeKey}" after sanitization.`,
            'Remove prototype-related keys from the input.'
          ),
        };
      }
      if (Object.hasOwn(output, safeKey)) {
        return {
          ok: false,
          issue: issue(
            'invalid-input',
            [...path, key],
            'Sanitization produced duplicate object keys.',
            'Rename keys so they remain unique after control characters are removed.'
          ),
        };
      }
      const value = descriptor.value;
      const nextContext =
        key === 'code' && record.type === 'code'
          ? 'code'
          : MULTILINE_KEYS.has(key) || (listItem && key === 'text')
            ? 'markdown'
            : 'plain';
      const child = visit(
        value,
        [...path, safeKey],
        depth + 1,
        nextContext,
        key === 'items' && record.type === 'list'
      );
      if (!child.ok) return child;
      output[safeKey] = child.value;
    }
    ancestors.delete(current);
    return { ok: true, value: output };
  };
  return visit(input, [], 0);
}

function checkJsonDepth(text: string, maxDepth: number): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const character of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
    } else if (character === '"') inString = true;
    else if (character === '{' || character === '[') {
      depth += 1;
      if (depth > maxDepth) return false;
    } else if (character === '}' || character === ']') depth -= 1;
  }
  return true;
}

function checkBlockCounts(input: unknown, limits: BlockLimits): UntrustedBlockIssue | null {
  if (!Array.isArray(input)) return null;
  let count = 0;
  const walk = (
    blocks: unknown[],
    path: (string | number)[],
    containerDepth: number
  ): UntrustedBlockIssue | null => {
    for (const [index, value] of blocks.entries()) {
      const blockPath = [...path, index];
      count += 1;
      if (count > limits.maxBlocks) {
        return issue(
          'too-many',
          blockPath,
          `Document contains more than ${limits.maxBlocks} blocks.`,
          `Reduce the document to at most ${limits.maxBlocks} blocks.`
        );
      }
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const block = value as Record<string, unknown>;
      if (
        block.type === 'flow' &&
        Array.isArray(block.nodes) &&
        block.nodes.length > limits.flowNodes
      ) {
        return issue(
          'too-many',
          [...blockPath, 'nodes'],
          `Flow has ${block.nodes.length} nodes; the limit is ${limits.flowNodes}.`,
          `Reduce the flow to at most ${limits.flowNodes} nodes.`
        );
      }
      if (block.type === 'tree' && Array.isArray(block.nodes)) {
        if (block.nodes.length > limits.treeNodes) {
          return issue(
            'too-many',
            [...blockPath, 'nodes'],
            `Tree has ${block.nodes.length} nodes; the limit is ${limits.treeNodes}.`,
            `Reduce the tree to at most ${limits.treeNodes} nodes.`
          );
        }
        const parents = new Map<string, string | null>();
        for (const node of block.nodes) {
          if (!node || typeof node !== 'object') continue;
          const item = node as Record<string, unknown>;
          if (
            typeof item.id === 'string' &&
            (typeof item.parentId === 'string' || item.parentId === null)
          ) {
            parents.set(item.id, item.parentId);
          }
        }
        for (const [nodeIndex, node] of block.nodes.entries()) {
          if (
            !node ||
            typeof node !== 'object' ||
            typeof (node as Record<string, unknown>).id !== 'string'
          )
            continue;
          const item = node as Record<string, unknown>;
          let depth = 1;
          let parentId = typeof item.parentId === 'string' ? item.parentId : null;
          const seen = new Set([item.id as string]);
          while (parentId !== null && parents.has(parentId) && !seen.has(parentId)) {
            seen.add(parentId);
            depth += 1;
            const parent = parents.get(parentId);
            parentId = typeof parent === 'string' ? parent : null;
          }
          if (depth > limits.treeDepth) {
            return issue(
              'too-deep',
              [...blockPath, 'nodes', nodeIndex],
              `Tree depth exceeds ${limits.treeDepth}.`,
              `Flatten this tree to at most ${limits.treeDepth} levels.`
            );
          }
        }
      }
      if (block.type === 'board' && Array.isArray(block.columns)) {
        if (block.columns.length > limits.boardColumns) {
          return issue(
            'too-many',
            [...blockPath, 'columns'],
            `Board has ${block.columns.length} columns; the limit is ${limits.boardColumns}.`,
            `Reduce the board to at most ${limits.boardColumns} columns.`
          );
        }
        for (const [columnIndex, column] of block.columns.entries()) {
          if (
            column &&
            typeof column === 'object' &&
            Array.isArray((column as Record<string, unknown>).cards) &&
            (column as { cards: unknown[] }).cards.length > limits.boardCardsPerColumn
          ) {
            return issue(
              'too-many',
              [...blockPath, 'columns', columnIndex, 'cards'],
              `Board column exceeds ${limits.boardCardsPerColumn} cards.`,
              `Reduce this column to at most ${limits.boardCardsPerColumn} cards.`
            );
          }
        }
      }
      if (
        block.type === 'terminal' &&
        Array.isArray(block.lines) &&
        block.lines.length > limits.terminalLines
      ) {
        return issue(
          'too-many',
          [...blockPath, 'lines'],
          `Terminal has ${block.lines.length} lines; the limit is ${limits.terminalLines}.`,
          `Reduce the terminal to at most ${limits.terminalLines} lines.`
        );
      }
      if (block.type === 'table' && Array.isArray(block.columns) && Array.isArray(block.rows)) {
        const cells = block.columns.length * block.rows.length;
        if (cells > limits.maxTableCells) {
          return issue(
            'too-many',
            [...blockPath, 'rows'],
            `Table contains ${cells} cells; the limit is ${limits.maxTableCells}.`,
            `Reduce table rows and columns to at most ${limits.maxTableCells} cells.`
          );
        }
      }
      if (block.type === 'columns' || block.type === 'tabs' || block.type === 'reveal') {
        if (containerDepth + 1 > limits.maxContainerDepth) {
          return issue(
            'too-deep',
            blockPath,
            `Block containers nest more than ${limits.maxContainerDepth} deep.`,
            `Flatten the containers to at most ${limits.maxContainerDepth} levels.`
          );
        }
      }
      if (block.type === 'columns' && Array.isArray(block.columns)) {
        for (const [columnIndex, column] of block.columns.entries()) {
          if (!Array.isArray(column)) continue;
          const childIssue = walk(
            column,
            [...blockPath, 'columns', columnIndex],
            containerDepth + 1
          );
          if (childIssue) return childIssue;
        }
      } else if (block.type === 'tabs' && Array.isArray(block.panels)) {
        for (const [panelIndex, panel] of block.panels.entries()) {
          if (
            !panel ||
            typeof panel !== 'object' ||
            !Array.isArray((panel as Record<string, unknown>).blocks)
          )
            continue;
          const childIssue = walk(
            (panel as { blocks: unknown[] }).blocks,
            [...blockPath, 'panels', panelIndex, 'blocks'],
            containerDepth + 1
          );
          if (childIssue) return childIssue;
        }
      } else if (block.type === 'reveal' && Array.isArray(block.blocks)) {
        const childIssue = walk(block.blocks, [...blockPath, 'blocks'], containerDepth + 1);
        if (childIssue) return childIssue;
      }
    }
    return null;
  };
  return walk(input, [], 0);
}

function checkDataUris(input: unknown, limits: BlockLimits): UntrustedBlockIssue | null {
  let total = 0;
  const walk = (value: unknown, path: (string | number)[]): UntrustedBlockIssue | null => {
    if (typeof value === 'string') {
      const match = DATA_URI.exec(value);
      if (!match) return null;
      const bytes = base64DecodedBytes(match[1] ?? '');
      if (bytes > limits.maxDataUriBytes) {
        return issue(
          'too-large',
          path,
          `Embedded media is ${bytes} bytes; the limit is ${limits.maxDataUriBytes}.`,
          `Use a data URI at or below ${limits.maxDataUriBytes} decoded bytes.`
        );
      }
      total += bytes;
      if (total > limits.maxDocumentDataUriBytes) {
        return issue(
          'too-large',
          path,
          `Embedded media totals more than ${limits.maxDocumentDataUriBytes} bytes per document.`,
          `Reduce the document's embedded media to at most ${limits.maxDocumentDataUriBytes} decoded bytes.`
        );
      }
      return null;
    }
    if (Array.isArray(value)) {
      for (const [index, child] of value.entries()) {
        const found = walk(child, [...path, index]);
        if (found) return found;
      }
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        const found = walk(child, [...path, key]);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(input, []);
}

/** Sanitize and validate block documents before a kind runtime uses them. */
export function parseUntrustedBlocks(
  input: unknown,
  limits: Partial<BlockLimits> = {}
): UntrustedBlocksResult {
  const caps = cappedLimits(limits);
  try {
    let parsed: unknown = input;
    if (typeof input === 'string') {
      if (utf8Length(input) > caps.maxBytes) {
        return {
          success: false,
          blocks: null,
          issues: [
            fatal(
              'too-large',
              'Block input exceeds the byte limit.',
              `Keep the input at or below ${caps.maxBytes} UTF-8 bytes.`
            ),
          ],
        };
      }
      if (!checkJsonDepth(input, caps.maxDepth)) {
        return {
          success: false,
          blocks: null,
          issues: [
            fatal(
              'too-deep',
              'Block JSON exceeds the maximum nesting depth.',
              `Flatten the document so it is at most ${caps.maxDepth} JSON levels deep.`
            ),
          ],
        };
      }
      try {
        parsed = JSON.parse(input) as unknown;
      } catch {
        return {
          success: false,
          blocks: null,
          issues: [
            fatal(
              'invalid-json',
              'Block input is not valid JSON.',
              'Fix the JSON syntax and try again.'
            ),
          ],
        };
      }
    }
    const safe = sanitizeJson(parsed, caps);
    if (!safe.ok) return { success: false, blocks: null, issues: [safe.issue] };
    const serialized = JSON.stringify(safe.value);
    if (serialized === undefined || utf8Length(serialized) > caps.maxBytes) {
      return {
        success: false,
        blocks: null,
        issues: [
          fatal(
            'too-large',
            'Block input exceeds the byte limit.',
            `Keep the input at or below ${caps.maxBytes} UTF-8 bytes.`
          ),
        ],
      };
    }
    if (!Array.isArray(safe.value)) {
      return {
        success: false,
        blocks: null,
        issues: [
          fatal(
            'invalid-input',
            'Block input must be an array.',
            'Provide a block list or its JSON text.'
          ),
        ],
      };
    }
    const countIssue = checkBlockCounts(safe.value, caps);
    if (countIssue) return { success: false, blocks: null, issues: [countIssue] };
    const mediaIssue = checkDataUris(safe.value, caps);
    if (mediaIssue) return { success: false, blocks: null, issues: [mediaIssue] };
    const result: BlockParseResult<Block[]> = safeParseBlocks(safe.value);
    if (!result.success) {
      return {
        success: false,
        blocks: null,
        issues: result.issues.map((problem) =>
          issue(
            'invalid-blocks',
            problem.path,
            problem.message,
            'Correct this value to match the block schema, then try again.'
          )
        ),
      };
    }
    return { success: true, blocks: result.data, issues: [] };
  } catch {
    return {
      success: false,
      blocks: null,
      issues: [
        fatal(
          'invalid-input',
          'Block input could not be safely loaded.',
          'Provide plain JSON data that matches the block schema.'
        ),
      ],
    };
  }
}
