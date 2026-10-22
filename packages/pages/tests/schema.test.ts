import { describe, expect, it } from 'vitest';
import {
  DocDocumentSchema,
  PAGE_DOCUMENT_LIMITS,
  PageDocumentSchema,
  safeParseDocDocument,
  safeParsePageDocument,
} from '../src/schema.ts';

const textBlock = (markdown: string) => ({ type: 'text' as const, markdown });

const pageFixture = {
  id: 'northstar-landing',
  title: 'Northstar landing',
  description: 'A fictional product landing page.',
  style: 'soft-violet',
  sections: [
    {
      id: 'hero',
      role: 'hero' as const,
      title: 'Welcome',
      blocks: [textBlock('Ship prototypes that **feel real**.')],
    },
    {
      id: 'features',
      anchor: 'features',
      role: 'features' as const,
      blocks: [
        textBlock('Deterministic scenarios.'),
        {
          type: 'form' as const,
          id: 'contact',
          fields: [{ name: 'email', label: 'Work email', type: 'email' as const, required: true }],
          submitLabel: 'Join the waitlist',
          successMessage: 'Thanks — this is a simulated form.',
        },
      ],
    },
  ],
  nav: [
    { id: 'nav-hero', label: 'Top', href: '#hero' },
    { id: 'nav-features', label: 'Features', href: '#features' },
  ],
  forms: [{ formId: 'contact', sectionId: 'features' }],
};

const docFixture = {
  id: 'q3-report',
  title: 'Q3 product report',
  description: 'One-pager for a fictional team.',
  blocks: [
    { type: 'heading' as const, text: 'Summary', level: 2 as const },
    textBlock('Revenue held steady in the example period.'),
    { type: 'heading' as const, text: 'Details', level: 2 as const, id: 'details' },
    textBlock('More narrative for the print twin.'),
  ],
  toc: { depth: 3, sticky: true },
  print: { pageBreaks: 'heading' as const, hideChrome: true },
};

describe('PageDocumentSchema', () => {
  it('parses a valid landing page with nav and form refs', () => {
    const parsed = PageDocumentSchema.parse(pageFixture);
    expect(parsed.id).toBe('northstar-landing');
    expect(parsed.sections).toHaveLength(2);
    expect(parsed.forms?.[0]?.formId).toBe('contact');
    expect(safeParsePageDocument(pageFixture).success).toBe(true);
  });

  it('rejects unknown keys', () => {
    const result = PageDocumentSchema.safeParse({ ...pageFixture, extra: true });
    expect(result.success).toBe(false);
  });

  it('rejects over-limit sections', () => {
    const sections = Array.from({ length: PAGE_DOCUMENT_LIMITS.maxSections + 1 }, (_, i) => ({
      id: `sec-${i}`,
      blocks: [textBlock('x')],
    }));
    // ids must match BlockIdSchema - sec-0 is invalid (starts wrong? sec-0 has digit after hyphen ok, but sec- starts with letter)
    // BlockId: /^[a-z][a-z0-9-]{0,47}$/ - sec-0 is fine
    const result = PageDocumentSchema.safeParse({
      id: 'big-page',
      title: 'Too many sections',
      sections: sections.map((s, i) => ({ ...s, id: `s${i}` })),
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate section ids and bad form refs', () => {
    const dup = PageDocumentSchema.safeParse({
      id: 'dup-page',
      title: 'Dup',
      sections: [
        { id: 'same', blocks: [] },
        { id: 'same', blocks: [] },
      ],
    });
    expect(dup.success).toBe(false);

    const badForm = PageDocumentSchema.safeParse({
      ...pageFixture,
      forms: [{ formId: 'missing-form' }],
    });
    expect(badForm.success).toBe(false);

    const badNav = PageDocumentSchema.safeParse({
      ...pageFixture,
      nav: [{ id: 'n1', label: 'Nope', href: '#missing' }],
    });
    expect(badNav.success).toBe(false);
  });

  it('rejects over-limit blocks per section', () => {
    const blocks = Array.from({ length: PAGE_DOCUMENT_LIMITS.maxBlocksPerSection + 1 }, () =>
      textBlock('x')
    );
    const result = PageDocumentSchema.safeParse({
      id: 'dense',
      title: 'Dense',
      sections: [{ id: 'only', blocks }],
    });
    expect(result.success).toBe(false);
  });
});

describe('DocDocumentSchema', () => {
  it('parses a valid doc with toc and print prefs', () => {
    const parsed = DocDocumentSchema.parse(docFixture);
    expect(parsed.blocks).toHaveLength(4);
    expect(parsed.toc?.sticky).toBe(true);
    expect(safeParseDocDocument(docFixture).success).toBe(true);
  });

  it('rejects unknown keys and empty blocks', () => {
    expect(DocDocumentSchema.safeParse({ ...docFixture, hack: 1 }).success).toBe(false);
    expect(DocDocumentSchema.safeParse({ id: 'empty', title: 'Empty', blocks: [] }).success).toBe(
      false
    );
  });

  it('rejects over-limit doc blocks', () => {
    const blocks = Array.from({ length: PAGE_DOCUMENT_LIMITS.maxDocBlocks + 1 }, () =>
      textBlock('x')
    );
    const result = DocDocumentSchema.safeParse({
      id: 'huge-doc',
      title: 'Huge',
      blocks,
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate block ids in the flow', () => {
    const result = DocDocumentSchema.safeParse({
      id: 'dup-doc',
      title: 'Dup',
      blocks: [
        { type: 'heading', text: 'A', id: 'same' },
        { type: 'heading', text: 'B', id: 'same' },
      ],
    });
    expect(result.success).toBe(false);
  });
});
