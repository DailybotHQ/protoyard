import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type BuildCommandRunner, buildPackages } from '../../../scripts/build-packages.ts';

const temporaryRoots: string[] = [];

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function createPackage(
  root: string,
  name: string,
  options: {
    dependencies?: Record<string, string>;
    optedIn?: boolean;
    svelte?: boolean;
    group?: string;
    keep?: unknown;
    postBuild?: unknown;
    scripts?: Record<string, string>;
  } = {}
): string {
  const directory = join(root, 'packages', name.replace('@fixture/', ''));
  mkdirSync(join(directory, 'src'), { recursive: true });
  writeJson(join(directory, 'package.json'), {
    name,
    version: '0.0.0',
    ...(options.dependencies ? { dependencies: options.dependencies } : {}),
    ...(options.scripts ? { scripts: options.scripts } : {}),
    ...(options.optedIn === false
      ? {}
      : {
          protoyard: {
            build: {
              assets: ['src/theme.css'],
              ...(options.group ? { group: options.group } : {}),
              ...(options.keep !== undefined ? { keep: options.keep } : {}),
              ...(options.postBuild !== undefined ? { postBuild: options.postBuild } : {}),
            },
          },
        }),
  });
  if (options.svelte) writeFileSync(join(directory, 'svelte.config.js'), 'export default {};\n');
  else writeJson(join(directory, 'tsconfig.build.json'), {});
  writeFileSync(join(directory, 'src', 'theme.css'), `.${name.replaceAll('/', '-')}{color:red}\n`);
  mkdirSync(join(directory, 'dist'), { recursive: true });
  writeFileSync(join(directory, 'dist', 'stale.txt'), 'stale\n');
  return directory;
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'protoyard-build-packages-'));
  temporaryRoots.push(root);
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
  createPackage(root, '@fixture/base');
  createPackage(root, '@fixture/sibling');
  createPackage(root, '@fixture/ui', {
    dependencies: { '@fixture/base': 'workspace:*' },
    svelte: true,
  });
  createPackage(root, '@fixture/unopted', { optedIn: false });
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('build-packages', () => {
  it('builds dependency levels in order, runs siblings in parallel, copies assets, and cleans dist', async () => {
    const root = fixture();
    const calls: string[] = [];
    let active = 0;
    let peakActive = 0;
    const runner: BuildCommandRunner = async (_command, _args, cwd) => {
      calls.push(cwd);
      active += 1;
      peakActive = Math.max(peakActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      writeFileSync(join(cwd, 'dist', 'index.js'), 'export {};\n');
      active -= 1;
      return { code: 0, stdout: '', stderr: '' };
    };

    const result = await buildPackages({ root, runCommand: runner });

    expect(result.ok).toBe(true);
    expect(peakActive).toBe(2);
    expect(result.levels).toEqual([['@fixture/base', '@fixture/sibling'], ['@fixture/ui']]);
    expect(result.packages.map((pkg) => pkg.name)).toEqual([
      '@fixture/base',
      '@fixture/sibling',
      '@fixture/ui',
    ]);
    expect(calls.map((cwd) => cwd.split('/').at(-1))).toEqual(['base', 'sibling', 'ui']);
    expect(existsSync(join(root, 'packages/base/dist/stale.txt'))).toBe(false);
    expect(readFileSync(join(root, 'packages/ui/dist/theme.css'), 'utf8')).toContain('color:red');
    expect(existsSync(join(root, 'packages/unopted/dist/stale.txt'))).toBe(true);

    writeFileSync(join(root, 'packages/base/dist/stale-again.txt'), 'stale\n');
    const second = await buildPackages({ root, runCommand: runner });
    expect(second.ok).toBe(true);
    expect(existsSync(join(root, 'packages/base/dist/stale-again.txt'))).toBe(false);
  });

  it('keeps the dist folders a package lists in protoyard.build.keep and cleans the rest', async () => {
    const root = fixture();
    const dir = createPackage(root, '@fixture/player', { keep: ['app'] });
    mkdirSync(join(dir, 'dist', 'app'), { recursive: true });
    writeFileSync(join(dir, 'dist', 'app', 'index.html'), '<!doctype html>\n');
    mkdirSync(join(dir, 'dist', 'embed'), { recursive: true });
    writeFileSync(join(dir, 'dist', 'embed', 'old.js'), 'export {};\n');
    const runner: BuildCommandRunner = async (_command, _args, cwd) => {
      mkdirSync(join(cwd, 'dist', 'embed'), { recursive: true });
      writeFileSync(join(cwd, 'dist', 'embed', 'index.js'), 'export {};\n');
      return { code: 0, stdout: '', stderr: '' };
    };

    const result = await buildPackages({ root, filters: ['@fixture/player'], runCommand: runner });

    expect(result.ok).toBe(true);
    expect(readFileSync(join(dir, 'dist', 'app', 'index.html'), 'utf8')).toContain('doctype');
    expect(existsSync(join(dir, 'dist', 'embed', 'index.js'))).toBe(true);
    expect(existsSync(join(dir, 'dist', 'embed', 'old.js'))).toBe(false);
    expect(existsSync(join(dir, 'dist', 'stale.txt'))).toBe(false);
  });

  it('runs the protoyard.build.postBuild script after the compile, and fails the package when it fails', async () => {
    const root = fixture();
    const dir = createPackage(root, '@fixture/player', {
      keep: ['app'],
      postBuild: 'build',
      scripts: { build: 'vite build' },
    });
    const calls: string[] = [];
    let appFails = false;
    const runner: BuildCommandRunner = async (_command, args, cwd) => {
      if (cwd !== dir) return { code: 0, stdout: '', stderr: '' };
      calls.push(args.join(' '));
      if (args[0] === 'run') {
        if (appFails) return { code: 1, stdout: '', stderr: 'vite failed' };
        mkdirSync(join(cwd, 'dist', 'app'), { recursive: true });
        writeFileSync(join(cwd, 'dist', 'app', 'index.html'), '<!doctype html>\n');
      }
      return { code: 0, stdout: '', stderr: '' };
    };

    const result = await buildPackages({ root, filters: ['@fixture/player'], runCommand: runner });
    expect(result.ok).toBe(true);
    expect(calls.at(-1)).toBe('run build');
    expect(calls.length).toBe(2);
    expect(existsSync(join(dir, 'dist', 'app', 'index.html'))).toBe(true);

    appFails = true;
    const failed = await buildPackages({ root, filters: ['@fixture/player'], runCommand: runner });
    expect(failed.ok).toBe(false);
    expect(failed.packages.find((p) => p.name === '@fixture/player')).toMatchObject({
      status: 'failed',
      error: 'vite failed',
    });
  });

  it('refuses a postBuild entry that is not one of the package scripts', async () => {
    for (const postBuild of ['missing', 7]) {
      const root = fixture();
      createPackage(root, '@fixture/player', { postBuild, scripts: { build: 'vite build' } });
      await expect(
        buildPackages({ root, runCommand: async () => ({ code: 0, stdout: '', stderr: '' }) })
      ).rejects.toThrow(/protoyard\.build\.postBuild/);
    }
  });

  it('refuses a keep entry that is not a top-level dist folder name', async () => {
    for (const keep of [['../src'], ['app/nested'], 'app', ['']]) {
      const root = fixture();
      createPackage(root, '@fixture/player', { keep });
      await expect(
        buildPackages({ root, runCommand: async () => ({ code: 0, stdout: '', stderr: '' }) })
      ).rejects.toThrow(/protoyard\.build\.keep/);
    }
  });

  it('filters a package while retaining its buildable workspace dependencies', async () => {
    const root = fixture();
    const runner: BuildCommandRunner = async (_command, _args, cwd) => {
      writeFileSync(join(cwd, 'dist', 'index.js'), 'export {};\n');
      return { code: 0, stdout: '', stderr: '' };
    };

    const result = await buildPackages({
      root,
      filters: ['@fixture/ui'],
      runCommand: runner,
    });

    expect(result.ok).toBe(true);
    expect(result.packages.map((pkg) => pkg.name)).toEqual(['@fixture/base', '@fixture/ui']);
  });

  it("filters by build group, keeping each member's buildable dependencies", async () => {
    const root = fixture();
    createPackage(root, '@fixture/engine-a', { group: 'engine' });
    createPackage(root, '@fixture/engine-b', {
      group: 'engine',
      dependencies: { '@fixture/base': 'workspace:*' },
    });
    const runner: BuildCommandRunner = async (_command, _args, cwd) => {
      writeFileSync(join(cwd, 'dist', 'index.js'), 'export {};\n');
      return { code: 0, stdout: '', stderr: '' };
    };

    const result = await buildPackages({ root, filters: ['engine'], runCommand: runner });

    expect(result.ok).toBe(true);
    expect(result.packages.map((pkg) => pkg.name).sort()).toEqual([
      '@fixture/base',
      '@fixture/engine-a',
      '@fixture/engine-b',
    ]);
    await expect(
      buildPackages({ root, filters: ['no-such-group'], runCommand: runner })
    ).rejects.toThrow(/Unknown package filter: no-such-group/);
  });

  it('selects the svelte and engine groups, and refuses an empty or unknown group', async () => {
    const root = fixture();
    const args: string[][] = [];
    const runner: BuildCommandRunner = async (_command, commandArgs, cwd) => {
      args.push([...commandArgs]);
      writeFileSync(join(cwd, 'dist', 'index.js'), 'export {};\n');
      return { code: 0, stdout: '', stderr: '' };
    };

    const svelte = await buildPackages({ root, filters: ['svelte'], runCommand: runner });
    expect(svelte.packages.map((pkg) => pkg.name)).toEqual(['@fixture/base', '@fixture/ui']);
    const engine = await buildPackages({ root, filters: ['engine'], runCommand: runner });
    expect(engine.packages.map((pkg) => pkg.name)).toEqual(['@fixture/base', '@fixture/sibling']);
    // svelte-package gets tsconfig.build.json only when the package has one.
    expect(args.find((a) => a.includes('svelte-package'))).not.toContain('--tsconfig');
    writeJson(join(root, 'packages', 'ui', 'tsconfig.build.json'), {});
    args.length = 0;
    await buildPackages({ root, filters: ['@fixture/ui'], runCommand: runner });
    expect(args.find((a) => a.includes('svelte-package'))).toEqual([
      'exec',
      'svelte-package',
      '--input',
      'src',
      '--output',
      'dist',
      '--tsconfig',
      'tsconfig.build.json',
    ]);

    await expect(buildPackages({ root, filters: ['nope'], runCommand: runner })).rejects.toThrow(
      /Unknown package filter/
    );
    const empty = mkdtempSync(join(tmpdir(), 'protoyard-build-packages-nogroup-'));
    temporaryRoots.push(empty);
    writeFileSync(join(empty, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    createPackage(empty, '@fixture/only-tsc');
    await expect(
      buildPackages({ root: empty, filters: ['svelte'], runCommand: runner })
    ).rejects.toThrow(/No opted-in packages in the "svelte" group/);
  });

  it('builds a dependency cycle as one level after its outside dependencies, and reports it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'protoyard-build-packages-cycle-'));
    temporaryRoots.push(root);
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    createPackage(root, '@fixture/base');
    createPackage(root, '@fixture/a', {
      dependencies: { '@fixture/base': 'workspace:*', '@fixture/b': 'workspace:*' },
    });
    createPackage(root, '@fixture/b', { dependencies: { '@fixture/c': 'workspace:*' } });
    createPackage(root, '@fixture/c', { dependencies: { '@fixture/a': 'workspace:*' } });
    createPackage(root, '@fixture/top', { dependencies: { '@fixture/a': 'workspace:*' } });
    const runner: BuildCommandRunner = async (_command, _args, cwd) => {
      writeFileSync(join(cwd, 'dist', 'index.js'), 'export {};\n');
      return { code: 0, stdout: '', stderr: '' };
    };

    const result = await buildPackages({ root, runCommand: runner });

    expect(result.ok).toBe(true);
    expect(result.levels).toEqual([
      ['@fixture/base'],
      ['@fixture/a', '@fixture/b', '@fixture/c'],
      ['@fixture/top'],
    ]);
    expect(result.cycles).toEqual([['@fixture/a', '@fixture/b', '@fixture/c']]);
  });

  it('is a successful no-op when no package opts into publishing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'protoyard-build-packages-empty-'));
    temporaryRoots.push(root);
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    createPackage(root, '@fixture/unopted', { optedIn: false });

    const result = await buildPackages({
      root,
      runCommand: async () => ({ code: 0, stdout: '', stderr: '' }),
    });

    expect(result).toMatchObject({ ok: true, levels: [], packages: [] });
  });
});
