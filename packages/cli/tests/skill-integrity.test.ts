// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

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
