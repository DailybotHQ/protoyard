import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { changedPixels, decodePng, optimizePng } from '../../scripts/lib/png.ts';
import {
  buildMatrix,
  densestScenario,
  type FitMetrics,
  fitFlags,
  layoutsFor,
  parseSweepArgs,
  renderContactSheet,
  type ShotResult,
  type SweepTarget,
  shellsFor,
  shotQuery,
  summarize,
} from '../../scripts/lib/sweep.ts';

const BANKING: SweepTarget = {
  kind: 'prototype',
  slug: 'mobile-banking-demo',
  platform: 'mobile',
  defaultScenario: 'active-customer',
  scenarios: ['new-account', 'active-customer', 'locked-account', 'offline-mode'],
};
const CRM: SweepTarget = {
  kind: 'prototype',
  slug: 'crm-demo',
  platform: 'responsive',
  defaultScenario: 'growing-team',
  scenarios: ['new-company', 'growing-team', 'mature-company', 'enterprise-scale'],
};

describe('arguments', () => {
  it('parses every flag and keeps safe defaults', () => {
    expect(parseSweepArgs([])).toEqual({
      only: [],
      shells: null,
      themes: [],
      skipBuild: false,
      templates: false,
      axe: true,
      concurrency: 2,
      compare: null,
      out: 'tmp/visual-sweep',
    });
    expect(
      parseSweepArgs([
        '--only',
        'crm-demo, mobile-banking-demo',
        '--shells',
        'none,browser',
        '--themes',
        'violet,fintech-ledger',
        '--concurrency',
        '4',
        '--compare',
        'tmp/visual-sweep-before',
        '--out',
        'tmp/visual-sweep-after',
        '--skip-build',
        '--templates',
        '--no-axe',
      ])
    ).toEqual({
      only: ['crm-demo', 'mobile-banking-demo'],
      shells: ['none', 'browser'],
      themes: ['violet', 'fintech-ledger'],
      skipBuild: true,
      templates: true,
      axe: false,
      concurrency: 4,
      compare: 'tmp/visual-sweep-before',
      out: 'tmp/visual-sweep-after',
    });
  });

  it('refuses unknown flags, unknown shells, missing values and bad concurrency', () => {
    expect(() => parseSweepArgs(['--al'])).toThrow(/Unknown argument "--al"/);
    expect(() => parseSweepArgs(['--shells', 'phone,watch'])).toThrow(/Unknown shell\(s\): watch/);
    expect(() => parseSweepArgs(['--only'])).toThrow(/--only needs a value/);
    expect(() => parseSweepArgs(['--only', '--skip-build'])).toThrow(/--only needs a value/);
    expect(() => parseSweepArgs(['--concurrency', '0'])).toThrow(/1 to 16/);
  });
});

describe('matrix', () => {
  it('picks the densest scenario by name, as layout-fit does', () => {
    expect(densestScenario(CRM.scenarios, 'growing-team')).toBe('enterprise-scale');
    expect(densestScenario(['empty', 'active', 'viewer', 'massive'])).toBe('massive');
    expect(densestScenario(['fresh', 'power-user', 'long-history'])).toBe('long-history');
    expect(densestScenario(['empty', 'busy-day', 'quiet-night'])).toBe('busy-day');
    expect(densestScenario(BANKING.scenarios, 'active-customer')).toBe('active-customer');
    expect(densestScenario([], undefined)).toBeUndefined();
  });

  it('keeps one shell per resolved picture, the manifest shell first', () => {
    expect(shellsFor(BANKING, null)).toEqual(['auto', 'tablet', 'none']);
    expect(shellsFor(CRM, null)).toEqual(['auto', 'phone', 'desktop-window', 'browser']);
    expect(shellsFor({ ...CRM, previewShell: 'widget-host' }, null)).toEqual([
      'widget-host',
      'auto',
      'phone',
      'desktop-window',
      'browser',
    ]);
    expect(shellsFor({ ...CRM, previewShell: 'none' }, null)).toEqual([
      'none',
      'phone',
      'desktop-window',
      'browser',
    ]);
    expect(shellsFor(CRM, ['browser', 'none', 'auto'])).toEqual(['browser', 'none']);
  });

  it('uses the manifest layout and its supported list, or custom', () => {
    expect(layoutsFor(CRM)).toEqual(['custom']);
    expect(
      layoutsFor({ ...CRM, layout: { id: 'sidebar', supported: ['rail', 'sidebar', 'top-nav'] } })
    ).toEqual(['sidebar', 'rail', 'top-nav']);
  });

  it('crosses shells × layouts × modes on desktop and only the own shell on the phone', () => {
    const shots = buildMatrix([BANKING, CRM], { shells: null, themes: [] });
    // Banking: 3 desktop shells × 2 modes + 1 phone shell × 2 modes = 8; CRM: 4 × 2 + 1 × 2 = 10.
    expect(shots).toHaveLength(18);
    expect(new Set(shots.map((shot) => shot.key)).size).toBe(18);
    expect(new Set(shots.map((shot) => shot.file)).size).toBe(18);
    expect(shots.filter((shot) => shot.viewport === 'phone').map((shot) => shot.shell)).toEqual([
      'auto',
      'auto',
      'auto',
      'auto',
    ]);
    expect(shots[0]).toEqual({
      key: 'prototype/mobile-banking-demo/desktop-auto-custom-light',
      kind: 'prototype',
      slug: 'mobile-banking-demo',
      viewport: 'desktop',
      shell: 'auto',
      layout: 'custom',
      mode: 'light',
      scenario: 'active-customer',
      file: 'shots/prototype-mobile-banking-demo/desktop-auto-custom-light.png',
    });
    const themed = buildMatrix([CRM], { shells: ['none'], themes: ['violet', 'fintech-ledger'] });
    expect(themed).toHaveLength((1 + 1) * 2 * 2);
    expect(themed.map((shot) => shot.theme)).toContain('fintech-ledger');
  });

  it('builds the link for a shot', () => {
    const [shot] = buildMatrix([{ ...CRM, layout: { id: 'rail' } }], {
      shells: ['browser'],
      themes: ['ocean'],
    });
    expect(shot && shotQuery(shot).toString()).toBe(
      'devtools=0&scenario=enterprise-scale&shell=browser&layout=rail&mode=light&theme=ocean'
    );
    const [plain] = buildMatrix([CRM], { shells: ['none'], themes: [] });
    expect(plain && shotQuery(plain).has('layout')).toBe(false);
  });
});

describe('layout-fit flags', () => {
  const metrics = (patch: Partial<FitMetrics>): FitMetrics => ({
    docOverflow: 0,
    documentScrolls: false,
    innerWidth: 390,
    innerHeight: 844,
    inputs: [],
    region: null,
    ...patch,
  });
  const input = (top: number, bottom: number) => ({
    label: 'textarea',
    top,
    bottom,
    left: 0,
    right: 300,
  });

  it('flags an off-screen input only when the page cannot scroll to it', () => {
    expect(fitFlags(metrics({ inputs: [input(800, 900)] }))).toEqual(['input-off-screen']);
    expect(
      fitFlags(metrics({ inputs: [input(800, 900)], docOverflow: 200, documentScrolls: true }))
    ).toEqual([]);
    expect(fitFlags(metrics({ inputs: [input(10, 60)] }))).toEqual([]);
  });

  it('flags a stuck main region and a page that overflows without scrolling', () => {
    expect(fitFlags(metrics({ region: { label: 'main', overflow: 400, scrolls: false } }))).toEqual(
      ['region-does-not-scroll']
    );
    expect(fitFlags(metrics({ docOverflow: 50, documentScrolls: false }))).toEqual([
      'page-overflow-stuck',
    ]);
    expect(fitFlags(metrics({ region: { label: 'main', overflow: 400, scrolls: true } }))).toEqual(
      []
    );
  });
});

/** A tiny RGBA PNG with the given filter on every row (all five PNG filters are valid input). */
function png(width: number, height: number, rgba: number[], filter = 0): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'latin1');
    return Buffer.concat([head, data, Buffer.alloc(4)]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows: number[] = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(filter);
    for (let x = 0; x < width * 4; x += 1) {
      const value = rgba[y * width * 4 + x] as number;
      const left = x >= 4 ? (rgba[y * width * 4 + x - 4] as number) : 0;
      // Filter 1 (Sub) encodes the difference to the left pixel.
      rows.push(filter === 1 ? (value - left) & 0xff : value);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('png', () => {
  const pixels = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 10, 20, 30, 255];

  it('decodes RGBA rows with the None and Sub filters to the same pixels', () => {
    const none = decodePng(png(2, 2, pixels, 0));
    const sub = decodePng(png(2, 2, pixels, 1));
    expect(none).toEqual({ width: 2, height: 2, pixels: new Uint8Array(pixels) });
    expect(sub.pixels).toEqual(none.pixels);
  });

  it('counts changed pixels and reports a size change as null', () => {
    const a = decodePng(png(2, 2, pixels));
    const changed = [...pixels];
    changed[12] = 11;
    expect(changedPixels(a, decodePng(png(2, 2, changed)))).toBe(1);
    expect(changedPixels(a, a)).toBe(0);
    expect(changedPixels(a, decodePng(png(1, 1, [0, 0, 0, 255])))).toBeNull();
  });

  it('rejects what it cannot decode', () => {
    expect(() => decodePng(Buffer.from('nope'))).toThrow(/not a PNG/);
  });

  it('re-compression keeps the pixels', () => {
    const original = png(2, 2, pixels);
    expect(decodePng(optimizePng(original)).pixels).toEqual(decodePng(original).pixels);
  });
});

describe('contact sheet', () => {
  const [first, second] = buildMatrix([CRM], { shells: ['none'], themes: [] });
  const results: ShotResult[] = [
    {
      ...(first as ShotResult),
      ok: true,
      axeViolations: 0,
      flags: [],
      bytes: 1000,
      ms: 900,
      changed: 0,
    },
    {
      ...(second as ShotResult),
      ok: false,
      error: 'prototype failed to boot (data-py-ready="<script>")',
      axeViolations: null,
      flags: ['region-does-not-scroll'],
      changed: 'new',
    },
  ];

  it('summarizes failures, problems and changes', () => {
    expect(summarize(results)).toEqual({ shots: 2, failed: 1, flagged: 1, changed: 1 });
  });

  it('renders a static page with lazy images, filters, badges and escaped text', () => {
    const html = renderContactSheet(results, {
      generatedAt: '2026-10-19T12:00:00.000Z',
      command: 'tsx scripts/visual-sweep.ts --only crm-demo',
      durationMs: 4200,
      compare: 'tmp/visual-sweep-before',
    });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain(
      '2 shots · 1 failed · 1 with problems · 1 changed vs tmp/visual-sweep-before'
    );
    expect(html).toContain('loading="lazy"');
    expect(html).toContain(`src="${first?.file}"`);
    expect(html).toContain('<select data-filter="shell">');
    expect(html).toContain('data-only="changed"');
    expect(html).toContain('>axe 0<');
    expect(html).toContain('region-does-not-scroll');
    expect(html).toContain('data-py-ready=&quot;&lt;script&gt;&quot;');
    expect(html).not.toContain('<script>")');
    expect(html).not.toMatch(/(?:src|href)="https?:/);
    expect(html).toContain('@media (prefers-color-scheme: dark)');
    expect(html).not.toContain('data-filter="theme"');
  });
});
