// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appendLedgerEntry,
  buildDigest,
  gitState,
  LEDGER_FORMAT,
  type LedgerEntry,
  parseLedgerEntry,
  readLedger,
} from '../src/lib/publish-ledger.ts';
import { addBuildablePrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const SHA = 'a'.repeat(64);

function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
    buildSha256: SHA,
    fileCount: 6,
    totalBytes: 1200,
    zip: null,
    zipSha256: null,
    ...overrides,
  };
}

const published = {
  kind: 'published',
  dryRun: false,
  url: 'https://abcdef12.protoyard-crm-demo.pages.dev',
  deploymentId: 'abcdef12',
};

describe('ledger entry schema', () => {
  it('accepts a dry run, a static ZIP and a real deploy', () => {
    expect(parseLedgerEntry(entry()).kind).toBe('dry-run');
    expect(
      parseLedgerEntry(
        entry({ provider: 'static', kind: 'static', dryRun: false, zip: 'a/b.zip', zipSha256: SHA })
      ).zip
    ).toBe('a/b.zip');
    expect(parseLedgerEntry(entry({ ...published, branch: 'pr-42' })).url).toBe(published.url);
  });

  it('refuses any field named like a credential, at any depth', () => {
    for (const key of [
      'token',
      'apiToken',
      'CLOUDFLARE_API_TOKEN',
      'secret',
      'apiKey',
      'password',
      'accountId',
    ]) {
      expect(() => parseLedgerEntry(entry({ [key]: 'x' }))).toThrow(/look like credentials/);
    }
    expect(() => parseLedgerEntry(entry({ details: { authToken: 'x' } }))).toThrow(
      /details\.authToken/
    );
    // Any other unknown field is refused by the strict schema.
    expect(() => parseLedgerEntry(entry({ note: 'x' }))).toThrow();
  });

  it('never lets a dry run or a ZIP carry a URL, and requires one for a real deploy', () => {
    expect(() => parseLedgerEntry(entry({ url: published.url }))).toThrow(/dry run has no URL/);
    expect(() =>
      parseLedgerEntry(
        entry({ provider: 'static', kind: 'static', dryRun: false, url: published.url })
      )
    ).toThrow(/only a real deploy/);
    expect(() => parseLedgerEntry(entry({ ...published, url: null }))).toThrow(
      /URL the provider printed/
    );
    expect(() =>
      parseLedgerEntry(entry({ ...published, url: 'http://insecure.pages.dev' }))
    ).toThrow();
  });
});

describe('ledger file', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'protoyard-ledger-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('appends one validated line per entry and skips unreadable lines when reading', async () => {
    const path = join(dir, 'publish', 'ledger.jsonl');
    await appendLedgerEntry(path, entry({ slug: 'one' }));
    await appendLedgerEntry(path, entry({ slug: 'two', ...published }));
    writeFileSync(path, `${readFileSync(path, 'utf8')}not json\n{"format":"other"}\n`);
    await appendLedgerEntry(path, entry({ slug: 'three' }));
    await expect(appendLedgerEntry(path, entry({ token: 'x' }))).rejects.toThrow(/credentials/);
    const read = await readLedger(path);
    expect(read.entries.map((e) => e.slug)).toEqual(['one', 'two', 'three']);
    expect(read.skipped).toBe(2);
    expect(readFileSync(path, 'utf8').trimEnd().split('\n')).toHaveLength(5);
  });

  it('reads a missing ledger as empty', async () => {
    expect(await readLedger(join(dir, 'nope.jsonl'))).toEqual({ entries: [], skipped: 0 });
  });

  it('digests a build independently of file order', () => {
    const files = [
      { path: 'index.html', sha256: SHA },
      { path: 'assets/a.js', sha256: 'b'.repeat(64) },
    ];
    expect(buildDigest(files)).toBe(buildDigest([...files].reverse()));
    expect(buildDigest(files)).not.toBe(
      buildDigest([{ ...files[0], sha256: 'c'.repeat(64) } as never, files[1] as never])
    );
    expect(buildDigest(files)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reads the commit and dirty state of a git checkout, and nulls elsewhere', async () => {
    expect(await gitState(dir)).toEqual({ commit: null, dirty: null });
    const repo = join(dir, 'repo');
    mkdirSync(repo);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
    git('init', '-q');
    writeFileSync(join(repo, 'a.txt'), 'a');
    git('add', 'a.txt');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'init');
    const clean = await gitState(repo);
    expect(clean.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(clean.dirty).toBe(false);
    writeFileSync(join(repo, 'a.txt'), 'changed');
    expect((await gitState(repo)).dirty).toBe(true);
  });
});

describe('publish records the ledger (real builds)', { timeout: 120_000 }, () => {
  let ws: TempWorkspace;
  let bin: string;
  const ledger = () => readFileSync(join(ws.root, 'artifacts/publish/ledger.jsonl'), 'utf8');
  const lines = () =>
    ledger()
      .trimEnd()
      .split('\n')
      .map((l) => JSON.parse(l) as LedgerEntry);

  beforeAll(() => {
    ws = createWorkspace();
    addBuildablePrototype(ws, 'alpha-app');
    addBuildablePrototype(ws, 'beta-app');
    addBuildablePrototype(ws, 'broken-app');
    ws.write('prototypes/broken-app/src/main.ts', 'export const = ;\n');
    // A stand-in for Wrangler that prints what the real one prints on success.
    bin = join(ws.root, 'fake-bin');
    mkdirSync(bin);
    const wrangler = join(bin, 'wrangler');
    writeFileSync(
      wrangler,
      [
        '#!/bin/sh',
        'if [ "$1" = "--version" ]; then echo "wrangler 0.0.0-test"; exit 0; fi',
        'echo "Uploading... (3/3)"',
        'echo "Deployment complete! Take a peek over at https://abcdef12.protoyard-alpha-app.pages.dev"',
        '',
      ].join('\n')
    );
    chmodSync(wrangler, 0o755);
  });
  afterAll(() => ws.cleanup());

  it('writes a dry-run line without a URL, tied to the exact build', async () => {
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'publish',
      'alpha-app',
      '--provider',
      'cloudflare',
      '--dry-run',
    ]);
    expect(run.code).toBe(0);
    expect(run.json<{ data: { ledger: string } }>().data.ledger).toBe(
      'artifacts/publish/ledger.jsonl'
    );
    const [line] = lines();
    expect(line).toMatchObject({
      slug: 'alpha-app',
      kind: 'dry-run',
      dryRun: true,
      url: null,
      deploymentId: null,
    });
    // The temp workspace is not a git checkout.
    expect(line).toMatchObject({ commit: null, dirty: null });
    const manifest = JSON.parse(
      readFileSync(join(ws.root, 'artifacts/alpha-app/build-manifest.json'), 'utf8')
    ) as {
      files: { path: string; sha256: string }[];
    };
    expect(line?.buildSha256).toBe(buildDigest(manifest.files));
  });

  it('records a real deploy with only the URL the provider printed, and no credential', async () => {
    const token = 'test-token-value-never-recorded';
    const run = await cli(
      [
        '--root',
        ws.root,
        '--json',
        'publish',
        'alpha-app',
        '--provider',
        'cloudflare',
        '--branch',
        'pr-7',
      ],
      { PATH: `${bin}:${process.env.PATH ?? ''}`, CLOUDFLARE_API_TOKEN: token }
    );
    expect(run.code, run.stdout).toBe(0);
    const last = lines().at(-1);
    expect(last).toMatchObject({
      kind: 'published',
      dryRun: false,
      branch: 'pr-7',
      url: 'https://abcdef12.protoyard-alpha-app.pages.dev',
      deploymentId: 'abcdef12',
    });
    expect(ledger()).not.toContain(token);
  });

  it('records static ZIPs and every successful slug of a batch, never the failures', async () => {
    const before = lines().length;
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'publish',
      'beta-app',
      'broken-app',
      '--provider',
      'static',
    ]);
    expect(run.code).toBe(1);
    const added = lines().slice(before);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      slug: 'beta-app',
      kind: 'static',
      url: null,
      zip: 'artifacts/beta-app/beta-app.zip',
    });
    const data = run.json<{
      data: { results: { slug: string; ledger: string | null; sha256?: string }[] };
    }>().data;
    expect(added[0]?.zipSha256).toBe(data.results.find((r) => r.slug === 'beta-app')?.sha256);
    expect(data.results.find((r) => r.slug === 'beta-app')?.ledger).toBe(
      'artifacts/publish/ledger.jsonl'
    );
  });

  it('reserves artifacts/publish so no prototype build can replace the ledger', async () => {
    addBuildablePrototype(ws, 'publish');
    const run = await cli(['--root', ws.root, '--json', 'build', 'publish']);
    expect(run.code).toBe(2);
    expect(run.json<{ error: { message: string } }>().error.message).toMatch(/collides/);
  });

  it('prints the history with filters and a limit, without needing --provider', async () => {
    const all = await cli(['--root', ws.root, '--json', 'publish', '--history']);
    expect(all.code).toBe(0);
    const data = all.json<{
      data: { total: number; shown: number; skipped: number; entries: LedgerEntry[] };
    }>().data;
    expect(data.entries.map((e) => `${e.slug}:${e.kind}`)).toEqual([
      'alpha-app:dry-run',
      'alpha-app:published',
      'beta-app:static',
    ]);
    expect(data).toMatchObject({ total: 3, shown: 3, skipped: 0 });

    const limited = await cli([
      '--root',
      ws.root,
      '--json',
      'publish',
      '--history',
      'alpha-app',
      '--limit',
      '1',
    ]);
    expect(limited.json<{ data: { total: number; entries: LedgerEntry[] } }>().data).toMatchObject({
      total: 2,
      entries: [{ slug: 'alpha-app', kind: 'published' }],
    });
    const byProvider = await cli([
      '--root',
      ws.root,
      '--json',
      'publish',
      '--history',
      '--provider',
      'static',
    ]);
    expect(
      byProvider.json<{ data: { entries: LedgerEntry[] } }>().data.entries.map((e) => e.slug)
    ).toEqual(['beta-app']);

    const human = await cli(['--root', ws.root, 'publish', '--history']);
    expect(human.stdout).toContain('https://abcdef12.protoyard-alpha-app.pages.dev');
    expect(human.stdout).toContain('dry run, nothing uploaded');

    expect(
      (await cli(['--root', ws.root, '--json', 'publish', '--history', '--limit', '0'])).code
    ).toBe(2);
    expect((await cli(['--root', ws.root, '--json', 'publish', 'alpha-app'])).code).toBe(2);
  });
});
