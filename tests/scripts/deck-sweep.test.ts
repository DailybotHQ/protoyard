import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildReport,
  classifyBrowserNoise,
  classifySlideMeasure,
  DEFAULT_DECK_BLUEPRINT,
  type DeckSlideMeasure,
  exitCodeForReport,
  MIN_BODY_PX,
  MIN_LABEL_PX,
  parseDeckSweepArgs,
  parseDeckSweepReport,
  planDeckVisits,
  renderDeckContactSheet,
  severityFor,
  summarizeIssues,
} from '../../scripts/lib/deck-sweep.ts';

const ROOT = join(import.meta.dirname, '../..');

describe('parseDeckSweepArgs', () => {
  it('keeps safe defaults', () => {
    expect(parseDeckSweepArgs([])).toEqual({
      blueprint: DEFAULT_DECK_BLUEPRINT,
      out: 'tmp/deck-sweep',
      port: 0,
      noShots: false,
      viewport: { width: 1280, height: 720 },
      dryRun: false,
    });
  });

  it('parses flags and rejects out outside tmp/', () => {
    expect(
      parseDeckSweepArgs([
        '--blueprint',
        'blueprints/decks/harbor-ops-pitch.json',
        '--out',
        'tmp/deck-sweep-k',
        '--port',
        '4927',
        '--viewport',
        '1024x768',
        '--no-shots',
        '--dry-run',
      ])
    ).toMatchObject({
      blueprint: 'blueprints/decks/harbor-ops-pitch.json',
      out: 'tmp/deck-sweep-k',
      port: 4927,
      noShots: true,
      viewport: { width: 1024, height: 768 },
      dryRun: true,
    });
    expect(() => parseDeckSweepArgs(['--out', 'artifacts/x'])).toThrow(/tmp\//);
    expect(() => parseDeckSweepArgs(['--unknown'])).toThrow(/Unknown flag/);
  });
});

describe('issue classification', () => {
  it('marks heuristics as warnings and hard failures as errors', () => {
    expect(severityFor('contrast')).toBe('warning');
    expect(severityFor('font-too-small')).toBe('warning');
    expect(severityFor('overflow')).toBe('error');
    expect(severityFor('navigation')).toBe('error');
    expect(severityFor('image-missing-alt')).toBe('error');
  });

  it('classifies slide measurements deterministically', () => {
    const measure: DeckSlideMeasure = {
      slideId: 'open',
      step: 0,
      title: 'Open',
      hasApp: true,
      overflows: ['div outside canvas'],
      smallFonts: [`12px<${MIN_BODY_PX} "tiny"`],
      images: [
        { src: 'x.png', ok: false, hasWidth: false, hasHeight: false, hasAlt: false },
        { src: 'y.png', ok: true, hasWidth: true, hasHeight: true, hasAlt: true },
      ],
      fragmentIndexes: [0, 2, 1],
      contrast: ['2.1:1 "dim"'],
    };
    const issues = classifySlideMeasure(measure);
    expect(issues.map((entry) => entry.code).sort()).toEqual(
      [
        'contrast',
        'font-too-small',
        'fragment-order',
        'image-failed',
        'image-missing-alt',
        'image-missing-dimensions',
        'overflow',
      ].sort()
    );
    expect(issues.find((entry) => entry.code === 'contrast')?.severity).toBe('warning');
    expect(issues.find((entry) => entry.code === 'overflow')?.severity).toBe('error');
  });

  it('classifies browser noise as errors', () => {
    const issues = classifyBrowserNoise('s1', 1, {
      console: ['boom'],
      pageErrors: ['throw'],
      requestFailed: ['https://example.com/x'],
    });
    expect(issues.map((entry) => entry.code).sort()).toEqual([
      'console-error',
      'page-error',
      'request-failed',
    ]);
  });

  it('summarizes and sets exit codes from errors only', () => {
    const summary = summarizeIssues([
      {
        code: 'overflow',
        severity: 'error',
        slideId: 'a',
        step: 0,
        message: 'x',
      },
      {
        code: 'contrast',
        severity: 'warning',
        slideId: 'a',
        step: 0,
        message: 'y',
      },
    ]);
    expect(summary).toEqual({ errors: 1, warnings: 1, ok: false });
    expect(exitCodeForReport({ errors: 0 })).toBe(0);
    expect(exitCodeForReport({ errors: 2 })).toBe(1);
  });
});

describe('report parse and contact sheet', () => {
  it('round-trips a built report and renders a static sheet', () => {
    const report = buildReport({
      blueprint: 'blueprints/decks/example.json',
      startedAt: '2026-10-22T00:00:00.000Z',
      finishedAt: '2026-10-22T00:00:01.000Z',
      viewport: { width: 1280, height: 720 },
      slides: [
        {
          slideId: 'open',
          step: 0,
          title: 'Open',
          shot: 'shots/open-s0.png',
          issues: [
            {
              code: 'overflow',
              severity: 'error',
              slideId: 'open',
              step: 0,
              message: 'div outside canvas',
            },
          ],
        },
      ],
    });
    expect(report.ok).toBe(false);
    expect(report.errors).toBe(1);
    const parsed = parseDeckSweepReport(JSON.parse(JSON.stringify(report)));
    expect(parsed.format).toBe('protoyard.deck-sweep');
    const html = renderDeckContactSheet(parsed);
    expect(html).toContain('Deck visual sweep');
    expect(html).toContain('open');
    expect(html).toContain('overflow');
    expect(() => parseDeckSweepReport({ format: 'nope' })).toThrow(/format/);
  });
});

describe('planDeckVisits', () => {
  it('reads the example deck fixture and plans slide visits', () => {
    const raw = JSON.parse(
      readFileSync(join(ROOT, 'blueprints/decks/example.json'), 'utf8')
    ) as unknown;
    const plan = planDeckVisits(raw);
    expect(plan.slides.length).toBeGreaterThanOrEqual(3);
    expect(plan.slides[0]?.id).toBeTruthy();
    expect(plan.slides.every((slide) => slide.stepCount >= 1)).toBe(true);
  });

  it('rejects non-deck blueprints', () => {
    expect(() => planDeckVisits({ kind: 'app' })).toThrow(/kind "deck"/);
  });
});

describe('text minima', () => {
  it('match the deck canvas constants', () => {
    expect(MIN_BODY_PX).toBe(24);
    expect(MIN_LABEL_PX).toBe(18);
  });
});
