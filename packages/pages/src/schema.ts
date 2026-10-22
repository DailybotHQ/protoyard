import { type Block, BlockIdSchema, BlockListSchema, BlockSchema } from '@protoyard/blocks';
import { z } from 'zod';

/**
 * Page and doc document schemas (ADR-039). KINDS owns the blueprint `kind`
 * discriminator and envelope; these schemas validate the payload bodies
 * `@protoyard/pages` consumes after the union is parsed.
 *
 * Bounds here are document-level. Field caps on individual blocks stay in
 * `@protoyard/blocks`. A later task may re-export them as PAGE_LIMITS /
 * DOC_LIMITS for the untrusted loader.
 */

/** Document-level caps for page and doc payloads. */
export const PAGE_DOCUMENT_LIMITS = Object.freeze({
  maxTitle: 120,
  maxDescription: 500,
  maxStyleId: 64,
  maxSections: 32,
  maxBlocksPerSection: 24,
  maxNavItems: 24,
  maxFormRefs: 16,
  maxDocBlocks: 200,
  maxTocDepth: 4,
});

const plain = (max: number) => z.string().min(1).max(max);
const optionalPlain = (max: number) => z.string().min(1).max(max).optional();

/** Theme or style preset id referenced by the document (not CSS). */
const StyleRefSchema = z
  .string()
  .min(1)
  .max(PAGE_DOCUMENT_LIMITS.maxStyleId)
  .regex(/^[a-z][a-z0-9-]*$/, 'style refs are lowercase kebab-case');

const metaFields = {
  id: BlockIdSchema,
  title: plain(PAGE_DOCUMENT_LIMITS.maxTitle),
  description: optionalPlain(PAGE_DOCUMENT_LIMITS.maxDescription),
  /** Optional theme / style preset id (for example a brand block theme). */
  style: StyleRefSchema.optional(),
} as const;

/**
 * Shared meta for page and doc documents. `id` is stable for storage namespaces
 * and deep links; it is not the blueprint slug (KINDS owns that).
 */
export const DocumentMetaSchema = z.strictObject(metaFields);
export type DocumentMeta = z.infer<typeof DocumentMetaSchema>;

/** One marketing/landing section: ordered blocks with an optional anchor. */
export const PageSectionSchema = z.strictObject({
  id: BlockIdSchema,
  /**
   * In-page hash target without `#`. Defaults to `id` when omitted.
   * Must stay unique across sections when set.
   */
  anchor: BlockIdSchema.optional(),
  /** Optional section heading for nav and print. */
  title: optionalPlain(PAGE_DOCUMENT_LIMITS.maxTitle),
  /**
   * Layout hint for hosts (hero / body / footer / cta). Renderers may ignore
   * unknown roles; keep the set small and documented.
   */
  role: z.enum(['hero', 'body', 'footer', 'cta', 'features', 'pricing', 'faq']).optional(),
  blocks: z.array(BlockSchema).max(PAGE_DOCUMENT_LIMITS.maxBlocksPerSection),
});
export type PageSection = z.infer<typeof PageSectionSchema>;

/** Top nav hash link for a single-scroll page. */
export const PageNavItemSchema = z.strictObject({
  id: BlockIdSchema,
  label: plain(80),
  /** In-page hash (`#features`) with a kebab-case id. */
  href: z
    .string()
    .min(2)
    .max(120)
    .regex(/^#[a-z][a-z0-9-]*$/, 'nav href must be a #fragment with a kebab-case id'),
});
export type PageNavItem = z.infer<typeof PageNavItemSchema>;

/**
 * Reference to a form block that lives in a section's `blocks` list. The form
 * *block schema* stays in `@protoyard/blocks`; this list only names which
 * forms the page exposes for responses UI.
 */
export const PageFormRefSchema = z.strictObject({
  /** Must match a `type: "form"` block `id` somewhere in `sections`. */
  formId: BlockIdSchema,
  /** Optional section that hosts the form (for scroll / responses panel). */
  sectionId: BlockIdSchema.optional(),
});
export type PageFormRef = z.infer<typeof PageFormRefSchema>;

function uniqueIds(
  ids: readonly string[],
  ctx: z.RefinementCtx,
  path: (string | number)[],
  what: string
): void {
  const seen = new Set<string>();
  ids.forEach((id, i) => {
    if (seen.has(id)) {
      ctx.addIssue({
        code: 'custom',
        path: [...path, i],
        message: `${what} ids must be unique (duplicate "${id}")`,
      });
    }
    seen.add(id);
  });
}

function collectFormIds(blocks: readonly Block[], into: Set<string>): void {
  for (const block of blocks) {
    if (block.type === 'form' && block.id) into.add(block.id);
    if (block.type === 'columns') {
      for (const column of block.columns) collectFormIds(column, into);
    } else if (block.type === 'tabs') {
      for (const panel of block.panels) collectFormIds(panel.blocks, into);
    } else if (block.type === 'reveal') {
      collectFormIds(block.blocks, into);
    }
  }
}

/**
 * `kind: "page"` payload: single-scroll marketing/landing composed of sections
 * of blocks, optional nav and form refs.
 */
export const PageDocumentSchema = z
  .strictObject({
    ...metaFields,
    sections: z.array(PageSectionSchema).min(1).max(PAGE_DOCUMENT_LIMITS.maxSections),
    nav: z.array(PageNavItemSchema).max(PAGE_DOCUMENT_LIMITS.maxNavItems).optional(),
    forms: z.array(PageFormRefSchema).max(PAGE_DOCUMENT_LIMITS.maxFormRefs).optional(),
  })
  .superRefine((doc, ctx) => {
    uniqueIds(
      doc.sections.map((section) => section.id),
      ctx,
      ['sections'],
      'Section'
    );
    const anchors = doc.sections.map((section) => section.anchor ?? section.id);
    uniqueIds(anchors, ctx, ['sections'], 'Section anchor');

    const formBlockIds = new Set<string>();
    for (const section of doc.sections) collectFormIds(section.blocks, formBlockIds);

    doc.forms?.forEach((ref, i) => {
      if (!formBlockIds.has(ref.formId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['forms', i, 'formId'],
          message: `formId "${ref.formId}" does not match a form block in sections`,
        });
      }
      if (ref.sectionId !== undefined) {
        const section = doc.sections.find((row) => row.id === ref.sectionId);
        if (!section) {
          ctx.addIssue({
            code: 'custom',
            path: ['forms', i, 'sectionId'],
            message: `sectionId "${ref.sectionId}" is not a section on this page`,
          });
        }
      }
    });

    if (doc.nav) {
      uniqueIds(
        doc.nav.map((item) => item.id),
        ctx,
        ['nav'],
        'Nav item'
      );
      const anchorSet = new Set(anchors);
      doc.nav.forEach((item, i) => {
        const frag = item.href.slice(1);
        if (!anchorSet.has(frag)) {
          ctx.addIssue({
            code: 'custom',
            path: ['nav', i, 'href'],
            message: `nav href "#${frag}" must match a section id or anchor`,
          });
        }
      });
    }
  });
export type PageDocument = z.infer<typeof PageDocumentSchema>;

/** TOC options for a continuous doc flow. */
export const DocTocSchema = z.strictObject({
  /** Heading levels to include (2 = h2 only through 4 = h2–h4). Default 3. */
  depth: z.number().int().min(2).max(PAGE_DOCUMENT_LIMITS.maxTocDepth).optional(),
  /** Prefer a sticky TOC chrome when the host supports it. */
  sticky: z.boolean().optional(),
});
export type DocToc = z.infer<typeof DocTocSchema>;

/** Print preferences for continuous page/doc flow (not deck slide-per-page). */
export const DocPrintSchema = z.strictObject({
  /** Optional page breaks at heading boundaries. */
  pageBreaks: z.enum(['none', 'heading']).optional(),
  /** Hide host chrome (nav, demo badge) when printing. */
  hideChrome: z.boolean().optional(),
});
export type DocPrint = z.infer<typeof DocPrintSchema>;

/**
 * `kind: "doc"` payload: continuous block flow with optional TOC and print
 * prefs (reports, one-pagers, data stories).
 */
export const DocDocumentSchema = z
  .strictObject({
    ...metaFields,
    blocks: z.array(BlockSchema).min(1).max(PAGE_DOCUMENT_LIMITS.maxDocBlocks),
    toc: DocTocSchema.optional(),
    print: DocPrintSchema.optional(),
  })
  .superRefine((doc, ctx) => {
    const list = BlockListSchema.safeParse(doc.blocks);
    if (!list.success) {
      for (const issue of list.error.issues) {
        ctx.addIssue({
          code: 'custom',
          path: ['blocks', ...issue.path],
          message: issue.message,
        });
      }
    }
  });
export type DocDocument = z.infer<typeof DocDocumentSchema>;

/** Never-throw parse helpers. */
export type DocumentParseResult<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: z.ZodError };

export function safeParsePageDocument(input: unknown): DocumentParseResult<PageDocument> {
  const result = PageDocumentSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data, error: null }
    : { success: false, data: null, error: result.error };
}

export function safeParseDocDocument(input: unknown): DocumentParseResult<DocDocument> {
  const result = DocDocumentSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data, error: null }
    : { success: false, data: null, error: result.error };
}
