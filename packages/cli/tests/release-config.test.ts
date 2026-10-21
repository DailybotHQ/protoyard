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

/**
 * release.yml (ADR-028): on a `v*` tag the gate also builds, lints and
 * consumer-installs the packages; the `npm` job alone gets `id-token: write`
 * and publishes each pnpm-packed tarball with `npm publish --provenance` in
 * dependency order, with no npm token; the GitHub Release waits for it. The
 * workflow is read as text by job and step (no YAML dependency), and the
 * publish and dist-tag shell is run for real against a recording fake npm.
 */
const WORKFLOW = readFileSync(join(REPO, '.github', 'workflows', 'release.yml'), 'utf8');

/** The lines of one top-level job (`  <id>:` up to the next job). */
function job(id: string, workflow = WORKFLOW): string {
  const lines = workflow.split('\n');
  const start = lines.indexOf(`  ${id}:`);
  expect(start, `job ${id}`).toBeGreaterThan(-1);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}[a-z][a-z0-9-]*:\s*$/.test(line) || /^\S/.test(line));
  return [lines[start], ...(end === -1 ? rest : rest.slice(0, end))].join('\n');
}

/** Step names of a job, in order. */
function stepNames(block: string): string[] {
  return [...block.matchAll(/^ {6}- name: (.+)$/gm)].map((m) => (m[1] ?? '').trim());
}

/** The dedented `run: |` script of a named step. */
function stepRun(block: string, name: string): string {
  const lines = block.split('\n');
  const start = lines.indexOf(`      - name: ${name}`);
  expect(start, `step ${name}`).toBeGreaterThan(-1);
  const body: string[] = [];
  let inRun = false;
  for (const line of lines.slice(start + 1)) {
    if (/^ {6}- /.test(line)) break;
    if (/^ {8}run: \|\s*$/.test(line)) {
      inRun = true;
      continue;
    }
    const single = /^ {8}run: (.+)$/.exec(line);
    if (single) return single[1] ?? '';
    if (inRun) {
      if (line.trim() !== '' && !line.startsWith('          ')) break;
      body.push(line.slice(10));
    }
  }
  return body.join('\n');
}

describe('release workflow', () => {
  const gate = job('gate');
  const npmJob = job('npm');
  const release = job('release');

  it('grants id-token: write only to the npm job, behind the npm environment', () => {
    expect(WORKFLOW.match(/id-token:/g)).toHaveLength(1);
    expect(npmJob).toMatch(/^ {4}permissions:\n {6}contents: read\n {6}id-token: write$/m);
    expect(npmJob).toMatch(/^ {4}environment: npm$/m);
    // Workflow default stays read-only; the release job only writes contents.
    expect(WORKFLOW).toMatch(/^permissions:\n {2}contents: read$/m);
    expect(gate).not.toMatch(/permissions:/);
    expect(release).toMatch(/^ {4}permissions:\n {6}contents: write$/m);
  });

  it('publishes each packed tarball with provenance and no npm token', () => {
    const publish = stepRun(npmJob, 'Publish with provenance');
    expect(publish).toContain(
      'npm publish "$tarball" --provenance --access public --tag "$dist_tag"'
    );
    expect(WORKFLOW).not.toMatch(/secrets\./);
    expect(WORKFLOW).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN|_authToken/);
    expect(npmJob).toContain("registry-url: 'https://registry.npmjs.org'");
    expect(stepRun(npmJob, 'Pack every public package in dependency order')).toMatch(
      /pnpm -r .*--workspace-concurrency=1[\s\S]*pnpm pack --pack-destination "\$d"/
    );
  });

  it('pins every action to a full commit SHA with its version as a comment', () => {
    const uses = [...WORKFLOW.matchAll(/uses: (\S+)(.*)$/gm)];
    expect(uses.length).toBeGreaterThanOrEqual(5);
    for (const [line, ref, comment] of uses) {
      expect(ref, line).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
      expect(comment, line).toMatch(/^ # v\d+\.\d+\.\d+$/);
    }
  });

  it('gates the tag on lockstep versions and builds, lints and installs the packages in order', () => {
    const steps = stepNames(gate).map((name) => stepRun(gate, name));
    const at = (command: string) => steps.findIndex((run) => run.trim() === command);
    expect(at('pnpm version-packages --check')).toBeGreaterThan(-1);
    const build = at('pnpm build:packages');
    const check = at('pnpm check:packages --require-all');
    const verify = at('pnpm verify:packages');
    expect(build).toBeGreaterThan(at('pnpm check'));
    expect(check).toBeGreaterThan(build);
    expect(verify).toBeGreaterThan(check);
    expect(npmJob).toMatch(/^ {4}needs: gate$/m);
    expect(release).toMatch(/^ {4}needs: \[gate, npm\]$/m);
  });

  it('refuses a tag cut before version-packages consumed the changesets', () => {
    const script = stepRun(
      gate,
      'No pending changesets (the tag must come after version-packages)'
    );
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'protoyard-release-changesets-')));
    roots.push(root);
    write(join(root, '.changeset', 'README.md'), '# Changesets\n');
    write(join(root, '.changeset', 'config.json'), {});
    const clean = spawnSync('bash', ['-c', script], { cwd: root, encoding: 'utf8' });
    expect(clean.status, clean.stderr).toBe(0);
    write(join(root, '.changeset', 'brave-fox.md'), '---\n"@protoyard/core": minor\n---\n');
    const pending = spawnSync('bash', ['-c', script], { cwd: root, encoding: 'utf8' });
    expect(pending.status).toBe(1);
    expect(pending.stderr).toContain('brave-fox.md');
  });

  it('packs exactly the publishable set: every packages/* plus apps/gallery', () => {
    const pack = stepRun(npmJob, 'Pack every public package in dependency order');
    const filters = [...pack.matchAll(/--filter "([^"]+)"/g)].map((m) => m[1]);
    expect(filters).toEqual(['./packages/**', './apps/gallery']);
    for (const candidate of findCandidates(REPO)) {
      const dir = candidate.dir.replace(REPO, '').replace(/\\/g, '/');
      expect(dir, String(candidate.manifest.name)).toMatch(/^(packages\/[^/]+|apps\/gallery)$/);
    }
  });

  it('runs the publish script in order, skips published versions, and uses next for prereleases', () => {
    const script = stepRun(npmJob, 'Publish with provenance');
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'protoyard-release-publish-')));
    roots.push(root);
    const bin = join(root, 'bin');
    const log = join(root, 'npm.log');
    // A fake npm: `view` succeeds only for the already-published core, `publish` records.
    write(
      join(bin, 'npm'),
      `#!/bin/sh\nif [ "$1" = view ]; then [ "$2" = "@protoyard/core@1.2.0" ]; exit $?; fi\necho "$*" >> "${log}"\n`
    );
    spawnSync('chmod', ['+x', join(bin, 'npm')]);
    write(
      join(root, 'tarballs', 'order.tsv'),
      [
        '@protoyard/core\t1.2.0\t/t/protoyard-core-1.2.0.tgz',
        '@protoyard/ui\t1.2.0\t/t/with space/protoyard-ui-1.2.0.tgz',
        'protoyard\t1.2.0\t/t/protoyard-1.2.0.tgz',
        '',
      ].join('\n')
    );
    const runFor = (tag: string) => {
      rmSync(log, { force: true });
      const result = spawnSync('bash', ['-c', script], {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          TAG: tag,
          TARBALLS: join(root, 'tarballs'),
        },
      });
      expect(result.status, result.stderr).toBe(0);
      return { stdout: result.stdout, published: readFileSync(log, 'utf8').trim().split('\n') };
    };

    const stable = runFor('v1.2.0');
    expect(stable.stdout).toContain('skip @protoyard/core@1.2.0 (already published)');
    expect(stable.published).toEqual([
      'publish /t/with space/protoyard-ui-1.2.0.tgz --provenance --access public --tag latest',
      'publish /t/protoyard-1.2.0.tgz --provenance --access public --tag latest',
    ]);
    const next = runFor('v1.2.0-rc.1');
    expect(next.published.every((line) => line.endsWith('--tag next'))).toBe(true);
  });

  it.skipIf(spawnSync('jq', ['--version']).status !== 0)(
    'packs a fixture workspace in dependency order even when a prepack script prints',
    () => {
      const script = stepRun(npmJob, 'Pack every public package in dependency order');
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'protoyard-release-pack-')));
      roots.push(root);
      write(join(root, 'package.json'), { name: 'fixture', private: true, version: '1.0.0' });
      write(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n  - apps/*\n');
      // Named so that alphabetical order would be wrong: `a-ui` depends on `z-core`.
      write(join(root, 'packages', 'a-ui', 'package.json'), {
        name: '@fixture/a-ui',
        version: '1.2.0',
        files: ['index.js'],
        dependencies: { '@fixture/z-core': 'workspace:*' },
        scripts: { prepack: 'echo noisy prepack output' },
      });
      write(join(root, 'packages', 'a-ui', 'index.js'), 'export {};\n');
      write(join(root, 'packages', 'z-core', 'package.json'), {
        name: '@fixture/z-core',
        version: '1.2.0',
        files: ['index.js'],
      });
      write(join(root, 'packages', 'z-core', 'index.js'), 'export {};\n');
      write(join(root, 'apps', 'gallery', 'package.json'), {
        name: '@fixture/gallery',
        version: '1.2.0',
        files: ['index.js'],
      });
      write(join(root, 'apps', 'gallery', 'index.js'), 'export {};\n');
      // pnpm pack resolves workspace: specifiers from the linked workspace.
      const install = spawnSync('pnpm', ['install', '--offline'], { cwd: root, encoding: 'utf8' });
      expect(install.status, install.stderr + install.stdout).toBe(0);
      const tarballs = join(root, 'tarballs');
      const result = spawnSync('bash', ['-c', script], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, TARBALLS: tarballs },
      });
      expect(result.status, result.stderr).toBe(0);
      const rows = readFileSync(join(tarballs, 'order.tsv'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => line.split('\t'));
      const names = rows.map((r) => r[0]);
      expect(names.indexOf('@fixture/z-core')).toBeLessThan(names.indexOf('@fixture/a-ui'));
      expect([...names].sort()).toEqual(['@fixture/a-ui', '@fixture/gallery', '@fixture/z-core']);
      for (const [, version, tarball] of rows) {
        expect(version).toBe('1.2.0');
        expect(tarball && existsSync(tarball), tarball).toBe(true);
      }
    },
    120_000
  );

  it('refuses an npm too old for Trusted Publishing', () => {
    const script = stepRun(npmJob, 'npm supports Trusted Publishing (11.5.1 or later)');
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'protoyard-release-npm-')));
    roots.push(root);
    const check = (version: string) => {
      write(join(root, 'bin', 'npm'), `#!/bin/sh\necho ${version}\n`);
      spawnSync('chmod', ['+x', join(root, 'bin', 'npm')]);
      return spawnSync('bash', ['-c', script], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}` },
      }).status;
    };
    for (const ok of ['11.5.1', '11.6.0', '12.0.0']) expect(check(ok), ok).toBe(0);
    for (const old of ['10.9.2', '11.5.0', '11.4.9']) expect(check(old), old).toBe(1);
  });
});

/**
 * ci.yml's packages job: build, dist parity, check:packages --require-all and
 * verify:packages on every pull request, with the pnpm store and dist cached
 * and the check report uploaded on failure; the npm consumer only on main.
 */
describe('ci workflow packages job', () => {
  const CI = readFileSync(join(REPO, '.github', 'workflows', 'ci.yml'), 'utf8');
  const packages = job('packages', CI);
  const npmVariant = job('packages-npm', CI);
  const runs = (block: string) => stepNames(block).map((name) => stepRun(block, name).trim());

  it('runs build:packages, dist parity, check:packages --require-all and verify:packages in order', () => {
    const steps = runs(packages);
    const at = (pattern: RegExp) => steps.findIndex((run) => pattern.test(run));
    const install = at(/^pnpm install --frozen-lockfile$/);
    const build = at(/^pnpm build:packages$/);
    const parity = at(/^pnpm vitest run .*package-dist-parity\.test\.ts/);
    const check = at(/pnpm --silent check:packages --require-all --json \| tee /);
    const verify = at(/^pnpm verify:packages$/);
    expect(install).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(install);
    expect(parity).toBeGreaterThan(build);
    expect(check).toBeGreaterThan(parity);
    expect(verify).toBeGreaterThan(check);
    // pipefail keeps tee from hiding a failed check.
    expect(steps[check]).toMatch(/^set -o pipefail/);
  });

  it('caches the pnpm store and the built dist, rebuilding only on a cache miss', () => {
    for (const block of [packages, npmVariant]) {
      expect(block).toMatch(
        /key: pnpm-store-\$\{\{ runner\.os \}\}-\$\{\{ hashFiles\('pnpm-lock\.yaml'\) \}\}/
      );
      expect(block).toMatch(/^ {10}path: packages\/\*\/dist$/m);
      expect(block).toMatch(
        / {6}- name: Build the packages\n {8}if: steps\.dist\.outputs\.cache-hit != 'true'\n {8}run: pnpm build:packages/
      );
    }
    const distKey = (block: string) => /key: (packages-dist-.+)$/m.exec(block)?.[1];
    expect(distKey(packages)).toBeDefined();
    expect(distKey(npmVariant)).toBe(distKey(packages));
    // Every build input is in the key, and the outputs are not.
    for (const input of [
      "'packages/**'",
      "'!packages/*/dist/**'",
      "'!**/node_modules/**'",
      "'templates/**'",
      "'scripts/build-packages.ts'",
      "'scripts/lib/package-graph.ts'",
      "'tsconfig.base.json'",
      "'pnpm-lock.yaml'",
    ]) {
      expect(distKey(packages), input).toContain(input);
    }
  });

  it('uploads the check report when the job fails', () => {
    const upload = packages.slice(
      packages.indexOf('      - name: Upload the package check report')
    );
    expect(upload).toMatch(/if: failure\(\)/);
    expect(upload).toMatch(/uses: actions\/upload-artifact@[0-9a-f]{40} # v\d+\.\d+\.\d+/);
    expect(upload).toMatch(/path: artifacts\/packages\//);
  });

  it('runs the npm consumer on pushes to main only, after the pnpm job', () => {
    expect(npmVariant).toMatch(
      /^ {4}if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'$/m
    );
    expect(npmVariant).toMatch(/^ {4}needs: packages$/m);
    expect(runs(npmVariant).some((run) => /pnpm verify:packages --pm npm/.test(run))).toBe(true);
    expect(packages).not.toMatch(/^ {4}if:/m);
  });

  it('keeps every action SHA-pinned, checkouts credential-free, and no write permission', () => {
    const uses = [...CI.matchAll(/uses: (\S+)(.*)$/gm)];
    expect(uses.length).toBeGreaterThan(10);
    for (const [line, ref, comment] of uses) {
      expect(ref, line).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
      expect(comment, line).toMatch(/^ # v\d+\.\d+\.\d+$/);
    }
    const checkouts = [...CI.matchAll(/uses: actions\/checkout@\S+.*\n {8}with:\n {10}(.+)/g)];
    expect(checkouts.length).toBe([...CI.matchAll(/uses: actions\/checkout@/g)].length);
    for (const [, option] of checkouts) expect(option).toBe('persist-credentials: false');
    expect(CI).toMatch(/^permissions:\n {2}contents: read$/m);
    expect(CI).not.toMatch(/: write$/m);
  });
});
