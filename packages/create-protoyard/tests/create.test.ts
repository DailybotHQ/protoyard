// @vitest-environment node
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
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
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { workspaceLayout } from '../../cli/src/lib/paths.ts';
import { parseManifest } from '../../core/src/manifest.ts';
import {
  CreateError,
  checkTarget,
  createWorkspace,
  detectPackageManager,
  isInside,
  packageNameFor,
  parseArgs,
  STARTER_SLUG,
  VERSION,
  workspaceFiles,
} from '../index.js';

/**
 * create-protoyard: a consumer workspace written atomically (staged, then
 * renamed), pinned to its own version, with a starter from the real CLI's
 * `new`; non-empty and unsafe targets refused; no network with --no-install.
 */

const PACKAGE = fileURLToPath(new URL('..', import.meta.url));
const REPO = fileURLToPath(new URL('../../../', import.meta.url));
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

const readJson = (path: string) =>
  JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;

/** Entries left in a parent folder besides the expected ones (staging leftovers). */
const leftovers = (parent: string, keep: string[]) =>
  readdirSync(parent).filter((name) => !keep.includes(name));

/**
 * A PATH whose pnpm, npm and git only record their calls, so a test can
 * prove what ran (and that nothing reaches the network).
 */
function recordingPath(): { dir: string; log: string } {
  const dir = temp('create-protoyard-bin-');
  const log = join(dir, 'calls.log');
  for (const tool of ['pnpm', 'npm', 'git']) {
    const script = join(dir, tool);
    writeFileSync(script, `#!/bin/sh\necho "${tool} $* @ $(pwd -P)" >> "${log}"\n`);
    chmodSync(script, 0o755);
  }
  return { dir, log };
}

function runBin(args: string[], options: { cwd: string; path?: string }) {
  const env: NodeJS.ProcessEnv = { ...process.env, CI: '1' };
  delete env.NODE_PATH;
  delete env.npm_config_user_agent;
  if (options.path) env.PATH = `${options.path}:${process.env.PATH ?? ''}`;
  return spawnSync(process.execPath, [BIN, ...args], { cwd: options.cwd, env, encoding: 'utf8' });
}

describe('helpers', () => {
  it('derives an npm package name from the folder', () => {
    expect(packageNameFor('My Workspace')).toBe('my-workspace');
    expect(packageNameFor('acme.prototypes')).toBe('acme.prototypes');
    expect(packageNameFor('__x__')).toBe('x__');
    expect(packageNameFor('!!!')).toBeNull();
  });

  it('picks the package manager that ran create, else pnpm', () => {
    expect(detectPackageManager('npm/11.6.0 node/v24.20.0 darwin arm64')).toBe('npm');
    expect(detectPackageManager('pnpm/11.23.0 npm/? node/v24.20.0')).toBe('pnpm');
    expect(detectPackageManager('')).toBe('pnpm');
  });

  it('parses every flag and refuses unknown ones', () => {
    expect(
      parseArgs([
        'ws',
        '-t',
        'dashboard',
        '--pm',
        'npm',
        '--no-install',
        '--no-git',
        '--yes',
        '--json',
        '--skill',
      ])
    ).toEqual({
      dir: 'ws',
      template: 'dashboard',
      pm: 'npm',
      install: false,
      git: false,
      yes: true,
      json: true,
      skill: true,
      help: false,
      version: false,
    });
    expect(() => parseArgs(['ws', '--bogus'])).toThrow(CreateError);
    expect(() => parseArgs(['ws', '--template'])).toThrow(/needs a value/);
    expect(() => parseArgs(['a', 'b'])).toThrow(/Unexpected argument "b"/);
  });

  it('fences paths canonically', () => {
    const root = temp();
    expect(isInside(root, join(root, 'a', 'b'))).toBe(true);
    expect(isInside(root, join(root, '..', 'elsewhere'))).toBe(false);
  });
});

describe('checkTarget (refusals)', () => {
  it('accepts a new or empty folder', () => {
    const root = temp();
    expect(checkTarget('fresh', root)).toEqual({ target: join(root, 'fresh'), exists: false });
    mkdirSync(join(root, 'empty'));
    writeFileSync(join(root, 'empty', '.DS_Store'), '');
    expect(checkTarget('empty', root).exists).toBe(true);
  });

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

describe('workspaceFiles', () => {
  it('pins protoyard to this version and marks the workspace for each package manager', () => {
    const pnpm = workspaceFiles({ name: 'ws', pm: 'pnpm', template: 'blank' });
    const npm = workspaceFiles({ name: 'ws', pm: 'npm', template: 'blank' });
    const pkg = pnpm['package.json'] as Record<string, unknown>;
    expect(pkg.devDependencies).toEqual({ protoyard: VERSION });
    expect(pkg.protoyard).toEqual({ workspace: 1 });
    expect(pkg.workspaces).toBeUndefined();
    expect(pnpm['pnpm-workspace.yaml']).toContain('- prototypes/*');
    expect((npm['package.json'] as Record<string, unknown>).workspaces).toEqual(['prototypes/*']);
    expect(npm['pnpm-workspace.yaml']).toBeUndefined();
    for (const name of ['AGENTS.md', '.gitignore', 'README.md', 'tsconfig.base.json']) {
      expect(typeof pnpm[name], name).toBe('string');
    }
    expect(pnpm['.gitignore']).toContain('!.env.example');
  });

  it('stays in lockstep with protoyard, and ships the repository tsconfig.base.json verbatim', () => {
    expect(VERSION).toBe(readJson(join(REPO, 'packages', 'protoyard', 'package.json')).version);
    expect(VERSION).toBe(readJson(join(REPO, 'packages', 'cli', 'package.json')).version);
    expect(readFileSync(join(PACKAGE, 'files', 'tsconfig.base.json'), 'utf8')).toBe(
      readFileSync(join(REPO, 'tsconfig.base.json'), 'utf8')
    );
  });
});

describe('createWorkspace with the real CLI (no install, no git)', () => {
  it.each(['pnpm', 'npm'] as const)(
    'creates a %s consumer workspace with a starter prototype',
    (pm) => {
      const parent = temp();
      const result = createWorkspace({
        dir: 'acme-lab',
        cwd: parent,
        pm,
        install: false,
        git: false,
        quiet: true,
      });
      const dir = join(parent, 'acme-lab');
      expect(result.dir).toBe(dir);
      expect(leftovers(parent, ['acme-lab'])).toEqual([]);
      expect(workspaceLayout(dir)).toBe('consumer');
      expect(existsSync(join(dir, '.protoyard'))).toBe(false);
      expect(existsSync(join(dir, 'pnpm-workspace.yaml'))).toBe(pm === 'pnpm');

      const root = readJson(join(dir, 'package.json'));
      expect(root.name).toBe('acme-lab');
      expect(root.devDependencies).toEqual({ protoyard: VERSION });

      const starter = join(dir, 'prototypes', STARTER_SLUG);
      expect(() => parseManifest(readJson(join(starter, 'protoyard.json')))).not.toThrow();
      expect(readJson(join(starter, 'protoyard.json')).slug).toBe(STARTER_SLUG);
      const starterPkg = readJson(join(starter, 'package.json')) as Record<
        string,
        Record<string, string>
      >;
      const ranges = { ...starterPkg.dependencies, ...starterPkg.devDependencies };
      expect(Object.values(ranges).filter((range) => range.startsWith('workspace:'))).toEqual([]);
      for (const [dep, range] of Object.entries(ranges)) {
        if (dep.startsWith('@protoyard/')) expect(range, dep).toBe(VERSION);
      }
      expect(readFileSync(join(starter, 'tsconfig.json'), 'utf8')).toContain(
        '../../tsconfig.base.json'
      );
      expect(result.files).toContain(`prototypes/${STARTER_SLUG}/protoyard.json`);
      expect(result.files).toContain('AGENTS.md');
      expect(result.install).toEqual({ skipped: true, ok: true });
      expect(result.git).toEqual({ skipped: true, ok: true });
    },
    180_000
  );

  it('fills an existing empty folder', () => {
    const parent = temp();
    mkdirSync(join(parent, 'empty'));
    createWorkspace({
      dir: 'empty',
      cwd: parent,
      pm: 'pnpm',
      install: false,
      git: false,
      quiet: true,
    });
    expect(existsSync(join(parent, 'empty', 'prototypes', STARTER_SLUG, 'protoyard.json'))).toBe(
      true
    );
    expect(leftovers(parent, ['empty'])).toEqual([]);
  }, 180_000);

  it('is atomic: a failing `new` leaves no target and no staging folder', () => {
    const parent = temp();
    expect(() =>
      createWorkspace({
        dir: 'ws',
        cwd: parent,
        template: 'no-such-template',
        install: false,
        git: false,
        quiet: true,
      })
    ).toThrow(CreateError);
    expect(readdirSync(parent)).toEqual([]);

    // A CLI that writes part of the starter and then crashes.
    const fake = join(temp(), 'fake-cli.mjs');
    writeFileSync(
      fake,
      [
        "import { mkdirSync, writeFileSync } from 'node:fs';",
        "const root = process.argv[process.argv.indexOf('--root') + 1];",
        "mkdirSync(root + '/prototypes/starter', { recursive: true });",
        "writeFileSync(root + '/prototypes/starter/half.txt', 'partial');",
        "process.stdout.write('not json');",
        'process.exit(1);',
        '',
      ].join('\n')
    );
    expect(() =>
      createWorkspace({
        dir: 'ws',
        cwd: parent,
        cliBin: fake,
        install: false,
        git: false,
        quiet: true,
      })
    ).toThrow(/protoyard new failed/);
    expect(readdirSync(parent)).toEqual([]);
  }, 180_000);
});

describe('the create-protoyard command', () => {
  it('touches no network and runs no tool with --no-install --no-git', () => {
    const parent = temp();
    const tools = recordingPath();
    const result = runBin(['ws', '--no-install', '--no-git', '--json'], {
      cwd: parent,
      path: tools.dir,
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(existsSync(tools.log)).toBe(false);
    const envelope = JSON.parse(result.stdout) as {
      ok: boolean;
      command: string;
      data: { pm: string; next: string[] };
    };
    expect(envelope).toMatchObject({ ok: true, command: 'create-protoyard', data: { pm: 'pnpm' } });
    expect(envelope.data.next).toEqual(['cd ws', 'pnpm install', 'pnpm protoyard dev starter']);
  }, 180_000);

  it('runs `<pm> install` and `git init` in the new workspace when asked', () => {
    const parent = temp();
    const tools = recordingPath();
    const result = runBin(['ws', '--pm', 'npm', '--yes', '--json'], {
      cwd: parent,
      path: tools.dir,
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(readFileSync(tools.log, 'utf8').trim().split('\n')).toEqual([
      `npm install @ ${join(parent, 'ws')}`,
      `git init -q @ ${join(parent, 'ws')}`,
    ]);
  }, 180_000);

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

  it('maps usage errors to exit 2, an unknown template to 3, and reports the skill hook', () => {
    const parent = temp();
    expect(runBin([], { cwd: parent }).status).toBe(2);
    expect(runBin(['ws', '--pm', 'yarn', '--no-install', '--no-git'], { cwd: parent }).status).toBe(
      2
    );
    const missing = runBin(['ws', '-t', 'no-such-template', '--no-install', '--no-git', '--json'], {
      cwd: parent,
    });
    expect(missing.status).toBe(3);
    expect(readdirSync(parent)).toEqual([]);
    const skill = runBin(['ws2', '--no-install', '--no-git', '--skill', '--json'], { cwd: parent });
    expect(JSON.parse(skill.stdout).data.skill).toMatchObject({
      requested: true,
      installed: false,
    });
  }, 180_000);

  it('prints help and its version', () => {
    const help = runBin(['--help'], { cwd: temp() });
    expect(help.status).toBe(0);
    for (const flag of [
      '--template',
      '--pm',
      '--no-install',
      '--no-git',
      '--yes',
      '--json',
      '--skill',
    ]) {
      expect(help.stdout).toContain(flag);
    }
    expect(runBin(['--version'], { cwd: temp() }).stdout.trim()).toBe(VERSION);
  });
});
