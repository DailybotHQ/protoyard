// @vitest-environment node
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { findCandidates } from '../../../scripts/check-packages.ts';
import { lockstepState, parseArgs, syncRootVersion } from '../../../scripts/version-packages.ts';

/**
 * Release configuration: Changesets versions every public package in one
 * fixed group (ADR-028), and `pnpm version-packages` keeps the root version
 * (the one release.yml compares with the tag) in step with them.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const CONFIG_PATH = join(REPO, '.changeset', 'config.json');
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

interface ChangesetsConfig {
  fixed: string[][];
  ignore: string[];
  access: string;
  baseBranch: string;
  privatePackages: { version: boolean; tag: boolean };
}

/** The repository's own @changesets/config, reached through @changesets/cli. */
async function changesetsConfigModule(): Promise<{
  readConfig(cwd?: string): Promise<{
    config: ChangesetsConfig;
    warnings: string[];
    errors?: string[] | null;
  }>;
}> {
  const cli = createRequire(join(REPO, 'package.json')).resolve('@changesets/cli/package.json');
  const config = createRequire(cli).resolve('@changesets/config');
  return import(pathToFileURL(config).href);
}

function write(path: string, content: string | object) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`
  );
}

/** Every workspace package name with its privacy, from the real folders. */
function workspacePackages(): { name: string; private: boolean }[] {
  const out: { name: string; private: boolean }[] = [];
  for (const group of ['packages', 'apps', 'templates', 'prototypes']) {
    const base = join(REPO, group);
    if (!existsSync(base)) continue;
    for (const folder of readdirSync(base)) {
      const path = join(base, folder, 'package.json');
      if (!existsSync(path)) continue;
      const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
        name: string;
        private?: boolean;
      };
      out.push({ name: manifest.name, private: manifest.private === true });
    }
  }
  return out;
}

describe('changesets config', () => {
  it('has one fixed group for every public package and leaves private ones alone', () => {
    const written = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as ChangesetsConfig;
    expect(written.fixed).toEqual([['@protoyard/*', 'protoyard', 'create-protoyard']]);
    expect(written.ignore).toEqual([]);
    expect(written.access).toBe('public');
    expect(written.baseBranch).toBe('main');
    expect(written.privatePackages).toEqual({ version: false, tag: false });
  });

  it('validates with Changesets itself and the fixed group is exactly the publishable set', async () => {
    const { readConfig } = await changesetsConfigModule();
    const { config, errors, warnings } = await readConfig(REPO);
    expect(errors ?? []).toEqual([]);
    // Only the not-yet-created unscoped packages may be unmatched.
    for (const warning of warnings) expect(warning).toMatch(/"(protoyard|create-protoyard)"/);

    const fixed = new Set(config.fixed.flat());
    const publishable = findCandidates(REPO).map((c) => String(c.manifest.name));
    expect(publishable.length).toBeGreaterThan(20);
    expect([...fixed].sort()).toEqual([...publishable].sort());

    const privates = workspacePackages().filter((p) => p.private);
    expect(privates.length).toBeGreaterThan(20);
    for (const p of privates) expect(fixed.has(p.name), p.name).toBe(false);
  });

  it('keeps every public package and the root at one version', () => {
    const state = lockstepState(REPO);
    expect(state.version).not.toBeNull();
    expect(state.rootVersion).toBe(state.version);
  });
});

describe('changesets version-packages', () => {
  it('parses its flags', () => {
    expect(parseArgs(['--check'])).toMatchObject({ check: true });
    expect(parseArgs(['--root', 'tmp']).root.endsWith('tmp')).toBe(true);
    expect(() => parseArgs(['--bogus'])).toThrow(/Unknown option/);
  });

  it('rewrites only the root version line', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'protoyard-sync-root-')));
    roots.push(root);
    const original =
      '{\n  "name": "w",\n  "private": true,\n  "version": "1.0.0",\n  "dependencies": { "x": "1.0.0" }\n}\n';
    write(join(root, 'package.json'), original);
    expect(syncRootVersion(root, '1.0.0')).toBe(false);
    expect(syncRootVersion(root, '1.2.0')).toBe(true);
    expect(readFileSync(join(root, 'package.json'), 'utf8')).toBe(
      original.replace('"version": "1.0.0"', '"version": "1.2.0"')
    );
  });

  /**
   * A fixture pnpm workspace with the real .changeset/config.json: one minor
   * changeset on one package must move every public package and the root to
   * the same version and leave private templates and the root changelog alone.
   */
  it('bumps the whole fixed group with real changeset version and syncs the root', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'protoyard-changesets-')));
    roots.push(root);
    write(join(root, 'package.json'), {
      name: 'fixture-workspace',
      private: true,
      version: '1.0.0',
    });
    write(
      join(root, 'pnpm-workspace.yaml'),
      'packages:\n  - apps/*\n  - packages/*\n  - templates/*\n'
    );
    write(join(root, 'CHANGELOG.md'), '# Changelog\n\n## [1.0.0]\n\nHand-curated.\n');
    write(join(root, 'packages', 'core', 'package.json'), {
      name: '@protoyard/core',
      version: '1.0.0',
    });
    write(join(root, 'packages', 'ui', 'package.json'), {
      name: '@protoyard/ui',
      version: '1.0.0',
      dependencies: { '@protoyard/core': 'workspace:*' },
    });
    write(join(root, 'apps', 'gallery', 'package.json'), {
      name: '@protoyard/gallery',
      version: '1.0.0',
    });
    write(join(root, 'templates', 'blank', 'package.json'), {
      name: '@protoyard-template/blank',
      version: '0.1.0',
      private: true,
      dependencies: { '@protoyard/ui': 'workspace:*' },
    });
    write(join(root, '.changeset', 'config.json'), readFileSync(CONFIG_PATH, 'utf8'));
    write(
      join(root, '.changeset', 'fixture-change.md'),
      '---\n"@protoyard/core": minor\n---\n\nA fixture change.\n'
    );
    // The configured changelog generator resolves from the workspace root.
    const cli = dirname(
      createRequire(join(REPO, 'package.json')).resolve('@changesets/cli/package.json')
    );
    mkdirSync(join(root, 'node_modules', '@changesets'), { recursive: true });
    symlinkSync(cli, join(root, 'node_modules', '@changesets', 'cli'), 'dir');

    const result = spawnSync(
      'pnpm',
      ['exec', 'tsx', 'scripts/version-packages.ts', '--root', root],
      { cwd: REPO, encoding: 'utf8' }
    );
    expect(result.status, result.stderr + result.stdout).toBe(0);

    const version = (path: string) =>
      (JSON.parse(readFileSync(join(root, path, 'package.json'), 'utf8')) as { version: string })
        .version;
    expect(version('packages/core')).toBe('1.1.0');
    expect(version('packages/ui')).toBe('1.1.0');
    expect(version('apps/gallery')).toBe('1.1.0');
    expect(version('templates/blank')).toBe('0.1.0');
    expect(version('.')).toBe('1.1.0');
    expect(readFileSync(join(root, 'packages', 'core', 'CHANGELOG.md'), 'utf8')).toContain(
      'A fixture change.'
    );
    expect(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')).toBe(
      '# Changelog\n\n## [1.0.0]\n\nHand-curated.\n'
    );
    expect(existsSync(join(root, '.changeset', 'fixture-change.md'))).toBe(false);

    const check = spawnSync(
      'pnpm',
      ['exec', 'tsx', 'scripts/version-packages.ts', '--check', '--root', root],
      { cwd: REPO, encoding: 'utf8' }
    );
    expect(check.status).toBe(0);
  }, 120_000);

  it('--check fails when a public package drifts off the lockstep version', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'protoyard-lockstep-drift-')));
    roots.push(root);
    write(join(root, 'package.json'), { name: 'w', private: true, version: '1.0.0' });
    write(join(root, 'packages', 'a', 'package.json'), { name: '@protoyard/a', version: '1.0.0' });
    write(join(root, 'packages', 'b', 'package.json'), { name: '@protoyard/b', version: '1.1.0' });
    expect(lockstepState(root).version).toBeNull();
    const check = spawnSync(
      'pnpm',
      ['exec', 'tsx', 'scripts/version-packages.ts', '--check', '--root', root],
      { cwd: REPO, encoding: 'utf8' }
    );
    expect(check.status).toBe(1);
    expect(check.stderr).toContain('@protoyard/b@1.1.0');
  }, 60_000);
});
