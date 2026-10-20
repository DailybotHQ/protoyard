// @vitest-environment node
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BUILD_MARKER,
  guardOutputDir,
  OUTPUT_MARKERS,
  QUICK_MARKER,
  quickZone,
} from '../src/lib/output-guard.ts';
import { workspacePaths } from '../src/lib/paths.ts';
import {
  QUICK_PLAYER_DIR,
  quickPlayerDir,
  resolveQuickBase,
  resolveQuickDir,
} from '../src/lib/quick/paths.ts';
import { createWorkspace, type TempWorkspace } from './helpers.ts';

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

describe('quick roots', () => {
  it('defaults to .protoyard/quick/<slug>/ in a workspace', () => {
    const quick = inWorkspace('field-visits');
    expect(quick.dir).toBe(join(root, '.protoyard', 'quick', 'field-visits'));
    expect(quick.zone).toBe(quickZone(root));
    expect(quick).toMatchObject({ inWorkspace: true, state: 'missing', custom: false });
  });

  it('uses ./.protoyard/quick/ under the working folder outside a workspace', () => {
    const quick = resolveQuickDir({ workspaceRoot: null, cwd: scratch, slug: 'idea-one' });
    expect(quick.dir).toBe(join(scratch, '.protoyard', 'quick', 'idea-one'));
    expect(quick.inWorkspace).toBe(false);
  });

  it('never uses the home folder (or an ancestor of it) directly outside a workspace', () => {
    const home = join(scratch, 'home', 'someone');
    mkdirSync(home, { recursive: true });
    expect(() => resolveQuickBase({ workspaceRoot: null, cwd: home, home })).toThrow(/home folder/);
    expect(() => resolveQuickBase({ workspaceRoot: null, cwd: scratch, home })).toThrow(
      /home folder/
    );
    expect(resolveQuickBase({ workspaceRoot: null, cwd: home, home: `${scratch}-x` }).base).toBe(
      home
    );
  });

  it('reports marked folders as existing explorations and empty ones as new', () => {
    ws.write('.protoyard/quick/again/.protoyard-quick', '{}');
    ws.write('.protoyard/quick/again/blueprint.json', '{}');
    expect(inWorkspace('again').state).toBe('marked');
    mkdirSync(join(root, '.protoyard/quick/blank'), { recursive: true });
    expect(inWorkspace('blank').state).toBe('empty');
  });

  it('puts the shared player at _player/<version>/ and refuses odd versions', () => {
    const zone = quickZone(root);
    expect(quickPlayerDir(zone, '1.2.3')).toBe(join(zone, QUICK_PLAYER_DIR, '1.2.3'));
    expect(quickPlayerDir(zone, '1.0.0-rc.1')).toBe(join(zone, QUICK_PLAYER_DIR, '1.0.0-rc.1'));
    for (const bad of ['../x', '1.0', 'latest', '1.0.0/..', '']) {
      expect(() => quickPlayerDir(zone, bad), bad).toThrow(/Refusing/);
    }
  });

  it('keeps the marker out of ZIPs and digests', () => {
    expect(OUTPUT_MARKERS.has(QUICK_MARKER)).toBe(true);
  });
});

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

  it('refuses an exploration folder with files Protoyard did not create', () => {
    ws.write('.protoyard/quick/taken/notes.txt', 'mine');
    expect(() => inWorkspace('taken')).toThrow(/did not create/);
    ws.write('artifacts/busy/index.html', 'a build');
    expect(() => inWorkspace('x-one', { out: 'artifacts/busy' })).toThrow(/did not create/);
    ws.write('tmp/built/.protoyard-out', '{}');
    expect(() => inWorkspace('x-one', { out: 'tmp/built' })).toThrow(/did not create/);
    expect(inWorkspace('x-one', { out: 'tmp/fresh' }).dir).toBe(join(root, 'tmp', 'fresh'));
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

  it('refuses nested or non-slug folders inside the zone', () => {
    for (const out of [
      '.protoyard/quick/_player',
      '.protoyard/quick/a-one/b-two',
      '.protoyard/quick/Bad',
    ]) {
      expect(() => inWorkspace('q-one', { out }), out).toThrow(/one folder named like a slug/);
    }
    expect(inWorkspace('q-one', { out: '.protoyard/quick/other-name' }).dir).toBe(
      join(root, '.protoyard/quick/other-name')
    );
  });

  it('refuses outside --out unless allowed, then only new or empty folders', () => {
    expect(() => inWorkspace('q-one', { out: join(scratch, 'new') })).toThrow(
      /outside the workspace/
    );
    expect(inWorkspace('q-one', { out: join(scratch, 'new'), allowExternal: true }).dir).toBe(
      join(scratch, 'new')
    );
    writeFileSync(join(scratch, 'precious.txt'), 'x');
    expect(() => inWorkspace('q-one', { out: scratch, allowExternal: true })).toThrow(
      /did not create/
    );
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

describe('guardOutputDir and the quick zone', () => {
  const guard = (requested: string, marker: string) =>
    guardOutputDir({ root, paths: workspacePaths(root), requested, marker });

  it('only the quick marker may write inside the zone', () => {
    expect(guard('.protoyard/quick/one-idea', QUICK_MARKER)).toBe(
      join(root, '.protoyard/quick/one-idea')
    );
    expect(() => guard('.protoyard/quick/one-idea', BUILD_MARKER)).toThrow(
      /only `protoyard quick`/
    );
  });

  it('no output may contain the zone', () => {
    for (const marker of [BUILD_MARKER, QUICK_MARKER]) {
      expect(() => guard('.protoyard', marker)).toThrow(/contains .protoyard\/quick/);
      expect(() => guard('.protoyard/quick', marker)).toThrow(/contains .protoyard\/quick/);
    }
  });
});
