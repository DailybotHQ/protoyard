// @vitest-environment node
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
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
import { readTarball } from '../../../scripts/check-packages.ts';
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

  it('packs with the exact @protoyard/cli version and only its runtime files', () => {
    const destination = realpathSync(mkdtempSync(join(tmpdir(), 'protoyard-wrapper-pack-')));
    roots.push(destination);
    const result = spawnSync('pnpm', ['pack', '--pack-destination', destination], {
      cwd: PACKAGE,
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    const files = readTarball(readFileSync(join(destination, 'protoyard-1.0.0.tgz')));
    expect([...files.keys()].sort()).toEqual([
      'LICENSE',
      'README.md',
      'bin/protoyard.mjs',
      'index.d.ts',
      'index.js',
      'package.json',
    ]);
    const packed = JSON.parse(new TextDecoder().decode(files.get('package.json'))) as {
      dependencies: Record<string, string>;
    };
    const cliVersion = manifest(join(REPO, 'packages', 'cli', 'package.json')).version;
    expect(packed.dependencies).toEqual({ '@protoyard/cli': cliVersion });
  }, 120_000);

  it('never adds a second protoyard bin to the workspace root', () => {
    const root = manifest(join(REPO, 'package.json'));
    for (const field of ['dependencies', 'devDependencies'] as const) {
      expect(Object.keys(root[field] ?? {}), field).not.toContain('protoyard');
      expect(Object.keys(root[field] ?? {}), field).not.toContain('@protoyard/cli');
    }
    expect(root.scripts?.protoyard).toBe('tsx packages/cli/src/bin.ts');
  });
});

describe('resolveCliBin', () => {
  it('finds the CLI bin in this repository', () => {
    expect(realpathSync(resolveCliBin())).toBe(
      realpathSync(join(REPO, 'packages', 'cli', 'bin', 'protoyard.mjs'))
    );
  });

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

describe('forwarding from a consumer install', () => {
  it('passes argv, stdin, stdout, stderr and the exit code through unchanged', () => {
    const root = consumer();
    const bin = join(root, 'node_modules', 'protoyard', 'bin', 'protoyard.mjs');
    const result = node([bin, 'doctor', '--json', 'two words', '--exit', '7'], {
      cwd: root,
      input: 'piped input',
    });
    expect(result.status).toBe(7);
    expect(JSON.parse(result.stdout)).toEqual({
      args: ['doctor', '--json', 'two words', '--exit', '7'],
      stdin: 'piped input',
    });
    expect(result.stderr).toBe('cli stderr\n');
    expect(node([bin, '--version'], { cwd: root }).status).toBe(0);
  });

  it('fails with a clear message when @protoyard/cli is missing', () => {
    const root = consumer();
    rmSync(join(root, 'node_modules', '@protoyard'), { recursive: true, force: true });
    const result = node([join(root, 'node_modules', 'protoyard', 'bin', 'protoyard.mjs')], {
      cwd: root,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('@protoyard/cli is not installed');
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

  it('`protoyard doctor --json` gives the same envelope and exit code as the scoped CLI', () => {
    const a = wrapped(['doctor', '--json', '--offline']);
    const b = direct(['doctor', '--json', '--offline']);
    expect(a.status).toBe(b.status);
    const envelope = (text: string) => JSON.parse(text) as { ok: boolean; command: string };
    expect(envelope(a.stdout).command).toBe(envelope(b.stdout).command);
    expect(envelope(a.stdout).ok).toBe(envelope(b.stdout).ok);
  }, 120_000);

  it('passes a failing exit code through', () => {
    const a = wrapped(['validate', 'no-such-slug', '--json']);
    const b = direct(['validate', 'no-such-slug', '--json']);
    expect(a.status).not.toBe(0);
    expect(a.status).toBe(b.status);
    expect(existsSync(WRAPPER_BIN)).toBe(true);
  }, 60_000);
});
