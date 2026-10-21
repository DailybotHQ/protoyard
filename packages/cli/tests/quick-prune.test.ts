// @vitest-environment node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setQuickPlayerLocator } from '../src/commands/quick/index.ts';
import { parseAge } from '../src/commands/quick/prune.ts';
import {
  createPlayerAssetsManifest,
  readPlayerAssetsManifest,
} from '../src/lib/quick/player-assets.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const ANALYTICS = join(import.meta.dirname, '../../../blueprints/quick/analytics.json');
const ZONE = '.protoyard/quick';
const OLD = '2026-01-01T00:00:00.000Z';

let ws: TempWorkspace;
let restore: (() => void)[] = [];

beforeEach(async () => {
  ws = createWorkspace();
  const dir = join(ws.root, 'fixture-player', 'dist', 'app');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><title>fixture player</title><script type="module" src="./assets/app.js"></script>\n'
  );
  writeFileSync(join(dir, 'assets', 'app.js'), 'export const fixture = true;\n');
  const manifest = await createPlayerAssetsManifest(dir, '1.0.0');
  const player = {
    dir,
    packageDir: join(ws.root, 'fixture-player'),
    version: '1.0.0',
    manifest,
    source: 'repository' as const,
  };
  restore = [
    setQuickPlayerLocator(() => ({ ...player, manifest: readPlayerAssetsManifest(player.dir) })),
  ];
});
afterEach(() => {
  for (const undo of restore.splice(0)) undo();
  ws.cleanup();
});

const run = (args: string[], env: Record<string, string> = {}) =>
  cli(['--root', ws.root, '--json', 'quick', ...args], env);

/** An exploration, optionally aged by rewriting its quick.json (`updatedAt`, `promotedTo`). */
async function explore(slug: string, edit: (record: Record<string, unknown>) => void = () => {}) {
  const result = await run(['--blueprint', ANALYTICS, '--slug', slug]);
  expect(result.code, result.stderr || result.stdout).toBe(0);
  const path = join(ws.root, ZONE, slug, 'quick.json');
  const record = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  edit(record);
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  return join(ws.root, ZONE, slug);
}
const aged = (record: Record<string, unknown>) => {
  record.updatedAt = OLD;
};

interface PruneData {
  dryRun: boolean;
  candidates: { slug: string; dir: string }[];
  deleted: { slug: string }[];
  kept: { slug: string; reason: string }[];
  refused: { slug: string; reason: string }[];
}
const slugs = (items: { slug: string }[]) => items.map((item) => item.slug).sort();

describe('parseAge', () => {
  it('reads hours, days and weeks, and refuses anything else', () => {
    expect(parseAge('36h')).toBe(36 * 3_600_000);
    expect(parseAge('14d')).toBe(14 * 86_400_000);
    expect(parseAge('2w')).toBe(14 * 86_400_000);
    for (const bad of ['', '14', '1y', '-1d', '1.5d', '14 days']) {
      expect(() => parseAge(bad), bad).toThrow(/--older-than/);
    }
  });
});

describe('protoyard quick prune', () => {
  it('lists by default and removes nothing, also under CI=1', async () => {
    const old = await explore('old-idea', aged);
    await explore('fresh-idea');
    for (const env of [{}, { CI: '1' }] as Record<string, string>[]) {
      const result = await run(['prune'], env);
      expect(result.code, result.stderr || result.stdout).toBe(0);
      const data = result.json<{ data: PruneData }>().data;
      expect(data.dryRun).toBe(true);
      expect(data.candidates).toEqual([
        expect.objectContaining({ slug: 'old-idea', dir: `${ZONE}/old-idea` }),
      ]);
      expect(data.deleted).toEqual([]);
      expect(existsSync(old)).toBe(true);
    }
    const bad = await run(['prune', '--older-than', 'forever']);
    expect(bad.json<{ error: { code: string } }>().error.code).toBe('usage');
  });

  it('with --yes removes old marked explorations only; promoted, fresh, unmarked and linked folders survive', async () => {
    const old = await explore('old-idea', aged);
    const fresh = await explore('fresh-idea');
    const promoted = await explore('promoted-idea', (record) => {
      aged(record);
      record.promotedTo = { slug: 'promoted-idea', variant: null, at: OLD };
    });
    // An unmarked folder, a symlink to an old exploration outside the zone, and the player.
    const unmarked = join(ws.root, ZONE, 'not-mine');
    mkdirSync(unmarked, { recursive: true });
    writeFileSync(join(unmarked, 'notes.txt'), 'keep me');
    const outside = await explore('outside-idea', aged);
    const moved = join(ws.root, 'elsewhere-idea');
    renameSync(outside, moved);
    symlinkSync(moved, join(ws.root, ZONE, 'linked-idea'), 'dir');

    const result = await run(['prune', '--yes']);
    expect(result.code, result.stderr || result.stdout).toBe(0);
    const data = result.json<{ data: PruneData }>().data;
    expect(data.dryRun).toBe(false);
    expect(slugs(data.deleted)).toEqual(['old-idea']);
    expect(data.kept).toEqual([
      expect.objectContaining({ slug: 'promoted-idea', reason: 'promoted' }),
    ]);
    expect(existsSync(old)).toBe(false);
    for (const path of [fresh, promoted, unmarked, moved, join(ws.root, ZONE, 'linked-idea')]) {
      expect(existsSync(path), path).toBe(true);
    }
    expect(readFileSync(join(unmarked, 'notes.txt'), 'utf8')).toBe('keep me');
    expect(existsSync(join(ws.root, ZONE, '_player'))).toBe(true);

    // --older-than narrows or widens the cutoff: nothing is old enough at 1000 weeks.
    await explore('another-old', aged);
    const none = await run(['prune', '--yes', '--older-than', '9999w']);
    expect(none.json<{ data: PruneData }>().data.deleted).toEqual([]);
  });

  it('keeps an exploration whose comments are newer than its REVIEW.md, unless --force', async () => {
    const dir = await explore('reviewed-idea', aged);
    mkdirSync(join(dir, 'review'), { recursive: true });
    const store = join(dir, 'review', 'comments.json');
    writeFileSync(
      store,
      JSON.stringify({ format: 'protoyard.quick-review', formatVersion: 1, comments: [{}] })
    );
    let result = await run(['prune', '--yes']);
    expect(result.json<{ data: PruneData }>().data.kept).toEqual([
      expect.objectContaining({ slug: 'reviewed-idea', reason: 'unsaved-feedback' }),
    ]);
    expect(existsSync(dir)).toBe(true);

    // A REVIEW.md written after the comments means the feedback is saved.
    const report = join(dir, 'REVIEW.md');
    writeFileSync(report, '# Feedback\n');
    utimesSync(store, new Date('2026-01-01'), new Date('2026-01-01'));
    result = await run(['prune']);
    expect(slugs(result.json<{ data: PruneData }>().data.candidates)).toEqual(['reviewed-idea']);

    // Comments newer again, then --force removes it anyway.
    utimesSync(report, new Date('2025-01-01'), new Date('2025-01-01'));
    result = await run(['prune', '--yes', '--force']);
    expect(slugs(result.json<{ data: PruneData }>().data.deleted)).toEqual(['reviewed-idea']);
    expect(existsSync(dir)).toBe(false);
  });

  it('re-checks containment before removing: a quick zone reached through a link is refused', async () => {
    const old = await explore('old-idea', aged);
    // The workspace's .protoyard now lives elsewhere and is linked back.
    const real = join(ws.root, 'real-state');
    renameSync(join(ws.root, '.protoyard'), real);
    symlinkSync(real, join(ws.root, '.protoyard'), 'dir');
    const result = await run(['prune', '--yes']);
    expect(result.code, result.stderr || result.stdout).toBe(0);
    const data = result.json<{ data: PruneData }>().data;
    expect(data.deleted).toEqual([]);
    expect(data.refused).toEqual([
      expect.objectContaining({ slug: 'old-idea', reason: expect.stringMatching(/symlink|link/) }),
    ]);
    expect(existsSync(join(real, 'quick', 'old-idea'))).toBe(true);
    expect(old).toContain('old-idea');
  });
});
