// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { latestDeployments } from '../src/commands/review-index.ts';
import { workspacePaths } from '../src/lib/paths.ts';
import {
  appendLedgerEntry,
  LEDGER_FORMAT,
  type LedgerEntry,
  ledgerPath,
} from '../src/lib/publish-ledger.ts';
import {
  escapeHtml,
  personaLinks,
  REVIEW_FORMAT,
  type ReviewEntry,
  type ReviewModel,
  renderReviewIndex,
  scenarioLinks,
  withParam,
} from '../src/lib/review-index-html.ts';
import { addPrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const URL_A = 'https://abcdef12.protoyard-alpha-app.pages.dev/';

function deployed(overrides: Partial<ReviewEntry> = {}): ReviewEntry {
  return {
    slug: 'alpha-app',
    name: 'Alpha',
    description: 'A demo.',
    icon: '📈',
    deployment: {
      url: URL_A,
      target: 'preview',
      branch: 'pr-7',
      provider: 'cloudflare',
      at: '2026-10-18T09:30:00.000Z',
      commit: 'a'.repeat(40),
      dirty: false,
    },
    scenarioLinks: scenarioLinks(URL_A, ['growing-team', 'trial-expired']),
    personaLinks: personaLinks(URL_A, [{ id: 'user_0001', name: 'Ada Example', role: 'owner' }]),
    publishCommand: 'pnpm protoyard publish alpha-app --provider cloudflare',
    ...overrides,
  };
}

const model = (entries: ReviewEntry[]): ReviewModel => ({
  format: REVIEW_FORMAT,
  formatVersion: 1,
  title: 'Prototype review',
  base: './',
  entries,
});

function ledgerLine(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    format: LEDGER_FORMAT,
    formatVersion: 1,
    at: '2026-10-18T09:30:00.000Z',
    slug: 'alpha-app',
    provider: 'cloudflare',
    kind: 'published',
    dryRun: false,
    target: 'preview',
    branch: null,
    project: 'protoyard-alpha-app',
    url: URL_A,
    deploymentId: 'abcdef12',
    commit: null,
    dirty: null,
    buildSha256: 'b'.repeat(64),
    fileCount: 4,
    totalBytes: 1000,
    zip: null,
    zipSha256: null,
    ...overrides,
  };
}

describe('links', () => {
  it('adds scenario and actor parameters with the URL API, keeping the #route', () => {
    expect(withParam('https://x.pages.dev/#/deals/4', 'scenario', 'rep-view')).toBe(
      'https://x.pages.dev/?scenario=rep-view#/deals/4'
    );
    expect(withParam('https://x.pages.dev/?seed=3', 'actor', 'user_0002')).toBe(
      'https://x.pages.dev/?seed=3&actor=user_0002'
    );
  });

  it('drops ids the prototype runtime would ignore', () => {
    expect(scenarioLinks(URL_A, ['ok-one', 'Bad Id', '"><x']).map((l) => l.id)).toEqual(['ok-one']);
    expect(
      personaLinks(URL_A, [
        { id: 'user_0001', name: 'Ada', role: 'owner' },
        { id: 'has space', name: 'Bob', role: null },
      ]).map((l) => l.label)
    ).toEqual(['Ada (owner)']);
  });

  it('keeps the latest real deploy per slug and ignores dry runs and ZIPs', () => {
    const lines = [
      ledgerLine({ at: '2026-10-18T08:00:00.000Z', url: 'https://old.pages.dev/' }),
      ledgerLine({ at: '2026-10-18T09:00:00.000Z' }),
      ledgerLine({
        at: '2026-10-18T10:00:00.000Z',
        kind: 'dry-run',
        dryRun: true,
        url: null,
        deploymentId: null,
      }),
      ledgerLine({
        slug: 'beta-app',
        kind: 'static',
        provider: 'static',
        url: null,
        deploymentId: null,
      }),
    ] as unknown as LedgerEntry[];
    const latest = latestDeployments(lines);
    expect([...latest.keys()]).toEqual(['alpha-app']);
    expect(latest.get('alpha-app')?.url).toBe(URL_A);
  });
});

describe('renderReviewIndex', () => {
  it('escapes every manifest string and never emits a script', () => {
    const html = renderReviewIndex(
      model([
        deployed({
          name: '<script>alert(1)</script>',
          description: 'Tom & "Jerry" <img src=x onerror=alert(1)>',
          icon: '<b>',
        }),
      ])
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Tom &amp; &quot;Jerry&quot; &lt;img src=x onerror=alert(1)&gt;');
    expect(escapeHtml(`'`)).toBe('&#39;');
  });

  it('links the provider URL, scenarios and personas of a deployed prototype', () => {
    const html = renderReviewIndex(model([deployed()]));
    expect(html).toContain(`href="${URL_A}"`);
    expect(html).toContain(`href="${URL_A}?scenario=growing-team"`);
    expect(html).toContain(`href="${URL_A}?actor=user_0001"`);
    expect(html).toContain('Ada Example (owner)');
    expect(html).toContain('preview · pr-7');
    expect(html).toContain('<html lang="en">');
  });

  it('shows "not deployed" with the publish command and no guessed URL', () => {
    const html = renderReviewIndex(
      model([deployed({ deployment: null, scenarioLinks: [], personaLinks: [] })])
    );
    expect(html).toContain('not deployed');
    expect(html).toContain('pnpm protoyard publish alpha-app --provider cloudflare');
    // The only link left is the page's own manifest.
    expect([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual([
      './review-manifest.json',
    ]);
    expect(html).toContain('0 of 1 prototypes deployed');
  });

  it('is deterministic: the same model renders the same bytes', () => {
    const entries = [deployed(), deployed({ slug: 'beta-app', name: 'Beta', deployment: null })];
    expect(renderReviewIndex(model(entries))).toBe(
      renderReviewIndex(model(structuredClone(entries)))
    );
  });

  it('stays under 30 KB gzip with zero JavaScript for 50 prototypes', () => {
    const scenarios = Array.from({ length: 8 }, (_, i) => `scenario-${i + 1}`);
    const personas = Array.from({ length: 5 }, (_, i) => ({
      id: `user_000${i + 1}`,
      name: `Persona ${i + 1}`,
      role: i === 0 ? 'owner' : 'member',
    }));
    const entries = Array.from({ length: 50 }, (_, i) => {
      const url = `https://abc${String(i).padStart(5, '0')}.protoyard-app-${i}.pages.dev/`;
      return deployed({
        slug: `app-${i}`,
        name: `Prototype ${i}`,
        description: `A fictional product number ${i} with a description of reasonable length for a card.`,
        deployment: { ...(deployed().deployment as NonNullable<ReviewEntry['deployment']>), url },
        scenarioLinks: scenarioLinks(url, scenarios),
        personaLinks: personaLinks(url, personas),
      });
    });
    const html = renderReviewIndex(model(entries));
    expect(html).not.toMatch(/<script/i);
    expect(gzipSync(html, { level: 9 }).length).toBeLessThan(30 * 1024);
  });
});

describe('protoyard review-index (CLI)', () => {
  let ws: TempWorkspace;
  const read = (file: string) => readFileSync(join(ws.root, file), 'utf8');

  beforeAll(async () => {
    ws = createWorkspace();
    addPrototype(ws, 'alpha-app', {
      name: 'Alpha <app>',
      scenarios: ['growing-team', 'rep-view'],
      defaultScenario: 'growing-team',
    });
    addPrototype(ws, 'beta-app', { name: 'Beta' });
    const path = ledgerPath(workspacePaths(ws.root));
    await appendLedgerEntry(
      path,
      ledgerLine({ url: 'https://old.pages.dev/', at: '2026-10-18T08:00:00.000Z' })
    );
    await appendLedgerEntry(path, ledgerLine({ branch: 'pr-7' }));
    await appendLedgerEntry(
      path,
      ledgerLine({ slug: 'beta-app', kind: 'dry-run', dryRun: true, url: null, deploymentId: null })
    );
  });
  afterAll(() => ws.cleanup());

  it('writes index.html and review-manifest.json from the ledger, byte-identical on re-run', async () => {
    const run = await cli(['--root', ws.root, '--json', 'review-index', '--no-personas']);
    expect(run.code, run.stdout).toBe(0);
    const data = run.json<{
      data: { index: string; total: number; deployed: number; notDeployed: string[] };
    }>().data;
    expect(data).toMatchObject({
      index: 'artifacts/review/index.html',
      total: 2,
      deployed: 1,
      notDeployed: ['beta-app'],
    });
    const html = read('artifacts/review/index.html');
    expect(html).toContain(`href="${URL_A}?scenario=rep-view"`);
    expect(html).toContain('Alpha &lt;app&gt;');
    expect(html).not.toContain('old.pages.dev');
    expect(html).toContain('pnpm protoyard publish beta-app --provider cloudflare');
    const manifest = JSON.parse(read('artifacts/review/review-manifest.json')) as ReviewModel;
    expect(manifest.format).toBe(REVIEW_FORMAT);
    expect(manifest.entries.map((e) => [e.slug, e.deployment?.branch ?? null])).toEqual([
      ['alpha-app', 'pr-7'],
      ['beta-app', null],
    ]);

    await cli(['--root', ws.root, '--json', 'review-index', '--no-personas']);
    expect(read('artifacts/review/index.html')).toBe(html);
  });

  it('filters with --from-ledger or --slugs, and names --provider in the command', async () => {
    const ledgerOnly = await cli([
      '--root',
      ws.root,
      '--json',
      'review-index',
      '--no-personas',
      '--from-ledger',
    ]);
    expect(ledgerOnly.json<{ data: { total: number } }>().data.total).toBe(1);
    const one = await cli([
      '--root',
      ws.root,
      '--json',
      'review-index',
      '--no-personas',
      '--slugs',
      'beta-app',
      '--provider',
      'netlify',
      '--out',
      'artifacts/review-beta',
      '--base',
      '/review/',
    ]);
    expect(one.code).toBe(0);
    const html = read('artifacts/review-beta/index.html');
    expect(html).toContain('pnpm protoyard publish beta-app --provider netlify');
    expect(html).toContain('href="/review/review-manifest.json"');
  });

  it('reads another ledger file with --ledger', async () => {
    const other = join(ws.root, 'fixtures', 'ledger.jsonl');
    await appendLedgerEntry(
      other,
      ledgerLine({
        slug: 'beta-app',
        project: 'protoyard-beta-app',
        url: 'https://ffffffff.protoyard-beta-app.pages.dev/',
      })
    );
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'review-index',
      '--no-personas',
      '--ledger',
      'fixtures/ledger.jsonl',
      '--out',
      'artifacts/review-fixture',
    ]);
    expect(run.code, run.stdout).toBe(0);
    expect(run.json<{ data: { ledger: string; notDeployed: string[] } }>().data).toMatchObject({
      ledger: 'fixtures/ledger.jsonl',
      notDeployed: ['alpha-app'],
    });
    expect(read('artifacts/review-fixture/index.html')).toContain(
      'href="https://ffffffff.protoyard-beta-app.pages.dev/"'
    );
    const missing = await cli([
      '--root',
      ws.root,
      '--json',
      'review-index',
      '--ledger',
      'nope.jsonl',
    ]);
    expect(missing.code).toBe(3);
  });

  it('refuses bad selections and unsafe output folders', async () => {
    const base = ['--root', ws.root, '--json', 'review-index', '--no-personas'];
    expect((await cli([...base, '--from-ledger', '--slugs', 'alpha-app'])).code).toBe(2);
    expect((await cli([...base, '--slugs', 'alpha-app,no-such-app'])).code).toBe(3);
    expect((await cli([...base, '--provider', 'static'])).code).toBe(2);
    const unsafe = await cli([...base, '--out', 'prototypes/alpha-app']);
    expect(unsafe.code).not.toBe(0);
    expect(existsSync(join(ws.root, 'prototypes/alpha-app/index.html'))).toBe(false);
  });
});
