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
  options: { dependencies?: Record<string, string>; optedIn?: boolean; svelte?: boolean } = {}
): string {
  const directory = join(root, 'packages', name.replace('@fixture/', ''));
  mkdirSync(join(directory, 'src'), { recursive: true });
  writeJson(join(directory, 'package.json'), {
    name,
    version: '0.0.0',
    ...(options.dependencies ? { dependencies: options.dependencies } : {}),
    ...(options.optedIn === false ? {} : { protoyard: { build: { assets: ['src/theme.css'] } } }),
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
