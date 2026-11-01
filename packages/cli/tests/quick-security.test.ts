// @vitest-environment node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_UNTRUSTED_BLUEPRINT_LIMITS, loadUntrustedBlueprint } from '@protoyard/blueprint';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { launcherHtml, setQuickPlayerLocator, slugFromName } from '../src/commands/quick/index.ts';
import { QUICK_PATCH_MAX_BYTES } from '../src/commands/quick/iterate.ts';
import { resolveQuickServeTarget } from '../src/commands/quick/serve.ts';
import { renderComparePage } from '../src/lib/quick/compare-html.ts';
import { renderQuickIndex } from '../src/lib/quick/index-html.ts';
import { resolveQuickDir } from '../src/lib/quick/paths.ts';
import {
  createPlayerAssetsManifest,
  readPlayerAssetsManifest,
} from '../src/lib/quick/player-assets.ts';
import { escapeScriptText, inertJson } from '../src/lib/quick/single-file.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const HOSTILE = `"><script>alert(1)</script><img src=x onerror=alert(2)>`;

describe('quick trust boundaries', () => {
  it('rejects hostile slugs and overlong briefs/blueprints at their input boundaries', () => {
    expect(slugFromName('!!!')).toBeNull();
    const ws = createWorkspace();
    try {
      expect(() =>
        resolveQuickDir({ workspaceRoot: ws.root, cwd: ws.root, slug: '../private' })
      ).toThrow();
    } finally {
      ws.cleanup();
    }
    expect(
      loadUntrustedBlueprint('x'.repeat(DEFAULT_UNTRUSTED_BLUEPRINT_LIMITS.maxBytes + 1))
    ).toMatchObject({
      success: false,
      issues: [{ code: 'too-large' }],
    });
    expect(QUICK_PATCH_MAX_BYTES).toBe(512 * 1024);
  });

  it('refuses a symlinked exploration before serving it', async () => {
    const ws = createWorkspace();
    const external = mkdtempSync(join(tmpdir(), 'quick-external-'));
    try {
      mkdirSync(join(ws.root, '.protoyard', 'quick'), { recursive: true });
      symlinkSync(external, join(ws.root, '.protoyard', 'quick', 'linked-board'));
      await expect(
        resolveQuickServeTarget({
          workspaceRoot: ws.root,
          cwd: ws.root,
          target: 'linked-board',
        })
      ).rejects.toMatchObject({ code: 'unsafe_path' });
    } finally {
      ws.cleanup();
      rmSync(external, { recursive: true, force: true });
    }
  });

  it('rejects an oversized patch before changing an exploration', async () => {
    const ws = createWorkspace();
    const appDir = join(ws.root, 'fixture-player', 'dist', 'app');
    mkdirSync(join(appDir, 'assets'), { recursive: true });
    writeFileSync(join(appDir, 'index.html'), '<!doctype html><script type="module"></script>');
    const manifest = await createPlayerAssetsManifest(appDir, '1.0.0');
    const undo = setQuickPlayerLocator(() => ({
      dir: appDir,
      packageDir: join(ws.root, 'fixture-player'),
      version: '1.0.0',
      manifest,
      source: 'repository',
    }));
    try {
      const blueprint = join(import.meta.dirname, '../../../blueprints/quick/analytics.json');
      const created = await cli([
        '--root',
        ws.root,
        '--json',
        'quick',
        '--blueprint',
        blueprint,
        '--slug',
        'security-board',
      ]);
      expect(created.code).toBe(0);
      const patchPath = join(ws.root, 'oversized-patch.json');
      writeFileSync(patchPath, `[${' '.repeat(QUICK_PATCH_MAX_BYTES)}]`);
      const result = await cli([
        '--root',
        ws.root,
        '--json',
        'quick',
        'iterate',
        'security-board',
        '--patch',
        patchPath,
      ]);
      expect(result.json<{ error: { code: string; message: string } }>().error).toMatchObject({
        code: 'validation',
        message: expect.stringContaining('larger'),
      });
    } finally {
      undo();
      ws.cleanup();
    }
  });

  it('refuses to inline a player folder that no longer matches its manifest', async () => {
    const ws = createWorkspace();
    const outside = mkdtempSync(join(tmpdir(), 'quick-outside-'));
    const appDir = join(ws.root, 'fixture-player', 'dist', 'app');
    mkdirSync(join(appDir, 'assets'), { recursive: true });
    writeFileSync(join(appDir, 'index.html'), '<!doctype html><script type="module"></script>');
    const manifest = await createPlayerAssetsManifest(appDir, '1.0.0');
    const undo = setQuickPlayerLocator(() => ({
      dir: appDir,
      packageDir: join(ws.root, 'fixture-player'),
      version: '1.0.0',
      manifest,
      source: 'repository',
    }));
    try {
      const blueprint = join(import.meta.dirname, '../../../blueprints/quick/analytics.json');
      const created = await cli([
        '--root',
        ws.root,
        '--json',
        'quick',
        '--blueprint',
        blueprint,
        '--slug',
        'linked-player',
      ]);
      expect(created.code).toBe(0);
      // Find the player copy the exploration uses and plant a link in it.
      const copies: string[] = [];
      const find = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const path = join(dir, name);
          if (statSync(path).isDirectory()) find(path);
          else if (name === 'index.html' && existsSync(join(dir, 'protoyard-player-assets.json')))
            copies.push(path);
        }
      };
      find(join(ws.root, '.protoyard', 'quick'));
      expect(copies.length).toBeGreaterThan(0);
      const secret = join(outside, 'secret.txt');
      writeFileSync(secret, 'not for sharing');
      for (const copy of copies) {
        rmSync(copy);
        symlinkSync(secret, copy);
      }
      const result = await cli([
        '--root',
        ws.root,
        '--json',
        'quick',
        'export',
        'linked-player',
        '--single-file',
      ]);
      expect(result.code).not.toBe(0);
      expect(result.json<{ error: { code: string; message: string } }>().error).toMatchObject({
        code: 'validation',
        message: expect.stringContaining('a link or special file'),
      });
    } finally {
      undo();
      ws.cleanup();
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('escapes hostile labels in launch, compare and index output', () => {
    const launch = launcherHtml(HOSTILE, HOSTILE);
    const compare = renderComparePage({
      title: HOSTILE,
      brief: HOSTILE,
      variants: [{ id: 'v1', label: HOSTILE, href: 'v1/', screenshot: null }],
    });
    const index = renderQuickIndex([
      {
        slug: 'field-visits',
        name: HOSTILE,
        source: 'brief',
        updatedAt: '2026-10-20T00:00:00.000Z',
        open: 'field-visits/index.html',
        variants: [{ label: HOSTILE, href: 'field-visits/v1/' }],
        compare: null,
        review: null,
        promotedTo: null,
      },
    ]);
    for (const html of [launch, compare, index]) {
      expect(html).not.toMatch(/<script>alert|<img src=x/);
      expect(html).toContain('&lt;script&gt;');
    }
  });

  it('keeps raw script and embedded blueprint payloads inert in single-file exports', () => {
    const source = `const note=${JSON.stringify(HOSTILE)};`;
    const escaped = escapeScriptText(source);
    expect(escaped).not.toMatch(/<\/script/i);
    expect(escaped).not.toContain('<!--');
    const payload = inertJson(JSON.stringify({ name: HOSTILE }));
    expect(payload).not.toContain('<');
    expect(JSON.parse(payload)).toEqual({ name: HOSTILE });
  });
});

describe('quick confinement', () => {
  let ws: TempWorkspace;
  let scratch: string;
  let root: string;
  beforeEach(() => {
    ws = createWorkspace();
    root = realpathSync(ws.root);
    for (const dir of ['docs', 'packages/core', 'artifacts', 'tmp']) {
      mkdirSync(join(root, dir), { recursive: true });
    }
    scratch = realpathSync(mkdtempSync(join(tmpdir(), 'protoyard-quick-outside-')));
  });
  afterEach(() => {
    ws.cleanup();
    rmSync(scratch, { recursive: true, force: true });
  });

  const inWorkspace = (slug: string, extra: { out?: string; allowExternal?: boolean } = {}) =>
    resolveQuickDir({ workspaceRoot: root, cwd: root, slug, ...extra });

  describe('quick confinement', () => {
    it('rejects traversal, separators, reserved and malformed slugs', () => {
      for (const bad of [
        '../etc',
        '..',
        'a/b',
        'a\\b',
        '/abs',
        'templates',
        'My-Idea',
        '',
        '_player',
      ]) {
        expect(() => inWorkspace(bad), bad).toThrow();
      }
    });

    it('refuses protected folders, the zone itself and the home folder as --out', () => {
      for (const out of [
        'docs',
        'packages/core/q',
        'prototypes/q',
        '.',
        '..',
        '.protoyard',
        '.protoyard/quick',
      ]) {
        expect(() => inWorkspace('q-one', { out }), out).toThrow(/Refusing/);
      }
      expect(() =>
        resolveQuickDir({
          workspaceRoot: null,
          cwd: scratch,
          slug: 'q-one',
          out: tmpdir(),
          allowExternal: true,
        })
      ).toThrow(/Refusing/);
    });

    it('refuses a symlinked .protoyard, quick zone or exploration', () => {
      // A link out of the workspace is refused as outside; one inside it as a symlink.
      symlinkSync(scratch, join(root, '.protoyard'));
      expect(() => inWorkspace('linked')).toThrow(/outside the workspace/);
      rmSync(join(root, '.protoyard'));
      mkdirSync(join(root, 'tmp', 'elsewhere'));
      symlinkSync(join(root, 'tmp', 'elsewhere'), join(root, '.protoyard'));
      expect(() => inWorkspace('linked')).toThrow(/symlink/);
      rmSync(join(root, '.protoyard'));
      mkdirSync(join(root, '.protoyard'));
      symlinkSync(join(root, 'tmp', 'elsewhere'), join(root, '.protoyard', 'quick'));
      expect(() => inWorkspace('linked')).toThrow(/symlink/);
      rmSync(join(root, '.protoyard', 'quick'));
      mkdirSync(join(root, '.protoyard', 'quick'));
      symlinkSync(join(root, 'tmp', 'elsewhere'), join(root, '.protoyard', 'quick', 'linked'));
      expect(() => inWorkspace('linked')).toThrow(/symlink/);
    });
  });
});

describe('quick prune', () => {
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

  describe('protoyard quick prune', () => {
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
        expect.objectContaining({
          slug: 'old-idea',
          reason: expect.stringMatching(/symlink|link/),
        }),
      ]);
      expect(existsSync(join(real, 'quick', 'old-idea'))).toBe(true);
      expect(old).toContain('old-idea');
    });
  });
});
