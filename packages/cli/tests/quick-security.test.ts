// @vitest-environment node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_UNTRUSTED_BLUEPRINT_LIMITS, loadUntrustedBlueprint } from '@protoyard/blueprint';
import { describe, expect, it } from 'vitest';
import { launcherHtml, setQuickPlayerLocator, slugFromName } from '../src/commands/quick/index.ts';
import { QUICK_PATCH_MAX_BYTES } from '../src/commands/quick/iterate.ts';
import { resolveQuickServeTarget } from '../src/commands/quick/serve.ts';
import { renderComparePage } from '../src/lib/quick/compare-html.ts';
import { renderQuickIndex } from '../src/lib/quick/index-html.ts';
import { resolveQuickDir } from '../src/lib/quick/paths.ts';
import { createPlayerAssetsManifest } from '../src/lib/quick/player-assets.ts';
import { escapeScriptText, inertJson } from '../src/lib/quick/single-file.ts';
import { cli, createWorkspace } from './helpers.ts';

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
