// @vitest-environment node
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveWorkspaceRoot, workspaceLayout } from '../src/lib/paths.ts';
import { cli } from './helpers.ts';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(packageJson: object, marker: 'pnpm' | 'npm' | 'none'): string {
  const root = mkdtempSync(join(tmpdir(), 'protoyard-layout-'));
  roots.push(root);
  writeFileSync(join(root, 'package.json'), `${JSON.stringify(packageJson)}\n`);
  if (marker === 'pnpm') {
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
  }
  if (marker === 'npm') mkdirSync(join(root, 'packages'), { recursive: true });
  return root;
}

describe('workspace layout detection', () => {
  it('keeps pnpm monorepos ahead of package.json consumer markers', () => {
    const root = fixture({ name: 'protoyard', private: true, workspaces: ['packages/*'] }, 'pnpm');
    expect(workspaceLayout(root)).toBe('monorepo');
    expect(resolveWorkspaceRoot({ cwd: join(root, 'packages') })).toBe(realpathSync(root));
  });

  it('treats an explicit protoyard marker as a consumer even with pnpm-workspace.yaml', () => {
    const root = fixture(
      { name: 'pnpm-consumer', private: true, protoyard: { workspace: 1 } },
      'pnpm'
    );
    expect(workspaceLayout(root)).toBe('consumer');
  });

  it('keeps this repository a monorepo (its root package.json has no protoyard field)', () => {
    const repo = realpathSync(join(import.meta.dirname, '..', '..', '..'));
    expect(workspaceLayout(repo)).toBe('monorepo');
  });

  it('walks up from a package folder to a protoyard consumer root', () => {
    const root = fixture({ name: 'example-consumer', protoyard: {} }, 'none');
    const child = join(root, 'apps', 'demo');
    mkdirSync(child, { recursive: true });
    expect(workspaceLayout(root)).toBe('consumer');
    expect(resolveWorkspaceRoot({ cwd: child })).toBe(realpathSync(root));
  });

  it('recognizes npm workspaces as a consumer marker', () => {
    const root = fixture({ name: 'npm-consumer', workspaces: ['apps/*'] }, 'npm');
    expect(workspaceLayout(root)).toBe('consumer');
    expect(resolveWorkspaceRoot({ cwd: join(root, 'packages') })).toBe(realpathSync(root));
  });

  it('supports the object form of npm workspaces', () => {
    const root = fixture({ name: 'npm-consumer', workspaces: { packages: ['apps/*'] } }, 'none');
    expect(workspaceLayout(root)).toBe('consumer');
  });

  it('does not treat an unmarked package as a workspace', () => {
    const root = fixture({ name: 'ordinary-package' }, 'none');
    expect(workspaceLayout(root)).toBeNull();
    expect(() => resolveWorkspaceRoot({ cwd: root })).toThrow(/No Protoyard workspace found/);
  });

  it('doctor checks a consumer layout without requiring monorepo packages', async () => {
    const root = fixture({ name: 'consumer', protoyard: {} }, 'none');
    mkdirSync(join(root, 'node_modules'));
    const result = await cli(['--root', root, '--json', 'doctor', '--offline']);
    const checks = result.json<{
      data: { checks: { id: string; status: string; detail: string }[] };
    }>().data.checks;
    expect(checks.find((check) => check.id === 'layout')).toMatchObject({
      status: 'pass',
      detail: `${realpathSync(root)} (consumer)`,
    });
    expect(checks.find((check) => check.id === 'registry')).toMatchObject({
      status: 'skip',
      detail: 'not applicable to a consumer workspace',
    });
  }, 30_000);
});
