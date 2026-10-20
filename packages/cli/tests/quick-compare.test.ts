// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  COMPARE_CSP,
  type CompareModel,
  compareModelFromRecord,
  renderComparePage,
  safeRelativeUrl,
} from '../src/lib/quick/compare-html.ts';
import { createQuickRecord, type QuickRecord } from '../src/lib/quick/model.ts';

const HOSTILE = `<script>alert("x")</script><img src=x onerror=alert(1)>'"&`;

function model(overrides: Partial<CompareModel> = {}): CompareModel {
  return {
    title: 'Fieldline Inspections',
    brief: 'Schedule inspections\nand assign technicians.',
    variants: [
      { id: 'v1', label: 'Rail layout · Ocean theme', href: 'v1/', screenshot: null },
      {
        id: 'v2',
        label: 'Top Nav layout · Compact',
        href: 'v2/index.html#/inspections',
        screenshot: { path: 'shots/v2-desktop.png', width: 1280, height: 800 },
      },
    ],
    ...overrides,
  };
}

/** Attribute values for src/href in the rendered page. */
function urls(html: string): string[] {
  return [...html.matchAll(/\s(?:src|href)="([^"]*)"/g)].map((match) => match[1] as string);
}

describe('renderComparePage', () => {
  it('links and frames every variant with its label', () => {
    const html = renderComparePage(model());
    expect(html).toContain('<iframe src="v1/" title="Rail layout · Ocean theme"');
    expect(html).toContain('<a href="v1/">Open v1</a>');
    expect(html).toContain('<iframe src="v2/index.html#/inspections"');
    expect(html).toContain('<a href="v2/index.html#/inspections">Open v2</a>');
    expect(html).toContain(
      '<img class="shot" src="shots/v2-desktop.png" width="1280" height="800"'
    );
    expect(html).toContain('2 variants of one idea');
    expect(html.match(/<article/g)).toHaveLength(2);
  });

  it('escapes hostile titles, labels and briefs', () => {
    const html = renderComparePage(
      model({
        title: HOSTILE,
        brief: HOSTILE,
        variants: [{ id: 'v1', label: HOSTILE, href: 'v1/', screenshot: null }],
      })
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img src=x');
    // Quoted attribute values hold escaped text; outside them no tag may gain a handler.
    expect(html.replace(/"[^"]*"/g, '""')).not.toMatch(/<[^>]*\sonerror=/);
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('&#39;&quot;&amp;');
  });

  it('never links outside the folder', () => {
    const bad = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<b>x</b>',
      'https://example.com/v1/',
      '//example.com/v1/',
      '/etc/passwd',
      '../other/v1/',
      'v1/../../x',
      'v1\\x',
      'v1/\u0000',
      ' v1/',
      '',
    ];
    const html = renderComparePage(
      model({
        variants: bad.map((href, i) => ({
          id: `v${(i % 8) + 1}`,
          label: `bad ${i}`,
          href,
          screenshot: { path: href, width: 10, height: 10 },
        })),
      })
    );
    expect(urls(html)).toEqual([]);
    expect(html.match(/This variant has no valid link/g)).toHaveLength(bad.length);
    for (const href of bad) expect(safeRelativeUrl(href), href).toBeNull();
  });

  it('shows a screenshot only for a relative PNG and keeps ids tidy', () => {
    const html = renderComparePage(
      model({
        variants: [
          {
            id: 'v1',
            label: 'A',
            href: 'v1/',
            screenshot: { path: 'shots/a.svg', width: 1, height: 1 },
          },
          { id: '"><x', label: 'B', href: 'v2/', screenshot: null },
        ],
      })
    );
    expect(html).not.toContain('a.svg');
    expect(html).not.toContain('"><x');
    expect(html).toContain('id="v-label"');
  });

  it('ships a strict CSP whose style hash matches the inline style, and no script or network', () => {
    const html = renderComparePage(model());
    expect(html).toContain(`content="${COMPARE_CSP.replace(/'/g, '&#39;')}"`);
    expect(COMPARE_CSP).toMatch(/^default-src 'none';/);
    expect(COMPARE_CSP).not.toMatch(/script-src|unsafe-inline|https?:/);
    const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    const hash = createHash('sha256').update(style).digest('base64');
    expect(COMPARE_CSP).toContain(`'sha256-${hash}'`);
    expect(html).not.toMatch(/<script|https?:\/\//);
    expect(html).toContain('<meta name="robots" content="noindex">');
  });

  it('is deterministic', () => {
    expect(renderComparePage(model())).toBe(renderComparePage(model()));
  });
});

describe('compareModelFromRecord', () => {
  it('maps recorded variants and their first screenshot in order', () => {
    const base = createQuickRecord({
      slug: 'field-visits',
      brief: 'Track inspections.',
      blueprintSha256: 'a'.repeat(64),
      player: { version: '1.0.0', standalone: false },
      now: () => new Date('2026-10-20T12:00:00.000Z'),
    });
    const record: QuickRecord = {
      ...base,
      variants: [
        { id: 'v1', label: 'Rail layout', dir: 'v1', blueprintSha256: 'b'.repeat(64) },
        { id: 'v2', label: 'Ocean theme', dir: 'v2', blueprintSha256: 'c'.repeat(64) },
      ],
      screenshots: {
        files: [
          {
            variant: 'v2',
            path: 'shots/v2.png',
            width: 1280,
            height: 800,
            bytes: 1,
            sha256: 'd'.repeat(64),
            capturedAt: '2026-10-20T12:01:00.000Z',
          },
        ],
        skipped: null,
      },
    };
    const result = compareModelFromRecord(record, 'Fieldline', (variant) => `${variant.dir}/`);
    expect(result).toEqual({
      title: 'Fieldline',
      brief: 'Track inspections.',
      variants: [
        { id: 'v1', label: 'Rail layout', href: 'v1/', screenshot: null },
        {
          id: 'v2',
          label: 'Ocean theme',
          href: 'v2/',
          screenshot: { path: 'shots/v2.png', width: 1280, height: 800 },
        },
      ],
    });
    expect(
      compareModelFromRecord({ ...record, brief: { ...base.brief!, text: null } }, 'F', () => 'v1/')
        .brief
    ).toBeNull();
  });
});
