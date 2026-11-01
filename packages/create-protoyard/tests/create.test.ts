// @vitest-environment node
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { CreateError, checkTarget, isInside } from '../index.js';

/**
 * create-protoyard: a consumer workspace written atomically (staged, then
 * renamed), pinned to its own version, with a starter from the real CLI's
 * `new`; non-empty and unsafe targets refused; no network with --no-install.
 */

const PACKAGE = fileURLToPath(new URL('..', import.meta.url));
const BIN = join(PACKAGE, 'bin', 'create-protoyard.mjs');
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function temp(prefix = 'create-protoyard-test-'): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  roots.push(dir);
  return dir;
}

/** Entries left in a parent folder besides the expected ones (staging leftovers). */
const leftovers = (parent: string, keep: string[]) =>
  readdirSync(parent).filter((name) => !keep.includes(name));

function runBin(args: string[], options: { cwd: string; path?: string }) {
  const env: NodeJS.ProcessEnv = { ...process.env, CI: '1' };
  delete env.NODE_PATH;
  delete env.npm_config_user_agent;
  if (options.path) env.PATH = `${options.path}:${process.env.PATH ?? ''}`;
  return spawnSync(process.execPath, [BIN, ...args], { cwd: options.cwd, env, encoding: 'utf8' });
}

describe('helpers', () => {
  it('fences paths canonically', () => {
    const root = temp();
    expect(isInside(root, join(root, 'a', 'b'))).toBe(true);
    expect(isInside(root, join(root, '..', 'elsewhere'))).toBe(false);
  });
});

describe('checkTarget (refusals)', () => {
  it('refuses a missing name, NUL, the filesystem root, the home folder, files, symlinks and non-empty folders', () => {
    const root = temp();
    const code = (dir: string | undefined) => {
      try {
        checkTarget(dir, root);
        return 'accepted';
      } catch (error) {
        return (error as CreateError).code;
      }
    };
    expect(code(undefined)).toBe('usage');
    expect(code('  ')).toBe('usage');
    expect(code('bad\0name')).toBe('unsafe_path');
    expect(code('/')).toBe('unsafe_path');
    expect(code(homedir())).toBe('unsafe_path');
    writeFileSync(join(root, 'a-file'), 'x');
    expect(code('a-file')).toBe('conflict');
    mkdirSync(join(root, 'real'));
    symlinkSync(join(root, 'real'), join(root, 'link'));
    expect(code('link')).toBe('unsafe_path');
    mkdirSync(join(root, 'busy'));
    writeFileSync(join(root, 'busy', 'notes.txt'), 'keep me');
    expect(code('busy')).toBe('conflict');
  });
});

describe('the create-protoyard command', () => {
  it('refuses a non-empty folder with a conflict envelope and leaves it untouched', () => {
    const parent = temp();
    mkdirSync(join(parent, 'busy'));
    writeFileSync(join(parent, 'busy', 'notes.txt'), 'keep me');
    const result = runBin(['busy', '--no-install', '--no-git', '--json'], { cwd: parent });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect(readdirSync(join(parent, 'busy'))).toEqual(['notes.txt']);
    expect(leftovers(parent, ['busy'])).toEqual([]);
  });
});
