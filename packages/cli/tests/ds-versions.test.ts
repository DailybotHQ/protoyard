// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { designSystemContentHash } from '@texuli/spec/design-system';
import { afterEach, describe, expect, it } from 'vitest';
import { ReleaseRecordSchema } from '../src/lib/ds-contracts.ts';
import { compareSemver } from '../src/lib/ds-releases.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

/**
 * PLAN_013 T-versions: `ds approve --release` and `ds release` snapshot an
 * approved version into design-systems/<id>/releases/<version>.json (never
 * rewritten), `ds versions` lists them, and `ds diff` compares two versions
 * with Texuli's token diff plus the allow, library and approval changes.
 */

type Envelope<T> = {
  ok: boolean;
  data: T;
  error?: { code: string; message: string; hint?: string };
};

interface ReleaseRow {
  release: string;
  file: string;
  contentHash: string;
  approvedBy: string;
  changelog: string;
  components: number;
}

describe('design-system releases (ds approve --release, release, versions, diff)', {
  timeout: 120_000,
}, () => {
  let ws: TempWorkspace | undefined;
  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });
  const root = () => (ws as TempWorkspace).root;
  const run = (...args: string[]) => cli(['--root', root(), '--json', 'ds', ...args]);
  const path = (rel: string) => join(root(), rel);
  const read = (rel: string) =>
    JSON.parse(readFileSync(path(rel), 'utf8')) as Record<string, unknown>;
  const DOC = 'design-systems/harbor/document.json';

  /** Edits the document by hand, as a designer would (the approval goes stale). */
  function edit(change: (doc: Record<string, unknown>) => void) {
    const doc = read(DOC);
    change(doc);
    writeFileSync(path(DOC), `${JSON.stringify(doc, null, 2)}\n`);
  }

  async function created() {
    ws = createWorkspace();
    const made = await run('new', 'harbor', '--brand', '#0f766e', '--allow', 'minimal');
    expect(made.code, made.stdout).toBe(0);
  }

  it('approve --release records an immutable release with the document, hash, approver and changelog', async () => {
    await created();
    const approved = await run('approve', 'harbor', '--by', 'Ada Example', '--release', '1.0.0');
    expect(approved.code, approved.stdout).toBe(0);
    expect(approved.json<Envelope<{ release: string }>>().data.release).toBe(
      'design-systems/harbor/releases/1.0.0.json'
    );
    const record = ReleaseRecordSchema.parse(read('design-systems/harbor/releases/1.0.0.json'));
    const document = read(DOC);
    expect(record).toMatchObject({
      format: 'protoyard/ds-release',
      designSystem: 'harbor',
      release: '1.0.0',
      approvedBy: 'Ada Example',
      changelog: 'First release of harbor (1.0.0).',
      components: [],
    });
    expect(record.document).toEqual(document);
    expect(record.contentHash).toBe(designSystemContentHash(document));
    expect(record.approvedAt).toBe((document.approval as { approvedAt: string }).approvedAt);

    // A release is never rewritten, and the refusal comes before the document changes.
    const bytes = readFileSync(path(DOC), 'utf8');
    const again = await run('approve', 'harbor', '--by', 'Bo Example', '--release', '1.0.0');
    expect(again.code).not.toBe(0);
    expect(again.json<Envelope<unknown>>().error).toMatchObject({ code: 'conflict' });
    expect(readFileSync(path(DOC), 'utf8')).toBe(bytes);
    const twice = await run('release', 'harbor');
    expect(twice.json<Envelope<unknown>>().error?.code).toBe('conflict');

    // --changelog needs --release.
    const stray = await run('approve', 'harbor', '--by', 'Bo', '--changelog', 'Nothing');
    expect(stray.json<Envelope<unknown>>().error?.code).toBe('usage');
  });

  it('ds release refuses a draft and a document changed since its approval', async () => {
    await created();
    const draft = await run('release', 'harbor');
    expect(draft.code).not.toBe(0);
    expect(draft.json<Envelope<unknown>>().error?.message).toContain('is not approved');

    expect((await run('approve', 'harbor', '--by', 'Ada Example')).code).toBe(0);
    edit((doc) => {
      doc.color = { brand: { seed: '#7c3aed' } };
    });
    const stale = await run('release', 'harbor');
    expect(stale.json<Envelope<unknown>>().error?.message).toContain('changed after its approval');
    expect(existsSync(path('design-systems/harbor/releases'))).toBe(false);
  });

  it('lists releases, diffs versions with Texuli and summarizes the changes in the changelog', async () => {
    await created();
    expect((await run('approve', 'harbor', '--by', 'Ada Example', '--release', '1.0.0')).code).toBe(
      0
    );

    // 1.1.0: a new brand color and one component fewer in allow, released with `ds release`.
    edit((doc) => {
      doc.color = { brand: { seed: '#7c3aed' } };
      doc.version = '1.1.0';
      const allow = doc.allow as Record<string, unknown>;
      delete allow[Object.keys(allow).sort()[0] as string];
    });
    expect((await run('approve', 'harbor', '--by', 'Bo Example')).code).toBe(0);
    const released = await run('release', 'harbor');
    expect(released.code, released.stdout).toBe(0);
    const row = released.json<Envelope<ReleaseRow & { previous: string }>>().data;
    expect(row).toMatchObject({ release: '1.1.0', approvedBy: 'Bo Example', previous: '1.0.0' });
    expect(row.changelog).toMatch(/^Changes since 1\.0\.0: tokens \d+ changed/);
    expect(row.changelog).toContain('allow 0 added, 1 removed');

    // 1.2.0 with the approver's own changelog.
    edit((doc) => {
      doc.color = { brand: { seed: '#be123c' } };
    });
    const third = await run(
      'approve',
      'harbor',
      '--by',
      'Cy Example',
      '--release',
      '1.2.0',
      '--changelog',
      'Rose brand for the spring campaign.'
    );
    expect(third.code, third.stdout).toBe(0);
    expect(read('design-systems/harbor/releases/1.2.0.json').changelog).toBe(
      'Rose brand for the spring campaign.'
    );

    const versions = await run('versions', 'harbor');
    expect(versions.code, versions.stdout).toBe(0);
    const listed =
      versions.json<
        Envelope<{
          count: number;
          releases: ReleaseRow[];
          current: { version: string; released: boolean; baseline: string | null; status: string };
          issues: unknown[];
        }>
      >().data;
    expect(listed.count).toBe(3);
    expect(listed.releases.map((r) => r.release)).toEqual(['1.0.0', '1.1.0', '1.2.0']);
    expect(listed.current).toMatchObject({
      version: '1.2.0',
      status: 'approved',
      released: true,
      baseline: '1.1.0',
    });
    expect(listed.issues).toEqual([]);

    // Default: the current document against the newest release with other content.
    const diff = await run('diff', 'harbor');
    expect(diff.code, diff.stdout).toBe(0);
    const changes =
      diff.json<
        Envelope<{
          from: string;
          to: string;
          identical: boolean;
          contentChanged: boolean;
          tokens: { identical: boolean; tokens: { variable: string }[] };
          allow: { kind: string }[];
          approval: { field: string }[];
        }>
      >().data;
    expect(changes).toMatchObject({
      from: '1.1.0',
      to: 'current',
      identical: false,
      contentChanged: true,
    });
    expect(changes.tokens.identical).toBe(false);
    expect(changes.tokens.tokens.length).toBeGreaterThan(0);
    expect(changes.approval.map((a) => a.field)).toContain('approvedBy');

    const named = (await run('diff', 'harbor', '1.0.0', '1.1.0')).json<
      Envelope<{ allow: { kind: string; component?: string }[]; contentChanged: boolean }>
    >().data;
    expect(named.contentChanged).toBe(true);
    expect(named.allow).toEqual([{ kind: 'removed', component: expect.any(String) }]);

    const same = (await run('diff', 'harbor', '1.2.0', 'current')).json<
      Envelope<{ identical: boolean; summary: string }>
    >().data;
    expect(same).toMatchObject({ identical: true, summary: 'no content changes' });

    const unknown = await run('diff', 'harbor', '0.9.0');
    expect(unknown.json<Envelope<unknown>>().error?.code).toBe('not_found');

    // Human output names both sides.
    const text = await cli(['--root', root(), 'ds', 'diff', 'harbor', '1.0.0', '1.1.0']);
    expect(text.stdout).toContain('harbor 1.0.0 → 1.1.0');
  });

  it('reports a tampered or misnamed release as an issue instead of trusting it', async () => {
    await created();
    expect((await run('approve', 'harbor', '--by', 'Ada Example', '--release', '1.0.0')).code).toBe(
      0
    );
    const record = read('design-systems/harbor/releases/1.0.0.json');
    (record.document as Record<string, unknown>).name = 'Tampered';
    writeFileSync(path('design-systems/harbor/releases/1.0.0.json'), JSON.stringify(record));
    writeFileSync(path('design-systems/harbor/releases/latest.json'), '{}');
    const versions = (await run('versions', 'harbor')).json<
      Envelope<{ count: number; issues: { file: string; message: string }[] }>
    >().data;
    expect(versions.count).toBe(0);
    expect(versions.issues).toEqual([
      {
        file: 'design-systems/harbor/releases/1.0.0.json',
        message: 'its document does not match its contentHash',
      },
      { file: 'design-systems/harbor/releases/latest.json', message: 'is not named <semver>.json' },
    ]);
    const diff = await run('diff', 'harbor');
    expect(diff.json<Envelope<unknown>>().error?.code).toBe('not_found');
  });

  it('orders versions by semver precedence', () => {
    const versions = ['1.10.0', '1.2.0', '1.2.0-beta.2', '1.2.0-beta.10', '1.2.0-alpha', '0.9.9'];
    expect([...versions].sort(compareSemver)).toEqual([
      '0.9.9',
      '1.2.0-alpha',
      '1.2.0-beta.2',
      '1.2.0-beta.10',
      '1.2.0',
      '1.10.0',
    ]);
  });
});
