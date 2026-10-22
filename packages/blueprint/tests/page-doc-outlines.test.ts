import { describe, expect, it } from 'vitest';
import { detectBriefKind } from '../src/brief/kind-detection.ts';
import {
  blueprintFromBrief,
  buildDocOutline,
  buildPageOutline,
  DOC_OUTLINE_IDS,
  detectPageDocOmissions,
  isContentBriefResult,
  PAGE_OUTLINE_IDS,
  sectionIds,
  selectDocOutline,
  selectPageOutline,
  synthesizeDocFromBrief,
  synthesizePageFromBrief,
} from '../src/index.ts';

const BLOCK_TYPES = new Set([
  'heading',
  'text',
  'list',
  'cta',
  'stat',
  'quote',
  'callout',
  'divider',
]);

function assertSectionsOrdered(
  sections: readonly {
    id: string;
    role?: string;
    title?: string;
    body?: string;
    blocks: readonly { type: string }[];
  }[]
) {
  expect(sections.length).toBeGreaterThanOrEqual(3);
  const ids = sections.map((s) => s.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const section of sections) {
    expect(section.id).toMatch(/^section-/);
    expect(section.blocks.length).toBeGreaterThan(0);
    for (const block of section.blocks) {
      expect(BLOCK_TYPES.has(block.type), block.type).toBe(true);
    }
  }
}

describe('selectPageOutline / selectDocOutline', () => {
  it('maps cues to outline families', () => {
    expect(selectPageOutline('A marketing landing page for Example Harbor')).toBe('landing');
    expect(selectPageOutline('Pricing page with three plans')).toBe('pricing');
    expect(selectPageOutline('Coming soon waitlist for early access')).toBe('waitlist');
    expect(selectPageOutline('A simple page about our team')).toBe('generic');

    expect(selectDocOutline('Write the quarterly report for Example Harbor')).toBe('report');
    expect(selectDocOutline('Employee handbook for onboarding')).toBe('handbook');
    expect(selectDocOutline('A one-pager on the product')).toBe('one-pager');
    expect(selectDocOutline('Proposal and statement of work for the client')).toBe('proposal');
    expect(selectDocOutline('A short document about process')).toBe('generic');
  });

  it('lists every outline id', () => {
    expect(PAGE_OUTLINE_IDS).toContain('landing');
    expect(DOC_OUTLINE_IDS).toContain('report');
  });
});

describe('buildPageOutline / buildDocOutline', () => {
  it('builds ordered landing sections with block vocabulary', () => {
    const built = buildPageOutline(
      'A marketing landing page for Example Harbor with a hero section and pricing.'
    );
    expect(built.outline).toBe('landing');
    assertSectionsOrdered(built.sections);
    expect(sectionIds(built.sections)[0]).toBe('section-hero');
    expect(sectionIds(built.sections).at(-1)).toBe('section-footer');
    expect(built.rationale.some((line) => line.includes('landing'))).toBe(true);
  });

  it('builds report sections with stable ids', () => {
    const built = buildDocOutline(
      'Write the quarterly report for Example Harbor covering status and next steps.'
    );
    expect(built.outline).toBe('report');
    assertSectionsOrdered(built.sections);
    expect(sectionIds(built.sections)).toEqual([
      'section-title',
      'section-summary',
      'section-status',
      'section-findings',
      'section-next',
    ]);
  });

  it('is deterministic across runs', () => {
    const brief = 'Landing page for Cedar Tools with features and a call to action.';
    expect(JSON.stringify(buildPageOutline(brief))).toBe(JSON.stringify(buildPageOutline(brief)));
    const report = 'Quarterly status report for Meadow Labs.';
    expect(JSON.stringify(buildDocOutline(report))).toBe(JSON.stringify(buildDocOutline(report)));
  });

  it('records interactive omissions without inventing forms or auth', () => {
    const omissions = detectPageDocOmissions(
      'Landing page with a signup form, Stripe checkout, SSO login and a live poll.'
    );
    expect(omissions.length).toBeGreaterThanOrEqual(3);
    expect(omissions.join(' ')).toMatch(/form/i);
    expect(omissions.join(' ')).toMatch(/payment|checkout/i);
    expect(omissions.join(' ')).toMatch(/auth|SSO|sign-in/i);
    expect(omissions.join(' ')).toMatch(/poll/i);

    const page = buildPageOutline(
      'Waitlist page that collects emails with a registration form and OAuth.'
    );
    expect(page.omissions.length).toBeGreaterThan(0);
    expect(page.rationale.some((line) => line.startsWith('Omission:'))).toBe(true);
    expect(JSON.stringify(page.sections)).not.toMatch(/entities|roles/);
  });
});

describe('synthesizePageFromBrief / synthesizeDocFromBrief', () => {
  it('yields kind page/doc, outline id, ordered sections and rationale', () => {
    const pageDetection = detectBriefKind(
      'A marketing landing page for Example Harbor with a hero section.'
    );
    const page = synthesizePageFromBrief(
      'A marketing landing page for Example Harbor with a hero section.',
      pageDetection
    );
    expect(page.kind).toBe('page');
    expect(page.outline).toBe('landing');
    expect(page.json.kind).toBe('page');
    const pageBody = page.json.page as {
      id: string;
      title: string;
      sections: { id: string; blocks: unknown[] }[];
    };
    expect(pageBody.id).toMatch(/^[a-z]/);
    expect(pageBody.title.length).toBeGreaterThan(0);
    assertSectionsOrdered(pageBody.sections as never);
    expect(page.rationale[0]).toBe(pageDetection.reason);
    expect(page.json).not.toHaveProperty('entities');
    expect(page.json).not.toHaveProperty('roles');

    const docDetection = detectBriefKind(
      'Write the quarterly report for Example Harbor covering status and next steps.'
    );
    const doc = synthesizeDocFromBrief(
      'Write the quarterly report for Example Harbor covering status and next steps.',
      docDetection
    );
    expect(doc.kind).toBe('doc');
    expect(doc.outline).toBe('report');
    const docBody = doc.json.doc as {
      id: string;
      title: string;
      blocks: { id?: string; type: string }[];
    };
    expect(docBody.id).toMatch(/^[a-z]/);
    expect(docBody.title.length).toBeGreaterThan(0);
    expect(docBody.blocks.find((block) => block.id === 'section-title')?.type).toBe('heading');
  });

  it('routes through blueprintFromBrief with the same shape', () => {
    const result = blueprintFromBrief(
      'A marketing landing page for Example Harbor with a hero section and pricing.'
    );
    expect(isContentBriefResult(result)).toBe(true);
    if (!isContentBriefResult(result)) return;
    expect(result.kind).toBe('page');
    expect(result.outline).toBe('landing');
    const sections = (result.json.page as { sections: unknown[] }).sections;
    expect(sections.length).toBeGreaterThanOrEqual(4);
  });
});
