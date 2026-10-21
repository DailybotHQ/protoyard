// @vitest-environment node
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * scripts/upgrade-skill.sh: compares the installed skill with a selected
 * release checkout, verifies that release's SHA256SUMS, prints the exact
 * replacement command, and replaces only with an explicit --yes (never CI=1).
 * Runs under /bin/bash (Bash 3.2 on macOS) against throwaway homes.
 */

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const SCRIPT = join(REPO, 'scripts', 'upgrade-skill.sh');
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

/** A release checkout: skills/protoyard at `version`, with its own SHA256SUMS. */
function checkout(version: string, prefix = `protoyard-release-${version}-`): string {
  const root = temp(prefix);
  const pack = join(root, 'skills', 'protoyard');
  cpSync(join(REPO, 'skills', 'protoyard'), pack, { recursive: true });
  const router = join(pack, 'SKILL.md');
  writeFileSync(
    router,
    readFileSync(router, 'utf8').replace(/^version: ".*"$/m, `version: "${version}"`)
  );
  const generated = spawnSync(
    BASH,
    [
      join(REPO, 'scripts', 'generate-skill-checksums.sh'),
      '--dir',
      pack,
      '--output',
      join(root, 'SHA256SUMS'),
    ],
    { encoding: 'utf8' }
  );
  expect(generated.status, generated.stderr).toBe(0);
  return root;
}

/** A home with the skill at `version` installed for Claude Code, plus host config to preserve. */
function home(version: string, prefix = 'protoyard-upgrade-home-'): string {
  const dir = temp(prefix);
  const release = checkout(version);
  const installed = spawnSync(
    BASH,
    [join(release, 'skills', 'protoyard', 'setup.sh'), '--host', 'claude', '--home', dir],
    { encoding: 'utf8' }
  );
  expect(installed.status, installed.stderr).toBe(0);
  writeFileSync(join(dir, '.claude', 'settings.json'), '{"theme":"dark"}\n');
  mkdirSync(join(dir, '.claude', 'skills', 'other-skill'), { recursive: true });
  writeFileSync(
    join(dir, '.claude', 'skills', 'other-skill', 'SKILL.md'),
    '---\nname: other\n---\n'
  );
  return dir;
}

function upgrade(args: string[], env: Record<string, string> = {}) {
  const result = spawnSync(BASH, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

const installedVersion = (dir: string) =>
  /^version: "(.*)"$/m.exec(
    readFileSync(join(dir, '.claude/skills/protoyard/SKILL.md'), 'utf8')
  )?.[1];
const backups = (dir: string) =>
  existsSync(join(dir, '.protoyard', 'skill-backups'))
    ? readdirSync(join(dir, '.protoyard', 'skill-backups'))
    : [];

// Each case installs and checksums real packs through several bash processes; under a
// loaded machine that can take longer than Vitest's 5 s default.
const SLOW = 60_000;

describe('scripts/upgrade-skill.sh', () => {
  it(
    'previews installed versus selected and changes nothing without --yes (also under CI=1)',
    () => {
      const dir = home('1.0.0');
      const release = checkout('1.1.0');
      for (const env of [{}, { CI: '1' }]) {
        const result = upgrade(
          ['--host', 'claude', '--home', dir, '--from', release, '--tag', 'v1.1.0'],
          env
        );
        expect(result.code, result.err).toBe(0);
        expect(result.out).toContain('installed version: 1.0.0');
        expect(result.out).toContain('selected version:  1.1.0');
        expect(result.out).toContain('release checksums: ok');
        expect(result.out).toContain('change: upgrade 1.0.0 → 1.1.0');
        // The exact replacement command, and the consent requirement.
        expect(result.out).toContain(
          `bash ${join(release, 'skills/protoyard/setup.sh')} --host claude --home ${dir} --replace`
        );
        expect(result.out).toMatch(/After the developer confirms this upgrade, rerun with --yes/);
        expect(result.out).toContain('SKILL.md');
        expect(installedVersion(dir)).toBe('1.0.0');
        expect(backups(dir)).toEqual([]);
      }
    },
    SLOW
  );

  it(
    'prints the changed files relative to each tree when paths hold sed metacharacters',
    () => {
      // A sed pattern built from these paths would break on | and &.
      const dir = home('1.0.0', 'protoyard-upgrade-home-a|b&c-');
      const release = checkout('1.1.0', 'protoyard-release-x|y&z-');
      const result = upgrade(['--host', 'claude', '--home', dir, '--from', release]);
      expect(result.code, result.err).toBe(0);
      expect(result.out).toContain('    Files SKILL.md and SKILL.md differ');
      const listed =
        (result.out.split('files that differ')[1] ?? '').split('replacement command')[0] ?? '';
      expect(listed).not.toContain(dir);
      expect(listed).not.toContain(release);
    },
    SLOW
  );

  it(
    'replaces only the skill with --yes, keeps a backup and the host config, and verifies',
    () => {
      const dir = home('1.0.0');
      const release = checkout('1.1.0');
      const result = upgrade(['--host', 'claude', '--home', dir, '--from', release, '--yes']);
      expect(result.code, result.err).toBe(0);
      expect(result.out).toContain('Upgraded: the installed skill is now 1.1.0');
      expect(installedVersion(dir)).toBe('1.1.0');
      expect(backups(dir)).toHaveLength(1);
      expect(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8')).toBe(
        '{"theme":"dark"}\n'
      );
      expect(existsSync(join(dir, '.claude', 'skills', 'other-skill', 'SKILL.md'))).toBe(true);
      // Running it again: already current.
      const again = upgrade(['--host', 'claude', '--home', dir, '--from', release, '--yes']);
      expect(again.code).toBe(0);
      expect(again.out).toContain('Already current');
      expect(backups(dir)).toHaveLength(1);
    },
    SLOW
  );

  it(
    'refuses a release that fails its checksums or is not the selected tag, even with --yes',
    () => {
      const dir = home('1.0.0');
      const tampered = checkout('1.1.0');
      writeFileSync(join(tampered, 'skills', 'protoyard', 'TRUST.md'), 'changed after release\n');
      const bad = upgrade(['--host', 'claude', '--home', dir, '--from', tampered, '--yes']);
      expect(bad.code).toBe(1);
      expect(bad.err).toMatch(/changed: TRUST\.md/);
      expect(bad.err).toMatch(/nothing was changed/);

      const release = checkout('1.1.0');
      const wrongTag = upgrade([
        '--host',
        'claude',
        '--home',
        dir,
        '--from',
        release,
        '--tag',
        'v1.2.0',
        '--yes',
      ]);
      expect(wrongTag.code).toBe(1);
      expect(wrongTag.err).toMatch(/holds version 1\.1\.0, not v1\.2\.0/);
      expect(installedVersion(dir)).toBe('1.0.0');
      expect(backups(dir)).toEqual([]);
    },
    SLOW
  );

  it(
    'refuses a downgrade unless allowed, and a home with nothing installed',
    () => {
      const dir = home('1.2.0');
      const older = checkout('1.1.0');
      const refused = upgrade(['--host', 'claude', '--home', dir, '--from', older, '--yes']);
      expect(refused.code).toBe(3);
      expect(refused.err).toMatch(/older than the installed 1\.2\.0/);
      expect(installedVersion(dir)).toBe('1.2.0');
      const allowed = upgrade([
        '--host',
        'claude',
        '--home',
        dir,
        '--from',
        older,
        '--allow-downgrade',
      ]);
      expect(allowed.code).toBe(0);
      expect(allowed.out).toContain('change: downgrade 1.2.0 → 1.1.0 (allowed)');

      const empty = temp('protoyard-upgrade-empty-');
      const none = upgrade(['--host', 'claude', '--home', empty, '--from', older]);
      expect(none.code).toBe(3);
      expect(none.err).toMatch(/no Protoyard skill is installed/);
    },
    SLOW
  );

  it(
    'reports usage errors with exit 2',
    () => {
      const release = checkout('1.1.0');
      expect(upgrade(['--from', release]).code).toBe(2);
      expect(upgrade(['--host', 'claude']).code).toBe(2);
      expect(upgrade(['--host', 'nowhere', '--from', release]).code).toBe(2);
      expect(upgrade(['--host', 'claude', '--from', release, '--tag', 'latest']).code).toBe(2);
      expect(upgrade(['--help']).out).toContain('--yes');
    },
    SLOW
  );
});
