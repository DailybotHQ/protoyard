import { describe, expect, it } from 'vitest';
import {
  checkDocDocumentLimits,
  checkFormResponseLimits,
  checkPageDocumentLimits,
  DOC_LIMITS,
  jsonDepth,
  PAGE_LIMITS,
  UNTRUSTED_PAGE_DOC_HINT,
} from '../src/limits.ts';
import { PAGE_DOCUMENT_LIMITS } from '../src/schema.ts';

describe('PAGE_LIMITS and DOC_LIMITS', () => {
  it('exports frozen caps aligned with document schemas', () => {
    expect(Object.isFrozen(PAGE_LIMITS)).toBe(true);
    expect(Object.isFrozen(DOC_LIMITS)).toBe(true);
    expect(PAGE_LIMITS.maxSections).toBe(PAGE_DOCUMENT_LIMITS.maxSections);
    expect(PAGE_LIMITS.maxBlocksPerSection).toBe(PAGE_DOCUMENT_LIMITS.maxBlocksPerSection);
    expect(DOC_LIMITS.maxDocBlocks).toBe(PAGE_DOCUMENT_LIMITS.maxDocBlocks);
    expect(PAGE_LIMITS.maxFormFields).toBe(32);
    expect(PAGE_LIMITS.maxFieldOptions).toBe(32);
    expect(PAGE_LIMITS.maxResponseValueBytes).toBe(8 * 1024);
    expect(PAGE_LIMITS.maxResponsesPerForm).toBe(500);
    expect(PAGE_LIMITS.maxBytes).toBe(512 * 1024);
    expect(UNTRUSTED_PAGE_DOC_HINT.page.maxSections).toBe(PAGE_LIMITS.maxSections);
    expect(UNTRUSTED_PAGE_DOC_HINT.doc.maxDocBlocks).toBe(DOC_LIMITS.maxDocBlocks);
  });
});

describe('checkPageDocumentLimits', () => {
  it('accepts a small valid page shape', () => {
    const result = checkPageDocumentLimits({
      id: 'landing',
      title: 'Landing',
      sections: [{ id: 'hero', blocks: [{ type: 'text', markdown: 'Hi' }] }],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects too many sections and blocks per section', () => {
    const sections = Array.from({ length: PAGE_LIMITS.maxSections + 1 }, (_, i) => ({
      id: `s${i}`,
      blocks: [],
    }));
    const tooManySections = checkPageDocumentLimits({
      id: 'big',
      title: 'Big',
      sections,
    });
    expect(tooManySections.ok).toBe(false);
    expect(tooManySections.issues.some((row) => row.code === 'too-many-sections')).toBe(true);

    const blocks = Array.from({ length: PAGE_LIMITS.maxBlocksPerSection + 1 }, () => ({
      type: 'text',
      markdown: 'x',
    }));
    const tooManyBlocks = checkPageDocumentLimits({
      id: 'dense',
      title: 'Dense',
      sections: [{ id: 'only', blocks }],
    });
    expect(tooManyBlocks.ok).toBe(false);
    expect(tooManyBlocks.issues.some((row) => row.code === 'too-many-blocks')).toBe(true);
  });

  it('rejects forms with too many fields or options', () => {
    const fields = Array.from({ length: PAGE_LIMITS.maxFormFields + 1 }, (_, i) => ({
      name: `f${i}`,
      label: `Field ${i}`,
      type: 'text',
    }));
    const result = checkPageDocumentLimits({
      id: 'forms',
      title: 'Forms',
      sections: [
        {
          id: 's1',
          blocks: [
            {
              type: 'form',
              id: 'contact',
              fields,
              submitLabel: 'Send',
              successMessage: 'Ok',
            },
          ],
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((row) => row.code === 'too-many-fields')).toBe(true);

    const options = Array.from({ length: PAGE_LIMITS.maxFieldOptions + 1 }, (_, i) => ({
      value: `v${i}`,
      label: `Opt ${i}`,
    }));
    const opts = checkPageDocumentLimits({
      id: 'opts',
      title: 'Opts',
      sections: [
        {
          id: 's1',
          blocks: [
            {
              type: 'form',
              id: 'survey',
              fields: [
                {
                  name: 'choice',
                  label: 'Choice',
                  type: 'enum',
                  options,
                },
              ],
              submitLabel: 'Send',
              successMessage: 'Ok',
            },
          ],
        },
      ],
    });
    expect(opts.ok).toBe(false);
    expect(opts.issues.some((row) => row.code === 'too-many-options')).toBe(true);
  });

  it('rejects oversized byte payloads', () => {
    const limits = { ...PAGE_LIMITS, maxBytes: 200 };
    const result = checkPageDocumentLimits(
      {
        id: 'fat',
        title: 'Fat',
        description: 'x'.repeat(500),
        sections: [{ id: 's', blocks: [] }],
      },
      limits
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((row) => row.code === 'too-large')).toBe(true);
  });
});

describe('checkDocDocumentLimits', () => {
  it('rejects too many doc blocks and over-deep trees', () => {
    const blocks = Array.from({ length: DOC_LIMITS.maxDocBlocks + 1 }, () => ({
      type: 'text',
      markdown: 'x',
    }));
    const result = checkDocDocumentLimits({
      id: 'huge',
      title: 'Huge',
      blocks,
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((row) => row.code === 'too-many-blocks')).toBe(true);

    let deep: unknown = { leaf: true };
    for (let i = 0; i < DOC_LIMITS.maxDepth + 2; i += 1) deep = { child: deep };
    const depth = checkDocDocumentLimits(
      { id: 'deep', title: 'Deep', blocks: [{ type: 'text', markdown: 'x' }], nest: deep },
      DOC_LIMITS
    );
    expect(jsonDepth({ nest: deep })).toBeGreaterThan(DOC_LIMITS.maxDepth);
    expect(depth.ok).toBe(false);
    expect(depth.issues.some((row) => row.code === 'too-deep')).toBe(true);
  });

  it('accepts a small doc', () => {
    expect(
      checkDocDocumentLimits({
        id: 'report',
        title: 'Report',
        blocks: [{ type: 'heading', text: 'Hi', level: 2 }],
        toc: { depth: 3 },
      }).ok
    ).toBe(true);
  });
});

describe('checkFormResponseLimits', () => {
  it('rejects oversize values and too many responses', () => {
    const big = checkFormResponseLimits(
      { values: { note: 'x'.repeat(PAGE_LIMITS.maxResponseValueBytes) } },
      PAGE_LIMITS
    );
    expect(big.ok).toBe(false);
    expect(big.issues.some((row) => row.code === 'response-too-large')).toBe(true);

    const many = checkFormResponseLimits({
      values: { ok: true },
      responseCount: PAGE_LIMITS.maxResponsesPerForm + 1,
    });
    expect(many.ok).toBe(false);
    expect(many.issues.some((row) => row.code === 'too-many-responses')).toBe(true);

    expect(
      checkFormResponseLimits({ values: { email: 'a@example.com' }, responseCount: 1 }).ok
    ).toBe(true);
  });
});
