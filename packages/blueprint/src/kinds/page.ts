import { forEachBlock } from '@protoyard/blocks';
import { type PageDocument, PageDocumentSchema } from '@protoyard/pages';
import type { z } from 'zod';
import { blockIds, checkFragmentLinks, fragmentLinks } from './anchors.ts';

/**
 * The `kind: "page"` body (ADR-036, ADR-039): `@protoyard/pages`'
 * `PageDocumentSchema` (sections of blocks, nav, form refs; unique section ids
 * and anchors, nav and `forms[].formId` resolved) plus the checks that span
 * the whole page:
 *
 * - block ids, headings included, are unique across all sections (a page is
 *   one DOM and one form-response store, so `#id` and form ids must be too);
 * - a block id never equals a section id or anchor (both are hash targets);
 * - `forms[].sectionId`, when set, is the section that holds the form;
 * - every `#fragment` link in a block (`cta`, `cards`) points at a section
 *   anchor or a block id on the page.
 */
export const PageBodySchema: z.ZodType<PageDocument> = PageDocumentSchema.superRefine(
  (page, ctx) => {
    const sectionTargets = new Set<string>();
    for (const section of page.sections) {
      sectionTargets.add(section.id);
      sectionTargets.add(section.anchor ?? section.id);
    }

    const seen = new Map<string, string>();
    const blockTargets = new Set<string>();
    const formSection = new Map<string, string>();
    page.sections.forEach((section, s) => {
      for (const { id, path } of blockIds(section.blocks, ['sections', s, 'blocks'])) {
        blockTargets.add(id);
        const first = seen.get(id);
        if (first !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path,
            message: `Block id "${id}" is already used in section "${first}"; block ids must be unique on a page`,
          });
        } else {
          seen.set(id, section.id);
        }
        if (sectionTargets.has(id)) {
          ctx.addIssue({
            code: 'custom',
            path,
            message: `Block id "${id}" is also a section id or anchor; use a different id`,
          });
        }
      }
      // Forms anywhere in the section, containers included.
      forEachBlock(section.blocks, (block) => {
        if (block.type === 'form' && !formSection.has(block.id))
          formSection.set(block.id, section.id);
      });
    });

    page.forms?.forEach((ref, i) => {
      if (ref.sectionId === undefined) return;
      const holder = formSection.get(ref.formId);
      if (holder !== undefined && holder !== ref.sectionId) {
        ctx.addIssue({
          code: 'custom',
          path: ['forms', i, 'sectionId'],
          message: `Form "${ref.formId}" is in section "${holder}", not "${ref.sectionId}"`,
        });
      }
    });

    checkFragmentLinks(
      fragmentLinks(page.sections, ['sections']),
      new Set([...sectionTargets, ...blockTargets]),
      ctx,
      'a section anchor or block id on this page'
    );
  }
);
