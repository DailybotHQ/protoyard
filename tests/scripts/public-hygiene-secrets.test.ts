// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * The public hygiene check's `secret-assignment` rule: a package.json
 * dependency specifier (link:, workspace: or a semver range) is never a
 * secret, while a token-shaped value still fails, in package.json and
 * anywhere else. Secret-shaped lines are assembled at runtime, so this file
 * itself stays clean for the repository's own scan.
 */
const SCRIPT = resolve(import.meta.dirname, '../../scripts/check-public-hygiene.sh');
const KEY = ['api', 'Token'].join('');
const VALUE = ['a8f3K29d', 'Lq0ZxP7m', 'N2bV'].join('');
let repo = '';

function git(...args: string[]) {
  const run = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr);
}

function tree(files: Record<string, string>) {
  repo = mkdtempSync(join(tmpdir(), 'hygiene-secrets-'));
  git('init', '-q');
  for (const [name, text] of Object.entries(files)) writeFileSync(join(repo, name), text);
  git('add', '.');
  return spawnSync('bash', [SCRIPT, '--root', repo], { encoding: 'utf8' });
}

const manifest = (deps: Record<string, string>) =>
  `${JSON.stringify({ name: 'fixture', dependencies: deps }, null, 2)}\n`;

afterEach(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
});

describe('check-public-hygiene secret-assignment rule', () => {
  it('passes package.json dependency specifiers: link:, workspace: and semver ranges', () => {
    const result = tree({
      'package.json': manifest({
        '@texuli/tokens': 'link:../texuli/packages/tokens',
        '@example/tokens-core': 'workspace:*',
        '@example/token-ranges': '>=1.20.3 <2.0.0 || ^3.1.0-beta.1',
      }),
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  it('still fails a token-shaped value in package.json, even one starting with a digit', () => {
    const result = tree({
      'package.json': manifest({ [KEY]: VALUE, [`${KEY}2`]: `1${VALUE}` }),
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/package\.json:4: secret-assignment/);
    expect(result.stdout).toMatch(/package\.json:5: secret-assignment/);
    expect(result.stdout).not.toContain(VALUE);
  });

  it('keeps the rule outside package.json, even for a link:-looking value', () => {
    const result = tree({
      'config.ts': `export const ${KEY} = 'link:${VALUE}';\n`,
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('config.ts:1: secret-assignment');
  });
});
