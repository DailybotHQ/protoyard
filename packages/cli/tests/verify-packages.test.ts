// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  cleanChildEnvironment,
  packageDirectories,
  parseArgs,
} from '../../../scripts/verify-packages.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

describe('verify:packages', () => {
  it('accepts pnpm by default and npm explicitly', () => {
    expect(parseArgs([])).toEqual({ pm: 'pnpm', keep: false });
    expect(parseArgs(['--pm', 'npm', '--keep'])).toEqual({ pm: 'npm', keep: true });
    expect(parseArgs(['--pm=pnpm'])).toEqual({ pm: 'pnpm', keep: false });
    expect(() => parseArgs(['--pm', 'yarn'])).toThrow('--pm must be pnpm or npm');
  });

  it('discovers every non-private package and the installable gallery', () => {
    const names = packageDirectories(ROOT).map((directory) => directory.split('/').at(-1));
    expect(names).toContain('cli');
    expect(names).toContain('create-protoyard');
    expect(names).toContain('protoyard');
    expect(packageDirectories(ROOT).some((directory) => directory.endsWith('/apps/gallery'))).toBe(
      true
    );
  });

  it('unsets NODE_PATH before a consumer child resolves packages', () => {
    const env = cleanChildEnvironment();
    expect(env.NODE_PATH).toBeUndefined();
    const child = spawnSync(
      process.execPath,
      ['-e', "process.stdout.write(process.env.NODE_PATH ?? 'unset')"],
      { env, encoding: 'utf8' }
    );
    expect(child.status).toBe(0);
    expect(child.stdout).toBe('unset');
  });
});
