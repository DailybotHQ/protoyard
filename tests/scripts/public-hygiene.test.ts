// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * The public hygiene check refuses literal bidi controls (Trojan Source) and
 * token-shaped secret assignments in tracked files, reporting path and line
 * without echoing the text. Hostile characters and secret-shaped values are
 * built at runtime, so this file itself stays clean for the repository scan.
 */
const SCRIPT = resolve(import.meta.dirname, '../../scripts/check-public-hygiene.sh');
const RLO = String.fromCodePoint(0x202e);
const LRI = String.fromCodePoint(0x2066);
const KEY = ['api', 'Token'].join('');
const VALUE = ['a8f3K29d', 'Lq0ZxP7m', 'N2bV'].join('');
const LINKED = ['@texuli', 'tokens'].join('/');
let repo = '';

function git(...args: string[]) {
  const run = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr);
}

function tree(files: Record<string, string>) {
  repo = mkdtempSync(join(tmpdir(), 'hygiene-'));
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

describe('check-public-hygiene', () => {
  it('flags a literal bidi control by path and line, never echoing the text', () => {
    const result = tree({
      'clean.ts': "export const ok = 'plain';\n",
      'escaped.ts': "export const rlo = '\\u202E';\n",
      'spoof.ts': `const a = 1;\nconst admin${RLO} = 'x';\nlet b${LRI} = 2;\n`,
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('spoof.ts:2: trojan-source');
    expect(result.stdout).toContain('spoof.ts:3: trojan-source');
    expect(result.stdout).not.toContain('escaped.ts');
    expect(result.stdout).not.toContain(RLO);
  });

  it('fails a token-shaped value, in package.json or elsewhere, but passes dependency specifiers', () => {
    const passing = tree({
      'package.json': manifest({
        [LINKED]: 'link:../texuli/packages/tokens',
        '@example/tokens-core': 'workspace:*',
        '@example/token-ranges': '>=1.20.3 <2.0.0 || ^3.1.0-beta.1',
      }),
    });
    expect(passing.status, passing.stdout + passing.stderr).toBe(0);
    rmSync(repo, { recursive: true, force: true });

    const failing = tree({
      'package.json': manifest({ [KEY]: VALUE, [`${KEY}2`]: `1${VALUE}` }),
      'config.ts': `export const ${KEY} = 'link:${VALUE}';\n`,
    });
    expect(failing.status).toBe(1);
    expect(failing.stdout).toMatch(/package\.json:4: secret-assignment/);
    expect(failing.stdout).toMatch(/package\.json:5: secret-assignment/);
    expect(failing.stdout).toContain('config.ts:1: secret-assignment');
    expect(failing.stdout).not.toContain(VALUE);
  });
});
