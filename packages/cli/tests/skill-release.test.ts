// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { stampSkillVersions } from '../../../scripts/stamp-skill-version.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(): { root: string; files: string[] } {
  const root = mkdtempSync(join(tmpdir(), 'protoyard-skill-release-'));
  roots.push(root);
  mkdirSync(join(root, 'install'), { recursive: true });
  const files = [join(root, 'SKILL.md'), join(root, 'install', 'SKILL.md')];
  writeFileSync(files[0]!, '---\nname: protoyard\nversion: "1.0.0"\n---\nRouter body.\n');
  writeFileSync(files[1]!, "---\nname: protoyard-install\nversion: '1.0.0'\n---\nInstall body.\n");
  return { root, files };
}

describe('release skill version stamping', () => {
  it('stamps all quoted versions, including prerelease versions, and verifies the result', () => {
    const { root, files } = fixture();
    const stamped = stampSkillVersions('2.4.0-rc.2', { root });
    expect(stamped.errors).toEqual([]);
    expect(stamped.files).toHaveLength(2);
    expect(stamped.changed).toHaveLength(2);
    for (const file of files)
      expect(readFileSync(file, 'utf8')).toMatch(/version: ["']2\.4\.0-rc\.2["']/);

    const checked = stampSkillVersions('2.4.0-rc.2', { root, check: true });
    expect(checked.errors).toEqual([]);
    expect(checked.changed).toEqual([]);
  });

  it('dry-runs without writes and reports drift without partially stamping', () => {
    const { root, files } = fixture();
    const before = files.map((file) => readFileSync(file, 'utf8'));
    const preview = stampSkillVersions('2.4.0', { root, dryRun: true });
    expect(preview.changed).toHaveLength(2);
    expect(files.map((file) => readFileSync(file, 'utf8'))).toEqual(before);

    writeFileSync(
      files[1]!,
      '---\nname: protoyard-install\nversion: "2.3.0"\n---\nInstall body.\n'
    );
    const drift = stampSkillVersions('2.4.0', { root, check: true });
    expect(drift.errors).toEqual([
      'SKILL.md: expected 2.4.0, found 1.0.0',
      'install/SKILL.md: expected 2.4.0, found 2.3.0',
    ]);
    expect(readFileSync(files[0]!, 'utf8')).toBe(before[0]);
  });

  it('rejects malformed frontmatter before writing any version', () => {
    const { root, files } = fixture();
    const validBefore = readFileSync(files[0]!, 'utf8');
    writeFileSync(files[1]!, '---\nname: protoyard-install\nversion: 1.0.0\n---\nInstall body.\n');
    const result = stampSkillVersions('2.4.0', { root });
    expect(result.errors).toEqual(['install/SKILL.md: version must be a quoted SemVer field']);
    expect(readFileSync(files[0]!, 'utf8')).toBe(validBefore);
  });

  it('checks the tag version before release artifact generation', () => {
    const root = new URL('../../../', import.meta.url);
    const workflow = readFileSync(new URL('.github/workflows/release.yml', root), 'utf8');
    const installAt = workflow.indexOf('      - name: Install dependencies');
    const verifyAt = workflow.indexOf('Skill versions match the release tag');
    const artifactsAt = workflow.indexOf('Build the packages', verifyAt);
    expect(installAt).toBeGreaterThan(-1);
    expect(verifyAt).toBeGreaterThan(-1);
    expect(verifyAt).toBeGreaterThan(installAt);
    expect(artifactsAt).toBeGreaterThan(verifyAt);
    expect(workflow.slice(verifyAt, artifactsAt)).toContain(
      'stamp-skill-version.ts "$version" --check'
    );
  });
});

describe('committed skill versions', () => {
  it('match the lockstep package version between releases', () => {
    const repo = join(import.meta.dirname, '../../..');
    const { version } = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')) as {
      version: string;
    };
    // Stamping to a new version happens only while preparing that release.
    expect(
      stampSkillVersions(version, { root: join(repo, 'skills', 'protoyard'), check: true }).errors
    ).toEqual([]);
  });
});
