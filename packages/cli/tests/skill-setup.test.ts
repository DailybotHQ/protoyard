// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

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
const BASH_VERSION = spawnSync(BASH, ['-c', 'echo $BASH_VERSION'], {
  encoding: 'utf8',
}).stdout.trim();

/** hosts.md label → setup.sh host key. */
const HOST_KEYS: Record<string, string> = {
  'Claude Code': 'claude',
  Cursor: 'cursor',
  'OpenAI Codex': 'codex',
  'Gemini CLI': 'gemini',
  'GitHub Copilot': 'copilot',
  OpenCode: 'opencode',
  Windsurf: 'windsurf',
};

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

/** The documented host table from references/hosts.md: key → destination. */
function documentedHosts(): Record<string, string> {
  const text = readFileSync(join(PACK, 'references', 'hosts.md'), 'utf8');
  const map: Record<string, string> = {};
  for (const match of text.matchAll(/^\| ([^|]+?) \| `(~\/[^`]+)` \|$/gm)) {
    const key = HOST_KEYS[match[1] ?? ''];
    if (key) map[key] = match[2] ?? '';
  }
  return map;
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

describe('setup.sh portability', () => {
  it('runs under the system bash and avoids Bash 4-only syntax', () => {
    expect(BASH_VERSION).toMatch(/^\d+\./);
    // Code only: the header comment names the idioms it avoids.
    const source = readFileSync(SCRIPT, 'utf8')
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');
    for (const pattern of [
      /declare\s+-A/,
      /\bmapfile\b/,
      /\breadarray\b/,
      /\$\{[A-Za-z_]+(,,|\^\^)\}/,
      /\|&/,
      /&>>/,
      /\bcoproc\b/,
      /local\s+-n/,
      /\w+=\(/,
    ]) {
      expect(source, String(pattern)).not.toMatch(pattern);
    }
    expect(spawnSync(BASH, ['-n', SCRIPT]).status).toBe(0);
    expect(statSync(SCRIPT).mode & 0o111).not.toBe(0);
  });
});

describe('setup.sh help and host map', () => {
  it('prints help with every host and its destination', () => {
    const { status, stdout } = run(['--help']);
    expect(status).toBe(0);
    for (const [key, path] of Object.entries(documentedHosts())) {
      expect(stdout).toContain(key);
      expect(stdout).toContain(path);
    }
    expect(stdout).toContain('openclaw skills install protoyard');
  });

  it('lists exactly the hosts references/hosts.md documents, with the same paths', () => {
    const documented = documentedHosts();
    expect(Object.keys(documented)).toHaveLength(7);
    const { status, stdout } = run(['--list-hosts']);
    expect(status).toBe(0);
    const listed = Object.fromEntries(
      stdout
        .trim()
        .split('\n')
        .map((line) => line.trim().split(/\s+/) as [string, string])
    );
    expect(listed).toEqual(documented);
  });

  it('refuses usage errors with exit 2', () => {
    expect(run([]).status).toBe(2);
    expect(run(['--host']).status).toBe(2);
    expect(run(['--host', 'vim']).status).toBe(2);
    expect(run(['--bogus']).status).toBe(2);
    const openclaw = run(['--host', 'openclaw']);
    expect(openclaw.status).toBe(2);
    expect(openclaw.stderr).toContain('openclaw skills install protoyard');
  });
});

describe('setup.sh install', () => {
  it.each(Object.entries(documentedHosts()))(
    'installs for %s into the supplied home only',
    (host, path) => {
      const home = temp(`protoyard-home-${host}-`);
      const realHome = sentinelHome();
      const { status, stdout } = run(['--host', host, '--home', home], { home: realHome });
      expect(status, stdout).toBe(0);
      const target = join(home, path.replace(/^~\//, ''));
      expect(files(target)).toEqual(files(PACK));
      for (const rel of files(PACK)) {
        expect(readFileSync(join(target, rel)).equals(readFileSync(join(PACK, rel))), rel).toBe(
          true
        );
      }
      expect(readdirSync(realHome)).toEqual([]);
      // Only the host's skills directory was created under the supplied home.
      expect(readdirSync(home)).toEqual([path.replace(/^~\//, '').split('/')[0]]);
      expect(readdirSync(join(target, '..')).filter((n) => n.startsWith('.'))).toEqual([]);
    }
  );

  it('is a no-op the second time, and a dry run writes nothing', () => {
    const home = temp('protoyard-home-again-');
    expect(run(['--host', 'cursor', '--home', home, '--dry-run']).status).toBe(0);
    expect(readdirSync(home)).toEqual([]);
    expect(run(['--host', 'cursor', '--home', home]).status).toBe(0);
    const again = run(['--host', 'cursor', '--home', home]);
    expect(again.status).toBe(0);
    expect(again.stdout).toContain('Already installed: no change.');
  });

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

  it('never touches an unrelated skill or file at the destination, even with --replace', () => {
    const home = temp('protoyard-home-unrelated-');
    const target = join(home, '.gemini', 'skills', 'protoyard');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'SKILL.md'), '---\nname: someone-else\n---\n');
    for (const args of [[], ['--replace']]) {
      const result = run(['--host', 'gemini', '--home', home, ...args]);
      expect(result.status).toBe(3);
      expect(result.stderr).toContain('not a Protoyard skill');
    }
    expect(readFileSync(join(target, 'SKILL.md'), 'utf8')).toBe('---\nname: someone-else\n---\n');

    const fileHome = temp('protoyard-home-file-');
    mkdirSync(join(fileHome, '.copilot', 'skills'), { recursive: true });
    writeFileSync(join(fileHome, '.copilot', 'skills', 'protoyard'), 'not a folder');
    expect(run(['--host', 'copilot', '--home', fileHome, '--replace']).status).toBe(3);
    expect(readFileSync(join(fileHome, '.copilot', 'skills', 'protoyard'), 'utf8')).toBe(
      'not a folder'
    );
  });

  it('links the checkout with --link and treats the same link as installed', () => {
    const home = temp('protoyard-home-link-');
    expect(run(['--host', 'opencode', '--home', home, '--link']).status).toBe(0);
    const target = join(home, '.config', 'opencode', 'skills', 'protoyard');
    expect(lstatSync(target).isSymbolicLink()).toBe(true);
    expect(realpathSync(readlinkSync(target))).toBe(realpathSync(PACK));
    const again = run(['--host', 'opencode', '--home', home, '--link']);
    expect(again.stdout).toContain('Already installed: no change.');
  });

  it('fails for a home that does not exist', () => {
    expect(
      run(['--host', 'windsurf', '--home', join(temp('protoyard-nohome-'), 'missing')]).status
    ).toBe(1);
  });
});

describe('setup.sh --verify', () => {
  it('passes for an untouched pack with its SHA256SUMS, without installing anything', () => {
    const dir = packWithSums();
    const realHome = sentinelHome();
    const result = run(['--verify'], { script: join(dir, 'setup.sh'), home: realHome });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Verified.');
    expect(readdirSync(realHome)).toEqual([]);
    // --dir and --sums verify another copy, e.g. an installed one.
    const other = run(['--verify', '--dir', dir, '--sums', join(dir, 'SHA256SUMS')]);
    expect(other.status, other.stderr).toBe(0);
  });

  it('fails on a changed, missing or unlisted file, naming it', () => {
    const changed = packWithSums();
    writeFileSync(join(changed, 'TRUST.md'), 'edited\n');
    const c = run(['--verify'], { script: join(changed, 'setup.sh') });
    expect(c.status).toBe(1);
    expect(c.stderr).toContain('changed: TRUST.md');

    const missing = packWithSums();
    rmSync(join(missing, 'kits', 'SKILL.md'));
    const m = run(['--verify'], { script: join(missing, 'setup.sh') });
    expect(m.status).toBe(1);
    expect(m.stderr).toContain('missing: kits/SKILL.md');

    const extra = packWithSums();
    writeFileSync(join(extra, 'references', 'planted.md'), 'not in the release\n');
    const e = run(['--verify'], { script: join(extra, 'setup.sh') });
    expect(e.status).toBe(1);
    expect(e.stderr).toContain('unlisted: references/planted.md');
  });

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

  it('fails when a required file is missing even before checksums', () => {
    const dir = join(temp('protoyard-incomplete-'), 'protoyard');
    cpSync(PACK, dir, { recursive: true });
    rmSync(join(dir, 'references', 'hosts.md'));
    const result = run(['--verify'], { script: join(dir, 'setup.sh') });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('missing: references/hosts.md');
  });
});
