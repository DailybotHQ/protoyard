// @vitest-environment node
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveCliBin } from '../index.js';

/**
 * `protoyard` (unscoped) runs @protoyard/cli at the same version: argv,
 * stdin/stdout/stderr and the exit code pass through unchanged, in this
 * repository and from a consumer's node_modules.
 */

const PACKAGE = fileURLToPath(new URL('..', import.meta.url));
const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const WRAPPER_BIN = join(PACKAGE, 'bin', 'protoyard.mjs');
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

interface Manifest {
  name?: string;
  version?: string;
  bin?: Record<string, string>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const manifest = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Manifest;

/** Node without the workspace's hoisted NODE_PATH, like a consumer's shell. */
function node(args: string[], options: { cwd?: string; input?: string } = {}) {
  const env = { ...process.env };
  delete env.NODE_PATH;
  return spawnSync(process.execPath, args, {
    cwd: options.cwd ?? REPO,
    env,
    encoding: 'utf8',
    input: options.input ?? '',
  });
}

function write(path: string, content: string | object) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
}

/**
 * A consumer install: node_modules/protoyard (this package's files) next to a
 * publish-shaped @protoyard/cli whose bin echoes what it received.
 */
function consumer(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'protoyard-wrapper-')));
  roots.push(root);
  const wrapper = join(root, 'node_modules', 'protoyard');
  for (const file of ['package.json', 'index.js', 'index.d.ts', 'bin/protoyard.mjs']) {
    mkdirSync(dirname(join(wrapper, file)), { recursive: true });
    copyFileSync(join(PACKAGE, file), join(wrapper, file));
  }
  const cli = join(root, 'node_modules', '@protoyard', 'cli');
  write(join(cli, 'package.json'), {
    name: '@protoyard/cli',
    version: '1.0.0',
    type: 'module',
    // As packed: dist only, import condition only, no ./package.json export.
    exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
    bin: { protoyard: './dist/bin.js' },
  });
  write(join(cli, 'dist', 'index.js'), 'export const runCli = () => {};\n');
  write(
    join(cli, 'dist', 'bin.js'),
    [
      "import { readFileSync } from 'node:fs';",
      'const args = process.argv.slice(2);',
      "const stdin = readFileSync(0, 'utf8');",
      "process.stdout.write(JSON.stringify({ args, stdin }) + '\\n');",
      "process.stderr.write('cli stderr\\n');",
      "const code = args.indexOf('--exit');",
      'process.exitCode = code >= 0 ? Number(args[code + 1]) : 0;',
      '',
    ].join('\n')
  );
  return root;
}

describe('the protoyard package', () => {
  it('has the protoyard bin and depends on @protoyard/cli at the same version', () => {
    const own = manifest(join(PACKAGE, 'package.json'));
    const cli = manifest(join(REPO, 'packages', 'cli', 'package.json'));
    expect(own.name).toBe('protoyard');
    expect(own.bin).toEqual({ protoyard: './bin/protoyard.mjs' });
    expect(own.dependencies).toEqual({ '@protoyard/cli': 'workspace:*' });
    expect(own.version).toBe(cli.version);
  });
});

describe('resolveCliBin', () => {
  it('finds a packed CLI bin from its resolved entry, and refuses bins outside the package', () => {
    const root = consumer();
    const cli = join(root, 'node_modules', '@protoyard', 'cli');
    expect(resolveCliBin(join(cli, 'dist', 'index.js'))).toBe(join(cli, 'dist', 'bin.js'));
    write(join(cli, 'package.json'), { name: '@protoyard/cli', bin: { protoyard: '../evil.js' } });
    expect(() => resolveCliBin(join(cli, 'dist', 'index.js'))).toThrow(/outside the package/);
    write(join(cli, 'package.json'), { name: '@protoyard/cli' });
    expect(() => resolveCliBin(join(cli, 'dist', 'index.js'))).toThrow(/no protoyard bin/);
  });
});

describe('the real CLI through the wrapper', () => {
  const direct = (args: string[]) =>
    node([join(REPO, 'packages', 'cli', 'bin', 'protoyard.mjs'), ...args]);
  const wrapped = (args: string[]) => node([WRAPPER_BIN, ...args]);

  it('`protoyard --version` matches the scoped CLI', () => {
    const a = wrapped(['--version']);
    const b = direct(['--version']);
    expect(a.status).toBe(0);
    expect(a.stdout.trim()).toBe(manifest(join(REPO, 'packages', 'cli', 'package.json')).version);
    expect(a.stdout).toBe(b.stdout);
  }, 60_000);
});
