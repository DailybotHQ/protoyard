// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  boxesOverlap,
  checkDesignFacts,
  DESIGN_THRESHOLDS,
  type DesignFacts,
  firstFamily,
  isDefaultSerif,
  isStaleLock,
  PAGE_DESIGN_TARGETS,
  processAlive,
  REQUIRED_THEME_TOKENS,
} from '../lib/page-design.ts';

/**
 * The pure half of the page and doc design gate: the facts a browser measures
 * become issues. Each defect the R4 review found at level 2 (no stylesheet,
 * a small title, a doubled title, two tables of contents, timeline markers
 * over their labels) must produce an issue, and the designed examples none.
 */

const INTER = '"Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif';
const tokens = Object.fromEntries(
  REQUIRED_THEME_TOKENS.map((token) => [
    token,
    token.startsWith('--tx-font') ? INTER : token === '--tx-primary' ? '#7c3aed' : '#fafafa',
  ])
);

/** The doc as measured on desktop (2026-10-22, level 1 and level 2). */
function docFacts(overrides: Partial<DesignFacts> = {}): DesignFacts {
  return {
    kind: 'doc',
    viewportWidth: 1280,
    tokens,
    bodyFontFamily: INTER,
    bodyFontSize: 16,
    title: { text: 'Northwind support quarterly report', fontSize: 64, fontFamily: INTER },
    titleCopies: 1,
    tocCount: 1,
    navLinks: 5,
    scrollWidth: 1280,
    overflowing: [],
    timeline: [
      {
        marker: { left: 300, top: 100, right: 320, bottom: 120 },
        labels: [
          { left: 332, top: 100, right: 700, bottom: 116 },
          { left: 332, top: 120, right: 900, bottom: 144 },
        ],
      },
    ],
    ...overrides,
  };
}

const pageFacts = (overrides: Partial<DesignFacts> = {}): DesignFacts =>
  docFacts({
    kind: 'page',
    title: { text: 'Fresh beans at your door every two weeks', fontSize: 60, fontFamily: INTER },
    tocCount: 0,
    navLinks: 4,
    timeline: [],
    ...overrides,
  });

const checks = (facts: DesignFacts) => checkDesignFacts(facts).map((issue) => issue.check);

describe('checkDesignFacts', () => {
  it('passes the designed page and doc on desktop and phone', () => {
    expect(checkDesignFacts(docFacts())).toEqual([]);
    expect(checkDesignFacts(pageFacts())).toEqual([]);
    const phone = { viewportWidth: 412, scrollWidth: 412 };
    expect(
      checkDesignFacts(
        docFacts({ ...phone, title: { text: 'T', fontSize: 40, fontFamily: INTER } })
      )
    ).toEqual([]);
    expect(
      checkDesignFacts(
        pageFacts({ ...phone, title: { text: 'T', fontSize: 36, fontFamily: INTER } })
      )
    ).toEqual([]);
  });

  it('flags an unstyled view: the browser default serif, even with theme tokens set (R4)', () => {
    const issues = checkDesignFacts(
      pageFacts({
        bodyFontFamily: '"Times New Roman"',
        title: { text: 'T', fontSize: 32, fontFamily: '"Times New Roman"' },
      })
    );
    expect(issues.map((issue) => issue.check)).toEqual(['theme', 'display-scale', 'theme']);
    expect(issues[0]?.message).toMatch(/browser default font/);
  });

  it('flags missing theme tokens and a body font that is not the theme’s', () => {
    expect(checks(docFacts({ tokens: { ...tokens, '--tx-primary': '' } }))).toEqual(['theme']);
    expect(checks(docFacts({ bodyFontFamily: 'Georgia, serif' }))).toEqual(['theme']);
  });

  it('flags a title below the display scale (the R4 24px hero), on desktop and phone', () => {
    const small = { text: 'T', fontSize: 24, fontFamily: INTER };
    expect(checks(pageFacts({ title: small }))).toEqual(['display-scale']);
    expect(checks(pageFacts({ viewportWidth: 412, scrollWidth: 412, title: small }))).toEqual([
      'display-scale',
    ]);
    // The ratio applies too: a 20px body needs a 45px desktop title.
    expect(
      checks(pageFacts({ bodyFontSize: 20, title: { text: 'T', fontSize: 44, fontFamily: INTER } }))
    ).toEqual(['display-scale']);
    expect(checks(pageFacts({ title: null }))).toEqual(['display-scale']);
  });

  it('flags a doubled title and a doc with two (or no) tables of contents (R4)', () => {
    expect(checks(docFacts({ titleCopies: 2 }))).toEqual(['title-copies']);
    expect(checks(docFacts({ tocCount: 2 }))).toEqual(['toc']);
    expect(checks(docFacts({ tocCount: 0 }))).toEqual(['toc']);
    // A page has navigation instead of a table of contents.
    expect(checks(pageFacts({ tocCount: 0 }))).toEqual([]);
    expect(checks(pageFacts({ navLinks: 0 }))).toEqual(['navigation']);
  });

  it('flags horizontal overflow, of the page and of single elements', () => {
    expect(checks(docFacts({ scrollWidth: 1400 }))).toEqual(['overflow']);
    expect(checks(docFacts({ scrollWidth: 1281 }))).toEqual([]);
    const issues = checkDesignFacts(docFacts({ overflowing: ['table[data-py-block]'] }));
    expect(issues).toEqual([
      { check: 'overflow', message: 'table[data-py-block] reaches past the 1280px viewport.' },
    ]);
  });

  it('flags a timeline marker that overlaps its label (R4)', () => {
    const overlapping = docFacts({
      timeline: [
        {
          marker: { left: 300, top: 100, right: 320, bottom: 120 },
          labels: [{ left: 310, top: 102, right: 600, bottom: 118 }],
        },
      ],
    });
    expect(checkDesignFacts(overlapping)).toEqual([
      { check: 'timeline-overlap', message: 'Timeline event 1: its marker overlaps its label.' },
    ]);
  });
});

describe('helpers', () => {
  it('reads the first font family, unquoted', () => {
    expect(firstFamily(INTER)).toBe('inter variable');
    expect(firstFamily("'Times New Roman', serif")).toBe('times new roman');
  });

  it('recognizes the browser default serif fonts only', () => {
    for (const font of ['"Times New Roman"', 'Times', 'serif', 'Tinos']) {
      expect(isDefaultSerif(font), font).toBe(true);
    }
    for (const font of [INTER, 'Georgia, serif', 'ui-serif']) {
      expect(isDefaultSerif(font), font).toBe(false);
    }
  });

  it('counts touching boxes as clear and overlapping ones as overlapping', () => {
    const a = { left: 0, top: 0, right: 20, bottom: 20 };
    expect(boxesOverlap(a, { left: 20, top: 0, right: 40, bottom: 20 })).toBe(false);
    expect(boxesOverlap(a, { left: 19.5, top: 0, right: 40, bottom: 20 })).toBe(false);
    expect(boxesOverlap(a, { left: 10, top: 10, right: 30, bottom: 30 })).toBe(true);
  });

  it('names the two example blueprints and their player pages', () => {
    expect(PAGE_DESIGN_TARGETS.map((target) => [target.kind, target.entry])).toEqual([
      ['page', 'page.html'],
      ['doc', 'doc.html'],
    ]);
    expect(DESIGN_THRESHOLDS.desktop.displayMinPx).toBeGreaterThan(
      DESIGN_THRESHOLDS.phone.displayMinPx
    );
  });
});

describe('the shared build lock', () => {
  it('waits for a live owner, however long the build takes', () => {
    expect(isStaleLock({ owner: { pid: 42 }, ageMs: 30 * 60_000 }, () => true)).toBe(false);
  });

  it('takes over a lock whose owner died, or one that never recorded an owner', () => {
    expect(isStaleLock({ owner: { pid: 42 }, ageMs: 10 }, () => false)).toBe(true);
    expect(isStaleLock({ owner: null, ageMs: 5_000 })).toBe(false);
    expect(isStaleLock({ owner: null, ageMs: 120_000 })).toBe(true);
  });

  it('checks a process without signalling it', () => {
    expect(processAlive(process.pid)).toBe(true);
    // Far above any pid the OS hands out.
    expect(processAlive(2 ** 30)).toBe(false);
  });
});
