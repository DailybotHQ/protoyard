import { forEachBlock } from '@protoyard/blocks';
import { type DocDocument, DocDocumentSchema } from '@protoyard/pages';
import type { z } from 'zod';
import { blockIds, checkFragmentLinks, fragmentLinks } from './anchors.ts';

/** The table of contents covers heading levels 2 to this one when `toc.depth` is unset. */
export const DOC_DEFAULT_TOC_DEPTH = 3;
/** The level a heading without `level` counts as in a doc's table of contents. */
export const DOC_DEFAULT_HEADING_LEVEL = 2;

/**
 * The `kind: "doc"` body (ADR-036, ADR-039): `@protoyard/pages`'
 * `DocDocumentSchema` (a block flow with unique block ids, plus TOC and print
 * options) plus the checks that span the whole document:
 *
 * - a requested table of contents has at least one heading it would list
 *   (level 2 up to `toc.depth`, 3 by default), so it is never an empty box;
 * - every `#fragment` link in a block (`cta`, `cards`) points at a block id,
 *   usually a heading's, in this document.
 *
 * Heading ids are block ids, so their uniqueness comes from the block list.
 */
export const DocBodySchema: z.ZodType<DocDocument> = DocDocumentSchema.superRefine((doc, ctx) => {
  if (doc.toc) {
    const depth = doc.toc.depth ?? DOC_DEFAULT_TOC_DEPTH;
    let listed = 0;
    forEachBlock(doc.blocks, (block) => {
      if (block.type !== 'heading') return;
      const level = block.level ?? DOC_DEFAULT_HEADING_LEVEL;
      if (level >= 2 && level <= depth) listed += 1;
    });
    if (listed === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['toc'],
        message: `The table of contents lists headings of level 2 to ${depth}, and this document has none`,
      });
    }
  }
  const targets = new Set(blockIds(doc.blocks, ['blocks']).map((entry) => entry.id));
  checkFragmentLinks(
    fragmentLinks(doc.blocks, ['blocks']),
    targets,
    ctx,
    'a block id in this document'
  );
});
