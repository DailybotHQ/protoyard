import { type TexuliDocument } from '@texuli/document/model';
import { describe, expect, it } from 'vitest';
import { FormResponseSchema } from '../src/form-response.ts';
import { checkPageDocumentLimits, PAGE_LIMITS } from '../src/limits.ts';
import {
  type DocDocument,
  DocDocumentSchema,
  PageDocumentSchema,
  safeParseDocDocument,
  safeParsePageDocument,
} from '../src/schema.ts';
import { docToTexuliDocument, texuliDocumentToDoc } from '../src/texuli-document.ts';

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
});

describe('DocDocumentSchema', () => {
  it('parses a valid doc with toc and print prefs', () => {
    const parsed = DocDocumentSchema.parse(docFixture);
    expect(parsed.blocks).toHaveLength(4);
    expect(parsed.toc?.sticky).toBe(true);
    expect(safeParseDocDocument(docFixture).success).toBe(true);
  });
});

// --- merged from form-response.test.ts ---

describe('form-response', () => {
  describe('FormResponseSchema', () => {
    it('rejects unsafe value keys before record parsing', () => {
      for (const key of ['__proto__', 'constructor', 'prototype']) {
        const input = JSON.parse(
          `{"id":"response-1","formId":"contact-form","createdAt":"2030-01-02T03:04:05.000Z","values":{"${key}":"unsafe"}}`
        );
        const result = FormResponseSchema.safeParse(input);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues).toContainEqual(
            expect.objectContaining({ path: ['values', key] })
          );
        }
      }
    });
  });
});

// --- merged from limits.test.ts ---

describe('limits', () => {
  describe('checkPageDocumentLimits', () => {
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
});

// --- merged from texuli-document.test.ts ---

describe('texuli-document', () => {
  const sample: DocDocument = {
    id: 'sample-doc',
    title: 'Sample report',
    description: 'Fictional report for conversion tests.',
    blocks: [
      {
        type: 'heading',
        id: 'title',
        level: 1,
        text: 'Sample report',
        eyebrow: 'Quarterly',
        subtitle: 'What changed this quarter.',
      },
      {
        type: 'text',
        id: 'intro',
        markdown: 'First paragraph with **bold**.\n\nSecond paragraph.',
      },
      { type: 'heading', id: 'numbers', level: 2, text: 'Numbers' },
      {
        type: 'stat',
        id: 'kpis',
        items: [
          { value: '87%', label: 'Resolved', delta: '+4 pts' },
          { value: '1,240', label: 'Tickets' },
        ],
      },
      {
        type: 'table',
        id: 'regions',
        caption: 'Tickets by region',
        columns: [{ label: 'Region' }, { label: 'Tickets', format: 'number' }],
        rows: [
          ['North', 420],
          ['South', null],
        ],
      },
      {
        type: 'chart',
        id: 'trend',
        spec: {
          kind: 'bar',
          title: 'Tickets per month',
          labels: ['July', 'August'],
          series: [{ label: 'Opened', values: [1080, 1150] }],
        },
      },
      {
        type: 'list',
        id: 'actions',
        style: 'icon',
        items: [
          { text: 'Hire two agents', icon: 'users' },
          { text: 'Ship the help center', icon: 'rocket' },
        ],
      },
      {
        type: 'quote',
        id: 'voice',
        quote: 'Support felt human again.',
        cite: 'Avery Example',
        role: 'Customer',
      },
      { type: 'callout', id: 'note', title: 'Heads up', body: 'Numbers are fictional.' },
      { type: 'divider', id: 'split', label: 'Appendix' },
      { type: 'code', id: 'query', lang: 'sql', code: 'select 1;', filename: 'query.sql' },
      {
        type: 'form',
        id: 'feedback',
        title: 'Was this useful?',
        fields: [{ name: 'note', label: 'Note', type: 'text' }],
        submitLabel: 'Send',
        successMessage: 'Thanks.',
      },
    ],
  } as DocDocument;

  describe('docToTexuliDocument (edit mode)', () => {
    it('keeps hostile Markdown links inert (refused by the URL policy)', () => {
      const hostile = {
        ...sample,
        blocks: [{ type: 'text', id: 'evil', markdown: 'Click [here](javascript:alert(1)).' }],
      } as DocDocument;
      const { document } = docToTexuliDocument(hostile);
      expect(JSON.stringify(document)).not.toContain('javascript:');
    });
  });

  describe('texuliDocumentToDoc', () => {
    it('refuses an inline deck embed (validated with schema-core, G133)', () => {
      const { document } = docToTexuliDocument(sample);
      const edited = structuredClone(document);
      edited.blocks.push({
        id: 'pasted-deck',
        type: 'embed',
        kind: 'deck',
        title: 'Pasted deck',
        inline: { title: 'Deck', slides: [] },
      });
      // Protoyard never writes an inline deck (host blocks are component embeds), so it is refused.
      const back = texuliDocumentToDoc(edited, sample);
      expect(back.ok).toBe(false);
      if (back.ok) return;
      expect(back.issues.join(' ')).toMatch(/deck/i);
    });

    it('refuses an invalid Texuli document and an empty one', () => {
      const invalid = {
        ...docToTexuliDocument(sample).document,
        blocks: [{ id: 'x', type: 'nope' }],
      };
      const refused = texuliDocumentToDoc(invalid as unknown as TexuliDocument, sample);
      expect(refused.ok).toBe(false);
      const empty = texuliDocumentToDoc(
        { ...docToTexuliDocument(sample).document, blocks: [] },
        sample
      );
      expect(empty).toMatchObject({ ok: false, issues: ['A doc needs at least one block.'] });
    });
  });
});
