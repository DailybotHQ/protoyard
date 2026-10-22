import { PAGE_DOCUMENT_LIMITS } from './schema.ts';

/**
 * Authoring and untrusted caps for page and doc blueprints (ADR-039).
 *
 * KINDS should wire these into `packages/blueprint/src/untrusted.ts` (or a
 * content-kind branch) so paste/link/file loads refuse oversized payloads
 * before full schema parse. Document schemas already enforce the structural
 * array caps via {@link PAGE_DOCUMENT_LIMITS}; these tables add bytes, depth,
 * form-field and form-response ceilings the untrusted loader needs.
 */

/** Shared byte/depth ceilings for both page and doc JSON payloads. */
const SHARED = Object.freeze({
  /** UTF-8 JSON bytes for one page or doc body (no media data URIs expected). */
  maxBytes: 512 * 1024,
  /** JSON object/array nesting depth for the document body. */
  maxDepth: 24,
  maxTitle: PAGE_DOCUMENT_LIMITS.maxTitle,
  maxDescription: PAGE_DOCUMENT_LIMITS.maxDescription,
});

/**
 * Caps for `kind: "page"` payloads and form responses hosted on pages.
 * Structural section/block caps match {@link PAGE_DOCUMENT_LIMITS}.
 */
export const PAGE_LIMITS = Object.freeze({
  ...SHARED,
  maxSections: PAGE_DOCUMENT_LIMITS.maxSections,
  maxBlocksPerSection: PAGE_DOCUMENT_LIMITS.maxBlocksPerSection,
  maxNavItems: PAGE_DOCUMENT_LIMITS.maxNavItems,
  maxFormRefs: PAGE_DOCUMENT_LIMITS.maxFormRefs,
  /**
   * Fields on one public form block. Untrusted ceiling; `@protoyard/blocks`
   * FormBlockSchema still applies its own field max (currently 20).
   */
  maxFormFields: 32,
  /** Options on one enum/tags form field. */
  maxFieldOptions: 32,
  /** UTF-8 bytes of one form response `values` JSON object. */
  maxResponseValueBytes: 8 * 1024,
  /** Responses retained/listed per form id (IndexedDB feature table). */
  maxResponsesPerForm: 500,
});

/**
 * Caps for `kind: "doc"` payloads. Docs share form-response ceilings when a
 * form block appears in the flow.
 */
export const DOC_LIMITS = Object.freeze({
  ...SHARED,
  maxDocBlocks: PAGE_DOCUMENT_LIMITS.maxDocBlocks,
  maxTocDepth: PAGE_DOCUMENT_LIMITS.maxTocDepth,
  maxFormFields: PAGE_LIMITS.maxFormFields,
  maxFieldOptions: PAGE_LIMITS.maxFieldOptions,
  maxResponseValueBytes: PAGE_LIMITS.maxResponseValueBytes,
  maxResponsesPerForm: PAGE_LIMITS.maxResponsesPerForm,
});

export type PageLimits = { [Key in keyof typeof PAGE_LIMITS]: number };
export type DocLimits = { [Key in keyof typeof DOC_LIMITS]: number };

/** One limit violation; never throws from the check helpers. */
export interface DocumentLimitIssue {
  code:
    | 'invalid-input'
    | 'too-large'
    | 'too-deep'
    | 'too-many-sections'
    | 'too-many-blocks'
    | 'too-many-nav'
    | 'too-many-forms'
    | 'too-many-fields'
    | 'too-many-options'
    | 'too-many-responses'
    | 'response-too-large';
  path: (string | number)[];
  message: string;
  /** What KINDS / the author should change. */
  fix: string;
}

export type DocumentLimitResult =
  | { ok: true; issues: [] }
  | { ok: false; issues: DocumentLimitIssue[] };

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/** Max nesting depth of plain JSON (objects and arrays). */
export function jsonDepth(value: unknown, depth = 0): number {
  if (value === null || typeof value !== 'object') return depth;
  if (Array.isArray(value)) {
    let max = depth;
    for (const item of value) max = Math.max(max, jsonDepth(item, depth + 1));
    return max;
  }
  let max = depth;
  for (const child of Object.values(value as Record<string, unknown>)) {
    max = Math.max(max, jsonDepth(child, depth + 1));
  }
  return max;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function issue(
  code: DocumentLimitIssue['code'],
  path: (string | number)[],
  message: string,
  fix: string
): DocumentLimitIssue {
  return { code, path, message, fix };
}

function collectFormBlocks(
  blocks: unknown,
  path: (string | number)[],
  into: { path: (string | number)[]; block: Record<string, unknown> }[]
): void {
  if (!Array.isArray(blocks)) return;
  blocks.forEach((block, i) => {
    if (!isRecord(block)) return;
    const here = [...path, i];
    if (block.type === 'form') into.push({ path: here, block });
    if (block.type === 'columns' && Array.isArray(block.columns)) {
      block.columns.forEach((column, c) => {
        collectFormBlocks(column, [...here, 'columns', c], into);
      });
    } else if (block.type === 'tabs' && Array.isArray(block.panels)) {
      block.panels.forEach((panel, p) => {
        if (isRecord(panel))
          collectFormBlocks(panel.blocks, [...here, 'panels', p, 'blocks'], into);
      });
    } else if (block.type === 'reveal') {
      collectFormBlocks(block.blocks, [...here, 'blocks'], into);
    }
  });
}

function checkFormBlocks(
  forms: { path: (string | number)[]; block: Record<string, unknown> }[],
  limits: { maxFormFields: number; maxFieldOptions: number },
  issues: DocumentLimitIssue[]
): void {
  for (const { path, block } of forms) {
    const fields = block.fields;
    if (!Array.isArray(fields)) continue;
    if (fields.length > limits.maxFormFields) {
      issues.push(
        issue(
          'too-many-fields',
          [...path, 'fields'],
          `Form has ${fields.length} fields (max ${limits.maxFormFields})`,
          `Keep each form to ${limits.maxFormFields} fields or fewer.`
        )
      );
    }
    fields.forEach((field, f) => {
      if (!isRecord(field) || !Array.isArray(field.options)) return;
      if (field.options.length > limits.maxFieldOptions) {
        issues.push(
          issue(
            'too-many-options',
            [...path, 'fields', f, 'options'],
            `Field has ${field.options.length} options (max ${limits.maxFieldOptions})`,
            `Keep enum/tags options to ${limits.maxFieldOptions} or fewer.`
          )
        );
      }
    });
  }
}

function checkBytesAndDepth(
  input: unknown,
  limits: { maxBytes: number; maxDepth: number },
  issues: DocumentLimitIssue[]
): void {
  if (input === null || typeof input !== 'object') {
    issues.push(
      issue(
        'invalid-input',
        [],
        'Document body must be a JSON object',
        'Pass a page or doc payload object, not a primitive or array.'
      )
    );
    return;
  }
  let text: string;
  try {
    text = JSON.stringify(input);
  } catch {
    issues.push(
      issue(
        'invalid-input',
        [],
        'Document body is not serializable JSON',
        'Remove cycles and non-JSON values.'
      )
    );
    return;
  }
  const bytes = utf8Bytes(text);
  if (bytes > limits.maxBytes) {
    issues.push(
      issue(
        'too-large',
        [],
        `Document is ${bytes} bytes (max ${limits.maxBytes})`,
        `Keep the page/doc JSON under ${limits.maxBytes} bytes.`
      )
    );
  }
  const depth = jsonDepth(input);
  if (depth > limits.maxDepth) {
    issues.push(
      issue(
        'too-deep',
        [],
        `Document nests ${depth} levels deep (max ${limits.maxDepth})`,
        `Flatten nested data to at most ${limits.maxDepth} levels.`
      )
    );
  }
}

/**
 * Enforce {@link PAGE_LIMITS} on a raw page payload (before or after schema).
 * Does not run full zod validation — only size and count guards.
 */
export function checkPageDocumentLimits(
  input: unknown,
  limits: PageLimits = PAGE_LIMITS
): DocumentLimitResult {
  const issues: DocumentLimitIssue[] = [];
  checkBytesAndDepth(input, limits, issues);
  if (!isRecord(input)) {
    return issues.length ? { ok: false, issues } : { ok: true, issues: [] };
  }

  const sections = input.sections;
  if (Array.isArray(sections)) {
    if (sections.length > limits.maxSections) {
      issues.push(
        issue(
          'too-many-sections',
          ['sections'],
          `Page has ${sections.length} sections (max ${limits.maxSections})`,
          `Keep sections to ${limits.maxSections} or fewer.`
        )
      );
    }
    const forms: { path: (string | number)[]; block: Record<string, unknown> }[] = [];
    sections.forEach((section, s) => {
      if (!isRecord(section)) return;
      const blocks = section.blocks;
      if (Array.isArray(blocks) && blocks.length > limits.maxBlocksPerSection) {
        issues.push(
          issue(
            'too-many-blocks',
            ['sections', s, 'blocks'],
            `Section has ${blocks.length} blocks (max ${limits.maxBlocksPerSection})`,
            `Keep each section to ${limits.maxBlocksPerSection} blocks or fewer.`
          )
        );
      }
      collectFormBlocks(blocks, ['sections', s, 'blocks'], forms);
    });
    checkFormBlocks(forms, limits, issues);
  }

  if (Array.isArray(input.nav) && input.nav.length > limits.maxNavItems) {
    issues.push(
      issue(
        'too-many-nav',
        ['nav'],
        `Page has ${input.nav.length} nav items (max ${limits.maxNavItems})`,
        `Keep nav to ${limits.maxNavItems} items or fewer.`
      )
    );
  }

  if (Array.isArray(input.forms) && input.forms.length > limits.maxFormRefs) {
    issues.push(
      issue(
        'too-many-forms',
        ['forms'],
        `Page lists ${input.forms.length} form refs (max ${limits.maxFormRefs})`,
        `Keep form refs to ${limits.maxFormRefs} or fewer.`
      )
    );
  }

  return issues.length ? { ok: false, issues } : { ok: true, issues: [] };
}

/**
 * Enforce {@link DOC_LIMITS} on a raw doc payload.
 */
export function checkDocDocumentLimits(
  input: unknown,
  limits: DocLimits = DOC_LIMITS
): DocumentLimitResult {
  const issues: DocumentLimitIssue[] = [];
  checkBytesAndDepth(input, limits, issues);
  if (!isRecord(input)) {
    return issues.length ? { ok: false, issues } : { ok: true, issues: [] };
  }

  const blocks = input.blocks;
  if (Array.isArray(blocks)) {
    if (blocks.length > limits.maxDocBlocks) {
      issues.push(
        issue(
          'too-many-blocks',
          ['blocks'],
          `Doc has ${blocks.length} blocks (max ${limits.maxDocBlocks})`,
          `Keep the doc body to ${limits.maxDocBlocks} blocks or fewer.`
        )
      );
    }
    const forms: { path: (string | number)[]; block: Record<string, unknown> }[] = [];
    collectFormBlocks(blocks, ['blocks'], forms);
    checkFormBlocks(forms, limits, issues);
  }

  if (isRecord(input.toc) && typeof input.toc.depth === 'number') {
    if (input.toc.depth > limits.maxTocDepth || input.toc.depth < 2) {
      issues.push(
        issue(
          'too-many-blocks',
          ['toc', 'depth'],
          `toc.depth ${String(input.toc.depth)} is outside 2…${limits.maxTocDepth}`,
          `Set toc.depth between 2 and ${limits.maxTocDepth}.`
        )
      );
    }
  }

  return issues.length ? { ok: false, issues } : { ok: true, issues: [] };
}

/**
 * Guard one form response `values` object and a list length for a form id.
 * Used by form-response services (later task) and untrusted imports.
 */
export function checkFormResponseLimits(
  input: {
    values?: unknown;
    responseCount?: number;
  },
  limits: Pick<PageLimits, 'maxResponseValueBytes' | 'maxResponsesPerForm'> = PAGE_LIMITS
): DocumentLimitResult {
  const issues: DocumentLimitIssue[] = [];
  if (input.values !== undefined) {
    let text: string;
    try {
      text = JSON.stringify(input.values);
    } catch {
      issues.push(
        issue(
          'invalid-input',
          ['values'],
          'Form response values are not serializable JSON',
          'Use plain JSON values only.'
        )
      );
      return { ok: false, issues };
    }
    const bytes = utf8Bytes(text);
    if (bytes > limits.maxResponseValueBytes) {
      issues.push(
        issue(
          'response-too-large',
          ['values'],
          `Response values are ${bytes} bytes (max ${limits.maxResponseValueBytes})`,
          `Keep each response under ${limits.maxResponseValueBytes} bytes.`
        )
      );
    }
  }
  if (typeof input.responseCount === 'number' && input.responseCount > limits.maxResponsesPerForm) {
    issues.push(
      issue(
        'too-many-responses',
        ['responses'],
        `Form has ${input.responseCount} responses (max ${limits.maxResponsesPerForm})`,
        `Clear old responses or raise retention only with an explicit product decision.`
      )
    );
  }
  return issues.length ? { ok: false, issues } : { ok: true, issues: [] };
}

/**
 * Snapshot of numbers KINDS should copy into the blueprint untrusted loader
 * for content kinds `page` and `doc`. Not applied automatically in this task.
 */
export const UNTRUSTED_PAGE_DOC_HINT = Object.freeze({
  page: {
    maxBytes: PAGE_LIMITS.maxBytes,
    maxDepth: PAGE_LIMITS.maxDepth,
    maxSections: PAGE_LIMITS.maxSections,
    maxBlocksPerSection: PAGE_LIMITS.maxBlocksPerSection,
    maxFormFields: PAGE_LIMITS.maxFormFields,
    maxFieldOptions: PAGE_LIMITS.maxFieldOptions,
    maxResponseValueBytes: PAGE_LIMITS.maxResponseValueBytes,
    maxResponsesPerForm: PAGE_LIMITS.maxResponsesPerForm,
  },
  doc: {
    maxBytes: DOC_LIMITS.maxBytes,
    maxDepth: DOC_LIMITS.maxDepth,
    maxDocBlocks: DOC_LIMITS.maxDocBlocks,
    maxFormFields: DOC_LIMITS.maxFormFields,
    maxFieldOptions: DOC_LIMITS.maxFieldOptions,
    maxResponseValueBytes: DOC_LIMITS.maxResponseValueBytes,
    maxResponsesPerForm: DOC_LIMITS.maxResponsesPerForm,
  },
  note: 'Wire via packages/blueprint/src/untrusted.ts content-kind branch (KINDS lane).',
});
