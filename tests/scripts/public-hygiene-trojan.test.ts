// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * The public hygiene check refuses literal bidi controls (Trojan Source) in
 * tracked text files. The hostile character is built at runtime, so this test
 * file itself stays free of it.
 */
const SCRIPT = resolve(import.meta.dirname, '../../scripts/check-public-hygiene.sh');
const RLO = String.fromCodePoint(0x202e);
const LRI = String.fromCodePoint(0x2066);
let repo = '';

function git(...args: string[]) {
  const run = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr);
}

function check() {
  return spawnSync('bash', [SCRIPT, '--root', repo], { encoding: 'utf8' });
}

afterEach(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
});

describe('check-public-hygiene trojan-source rule', () => {
  it('flags a literal bidi control by path and line, never echoing the text', () => {
    repo = mkdtempSync(join(tmpdir(), 'hygiene-trojan-'));
    git('init', '-q');
    writeFileSync(join(repo, 'clean.ts'), "export const ok = 'plain';\n");
    writeFileSync(join(repo, 'escaped.ts'), "export const rlo = '\\u202E';\n");
    writeFileSync(
      join(repo, 'spoof.ts'),
      `const a = 1;\nconst admin${RLO} = 'x';\nlet b${LRI} = 2;\n`
    );
    git('add', '.');
    const result = check();
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('spoof.ts:2: trojan-source');
    expect(result.stdout).toContain('spoof.ts:3: trojan-source');
    expect(result.stdout).not.toContain('escaped.ts');
    expect(result.stdout).not.toContain(RLO);
  });

  it('passes a tree that writes bidi characters as escapes', () => {
    repo = mkdtempSync(join(tmpdir(), 'hygiene-trojan-'));
    git('init', '-q');
    writeFileSync(join(repo, 'escaped.ts'), "export const rlo = '\\u202E';\n");
    git('add', '.');
    const result = check();
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });
});
