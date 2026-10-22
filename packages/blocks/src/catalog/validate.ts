import {
  BLOCK_TYPES,
  type BlockIssue,
  type BlockType,
  safeParseBlock,
  safeParseBlocks,
  toJsonPath,
} from '../schema/index.ts';
import { BLOCK_CATALOG } from './entries.ts';
import type {
  BlockAuthoringDiagnostic,
  BlockAuthoringValidation,
  BlockDiagnosticPath,
} from './types.ts';

function prefixPath(
  prefix: readonly BlockDiagnosticPath[],
  issue: BlockIssue
): BlockAuthoringDiagnostic {
  const path = [...prefix, ...issue.path] as BlockDiagnosticPath[];
  return {
    code: diagnosticCode(issue.message),
    path,
    jsonPath: toJsonPath(path),
    message: issue.message,
    hint: diagnosticHint(issue.message, path),
  };
}

function diagnosticCode(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('required') || lower.includes('expected')) return 'invalid-type';
  if (lower.includes('unrecognized') || lower.includes('unexpected')) return 'unknown-key';
  if (lower.includes('unique') || lower.includes('duplicate')) return 'duplicate-id';
  if (lower.includes('href') || lower.includes('link')) return 'unsafe-link';
  if (lower.includes('avatar') || lower.includes('image') || lower.includes('video')) {
    return 'unsafe-media';
  }
  if (lower.includes('nest') || lower.includes('deep')) return 'nesting-limit';
  if (lower.includes('at most') || lower.includes('too big') || lower.includes('max')) {
    return 'limit';
  }
  return 'invalid';
}

function diagnosticHint(message: string, path: readonly BlockDiagnosticPath[]): string {
  const code = diagnosticCode(message);
  const leaf = path.length ? String(path[path.length - 1]) : 'block';
  switch (code) {
    case 'unknown-key':
      return 'Remove unknown keys. Blocks reject style, class, html and any extra field.';
    case 'duplicate-id':
      return 'Give each interactive or deep-linked block a unique id across the whole list.';
    case 'unsafe-link':
      return 'Use http(s), mailto, a #anchor or a relative path. javascript: and data: links are refused.';
    case 'unsafe-media':
      return 'Use avatar:av-001…175, a raster data URI, or a relative media path. No remote https or SVG.';
    case 'nesting-limit':
      return 'Flatten containers. columns, tabs and reveal nest at most 3 deep.';
    case 'limit':
      return `Reduce ${leaf} to fit the published block caps in BLOCK_CATALOG / BLOCK_CONTENT_LIMITS.`;
    case 'invalid-type':
      return 'Set the required fields for this block type. See BLOCK_CATALOG[type].exampleMinimal.';
    default:
      return 'Compare the value to BLOCK_CATALOG for this type (useWhen, limits and examples).';
  }
}

/**
 * Validate untrusted block author input and return path-addressed repair
 * guidance (`jsonPath` + `hint`), matching blueprint authoring diagnostics.
 *
 * Accepts one block object or an array of blocks.
 */
export function validateBlocksForAuthoring(input: unknown): BlockAuthoringValidation {
  if (input === null || input === undefined) {
    return {
      valid: false,
      diagnostics: [
        {
          code: 'invalid-type',
          path: [],
          jsonPath: '$',
          message: 'Expected a block or a list of blocks',
          hint: 'Pass one block object or an array. See BLOCK_CATALOG for examples.',
        },
      ],
    };
  }

  if (Array.isArray(input)) {
    const result = safeParseBlocks(input);
    if (result.success) return { valid: true, diagnostics: [] };
    return {
      valid: false,
      diagnostics: result.issues.map((issue) => prefixPath([], issue)),
    };
  }

  if (typeof input === 'object') {
    const type = (input as { type?: unknown }).type;
    if (typeof type === 'string' && !(BLOCK_TYPES as readonly string[]).includes(type)) {
      return {
        valid: false,
        diagnostics: [
          {
            code: 'unknown-type',
            path: ['type'],
            jsonPath: toJsonPath(['type']),
            message: `Unknown block type "${type}"`,
            hint: `Use one of: ${BLOCK_TYPES.join(', ')}.`,
          },
        ],
      };
    }
    const result = safeParseBlock(input);
    if (result.success) return { valid: true, diagnostics: [] };
    return {
      valid: false,
      diagnostics: result.issues.map((issue) => prefixPath([], issue)),
    };
  }

  return {
    valid: false,
    diagnostics: [
      {
        code: 'invalid-type',
        path: [],
        jsonPath: '$',
        message: 'Expected a block object or array',
        hint: 'Blocks are plain JSON objects with a type field.',
      },
    ],
  };
}

/** Markdown reference table generated from {@link BLOCK_CATALOG} (for docs/BLOCKS.md). */
export function renderBlockCatalogMarkdown(): string {
  const lines: string[] = [
    '<!-- Generated from @protoyard/blocks/catalog. Do not edit by hand. -->',
    '',
    '# Blocks reference',
    '',
    'Authoring metadata for every block type in `@protoyard/blocks`. Agents, MCP and deck lint read `BLOCK_CATALOG` and `validateBlocksForAuthoring` instead of this prose. Runtime renderers never import the catalog subpath.',
    '',
    '| Type | Family | Label | Use when | Limits |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const type of BLOCK_TYPES) {
    const row = BLOCK_CATALOG[type as BlockType];
    const use = row.useWhen[0] ?? '';
    const limits = row.limits.join('; ');
    lines.push(`| \`${row.type}\` | ${row.family} | ${row.label} | ${use} | ${limits} |`);
  }
  lines.push('');
  lines.push('## Per-type notes');
  lines.push('');
  for (const type of BLOCK_TYPES) {
    const row = BLOCK_CATALOG[type as BlockType];
    lines.push(`### \`${row.type}\` — ${row.label}`);
    lines.push('');
    lines.push(`**Family:** ${row.family}`);
    lines.push('');
    lines.push('**Use when**');
    for (const item of row.useWhen) lines.push(`- ${item}`);
    lines.push('');
    lines.push("**Don't use when**");
    for (const item of row.dontUseWhen) lines.push(`- ${item}`);
    lines.push('');
    lines.push('**Limits**');
    for (const item of row.limits) lines.push(`- ${item}`);
    lines.push('');
    lines.push(`**Accessibility:** ${row.a11y}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
