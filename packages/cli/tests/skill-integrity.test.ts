// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const PACK = join(REPO, 'skills', 'protoyard');
const GENERATOR = join(REPO, 'scripts', 'generate-skill-checksums.sh');
const VERIFIER = join(REPO, 'scripts', 'verify-skill-integrity.sh');
const BASH = '/bin/bash';
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temp(): string {
  const root = mkdtempSync(join(tmpdir(), 'protoyard-skill-integrity-'));
  roots.push(root);
  return root;
}

function run(script: string, args: string[]) {
  return spawnSync(BASH, [script, ...args], { encoding: 'utf8' });
}

function fixture() {
  const root = temp();
  const skillDir = join(root, 'skill');
  const sumsFile = join(root, 'SHA256SUMS');
  cpSync(PACK, skillDir, { recursive: true });
  rmSync(join(skillDir, 'SHA256SUMS'), { force: true });
  return { root, skillDir, sumsFile };
}

describe('skill checksum release scripts', () => {
  it('generates stable pack-relative sums and verifies an intact skill tree', () => {
    const { skillDir, sumsFile } = fixture();
    const args = ['--dir', skillDir, '--output', sumsFile];
    const first = run(GENERATOR, args);
    expect(first.status, first.stderr).toBe(0);
    const contents = readFileSync(sumsFile, 'utf8');
    expect(contents).toMatch(/^[0-9a-f]{64} {2}SKILL\.md$/m);
    expect(contents).not.toContain(skillDir);

    const second = run(GENERATOR, args);
    expect(second.status, second.stderr).toBe(0);
    expect(readFileSync(sumsFile, 'utf8')).toBe(contents);

    const verified = run(VERIFIER, ['--dir', skillDir, '--sums', sumsFile]);
    expect(verified.status, verified.stderr).toBe(0);
    expect(verified.stdout).toContain('Verified.');
  });

  it('rejects changed, missing, and unlisted files', () => {
    const { skillDir, sumsFile } = fixture();
    expect(run(GENERATOR, ['--dir', skillDir, '--output', sumsFile]).status).toBe(0);

    writeFileSync(join(skillDir, 'SKILL.md'), 'tampered\n');
    const changed = run(VERIFIER, ['--dir', skillDir, '--sums', sumsFile]);
    expect(changed.status).toBe(1);
    expect(changed.stderr).toContain('changed: SKILL.md');

    cpSync(PACK, skillDir, { recursive: true, force: true });
    rmSync(join(skillDir, 'references', 'install.md'));
    const missing = run(VERIFIER, ['--dir', skillDir, '--sums', sumsFile]);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('missing: references/install.md');

    cpSync(PACK, skillDir, { recursive: true, force: true });
    writeFileSync(join(skillDir, 'unexpected.md'), 'extra\n');
    const extra = run(VERIFIER, ['--dir', skillDir, '--sums', sumsFile]);
    expect(extra.status).toBe(1);
    expect(extra.stderr).toContain('unlisted: unexpected.md');
  });

  it('rejects an absent or malformed manifest', () => {
    const { skillDir, sumsFile } = fixture();
    const absent = run(VERIFIER, ['--dir', skillDir, '--sums', sumsFile]);
    expect(absent.status).toBe(1);
    expect(absent.stderr).toContain('no SHA256SUMS');

    writeFileSync(sumsFile, 'not-a-hash  SKILL.md\n');
    const malformed = run(VERIFIER, ['--dir', skillDir, '--sums', sumsFile]);
    expect(malformed.status).toBe(1);
    expect(malformed.stderr).toContain('malformed SHA256SUMS line');
  });
});

describe('setup.sh', () => {
  /**
   * skills/protoyard/setup.sh: the host map matches references/hosts.md, every
   * host installs into a supplied home (never the real one), existing
   * destinations are handled predictably, and --verify checks SHA256SUMS. It
   * runs under /bin/bash, which is Bash 3.2 on macOS.
   */

  const REPO = fileURLToPath(new URL('../../../', import.meta.url));
  const PACK = join(REPO, 'skills', 'protoyard');
  const SCRIPT = join(PACK, 'setup.sh');
  const BASH = existsSync('/bin/bash') ? '/bin/bash' : 'bash';

  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  function temp(prefix: string): string {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
    roots.push(dir);
    return dir;
  }

  /** A home the test watches: any write outside the supplied home lands here. */
  function sentinelHome(): string {
    return temp('protoyard-real-home-');
  }

  function run(args: string[], options: { script?: string; home?: string } = {}) {
    const result = spawnSync(BASH, [options.script ?? SCRIPT, ...args], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: options.home ?? sentinelHome() },
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  function files(dir: string): string[] {
    const out: string[] = [];
    const walk = (current: string) => {
      for (const name of readdirSync(current)) {
        const path = join(current, name);
        if (statSync(path).isDirectory()) walk(path);
        else out.push(relative(dir, path));
      }
    };
    walk(dir);
    return out.sort();
  }

  /** A copy of the pack with a SHA256SUMS over every file. */
  function packWithSums(): string {
    const dir = join(temp('protoyard-verify-'), 'protoyard');
    cpSync(PACK, dir, { recursive: true });
    const lines = files(dir).map(
      (rel) =>
        `${createHash('sha256')
          .update(readFileSync(join(dir, rel)))
          .digest('hex')}  ${rel}`
    );
    writeFileSync(join(dir, 'SHA256SUMS'), `${lines.join('\n')}\n`);
    return dir;
  }

  describe('setup.sh install', () => {
    it('refuses another Protoyard version unless --replace, and keeps a backup outside the skills directory', () => {
      const home = temp('protoyard-home-replace-');
      expect(run(['--host', 'codex', '--home', home]).status).toBe(0);
      const target = join(home, '.codex', 'skills', 'protoyard');
      const manifest = join(target, 'SKILL.md');
      const older = readFileSync(manifest, 'utf8').replace(/^version: ".*"$/m, 'version: "0.9.0"');
      writeFileSync(manifest, older);

      const refused = run(['--host', 'codex', '--home', home]);
      expect(refused.status).toBe(3);
      expect(refused.stderr).toContain('0.9.0');
      expect(readFileSync(manifest, 'utf8')).toBe(older);

      expect(run(['--host', 'codex', '--home', home, '--replace', '--dry-run']).status).toBe(0);
      expect(readFileSync(manifest, 'utf8')).toBe(older);

      const replaced = run(['--host', 'codex', '--home', home, '--replace']);
      expect(replaced.status, replaced.stderr).toBe(0);
      expect(readFileSync(manifest, 'utf8')).toBe(readFileSync(join(PACK, 'SKILL.md'), 'utf8'));
      const backups = readdirSync(join(home, '.protoyard', 'skill-backups'));
      expect(backups).toHaveLength(1);
      expect(backups[0]).toMatch(/^codex-\d{8}T\d{6}Z$/);
      expect(
        readFileSync(
          join(home, '.protoyard', 'skill-backups', backups[0] ?? '', 'protoyard', 'SKILL.md'),
          'utf8'
        )
      ).toBe(older);
      expect(readdirSync(join(home, '.codex', 'skills'))).toEqual(['protoyard']);
    });
  });

  // Each test spawns setup.sh several times; a loaded machine needs more than the 5 s default.
  describe('setup.sh --verify', { timeout: 30_000 }, () => {
    it('refuses unsafe SHA256SUMS paths and a missing SHA256SUMS', () => {
      const unsafe = packWithSums();
      writeFileSync(
        join(unsafe, 'SHA256SUMS'),
        `${readFileSync(join(unsafe, 'SHA256SUMS'), 'utf8')}${'0'.repeat(64)}  ../outside.txt\n`
      );
      const u = run(['--verify'], { script: join(unsafe, 'setup.sh') });
      expect(u.status).toBe(1);
      expect(u.stderr).toContain('unsafe path in SHA256SUMS: ../outside.txt');

      const none = run(['--verify']);
      expect(none.status).toBe(1);
      expect(none.stderr).toContain('no SHA256SUMS');
    });
  });
});

describe('tagged skill release smoke script', () => {
  const REPO = fileURLToPath(new URL('../../../', import.meta.url));
  const PACK = join(REPO, 'skills', 'protoyard');
  const SCRIPT = join(REPO, 'scripts', 'smoke-install-skill.sh');
  const BASH = '/bin/bash';
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function fixture() {
    const root = mkdtempSync(join(REPO, 'tmp', 'skill-release-smoke-test-'));
    roots.push(root);
    const bin = join(root, 'bin');
    const callLog = join(root, 'npx-args.txt');
    mkdirSync(bin);
    writeFileSync(
      join(bin, 'npx'),
      '#!/bin/sh\nset -eu\nprintf "%s\\n" "$*" > "$CALL_LOG"\nmkdir -p "$HOME/.agents/skills/protoyard"\ncp -R "$FIXTURE_SOURCE"/. "$HOME/.agents/skills/protoyard/"\n'
    );
    execFileSync('chmod', ['+x', join(bin, 'npx')]);
    return { root, bin, callLog };
  }

  function runSmoke(tag: string, root: ReturnType<typeof fixture>) {
    return spawnSync(BASH, [SCRIPT, tag], {
      cwd: REPO,
      env: {
        ...process.env,
        CALL_LOG: root.callLog,
        FIXTURE_SOURCE: PACK,
        PATH: `${root.bin}:${process.env.PATH ?? ''}`,
      },
      encoding: 'utf8',
    });
  }

  describe('tagged skill release smoke script', () => {
    it('installs the exact source URL in an isolated fixture and checks the pack', () => {
      const root = fixture();
      // The skill is stamped with the release version, so smoke the current one.
      const { version } = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as {
        version: string;
      };
      const result = runSmoke(`v${version}`, root);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(`Smoke install passed: Protoyard skill ${version}`);
      const args = readFileSync(root.callLog, 'utf8');
      // The skills CLI is pinned to an exact npm version, never a floating tag.
      expect(args).toMatch(/^--yes skills@\d+\.\d+\.\d+ add /);
      expect(args).toContain(`https://github.com/DailybotHQ/protoyard/tree/v${version}`);
      expect(args).toContain('--skill protoyard --global --agent codex --copy --yes');
    });

    it('rejects a non-version tag before invoking the installer', () => {
      const root = fixture();
      const result = runSmoke('main', root);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('expected a version tag');
    });
  });
});
