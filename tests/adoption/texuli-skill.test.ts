// @vitest-environment node
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The vendored Texuli agent skill (`.agents/skills/texuli`) is a pinned
 * `skill-vX.Y.Z` release, never edited in place (docs/TEXULI.md). These
 * checks keep it whole and keep it describing the Texuli packages this
 * workspace installs, so a Texuli bump without a skill refresh fails here.
 */
const root = join(import.meta.dirname, '..', '..');
const skillDir = join(root, '.agents', 'skills', 'texuli');

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [relative(skillDir, path).split(sep).join('/')];
  });
}

function sums(): Map<string, string> {
  const lines = readFileSync(join(skillDir, 'SHA256SUMS'), 'utf8').trim().split('\n');
  return new Map(
    lines.map((line) => {
      const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
      if (!match) throw new Error(`Malformed SHA256SUMS line: ${line}`);
      return [match[2] as string, match[1] as string];
    })
  );
}

function frontmatterVersion(file: string): string | null {
  const text = readFileSync(join(skillDir, file), 'utf8');
  return /^version: "([^"]+)"$/m.exec(text)?.[1] ?? null;
}

describe('vendored Texuli agent skill', () => {
  it('matches its SHA256SUMS file for file, with nothing missing or extra', () => {
    const expected = sums();
    const present = filesUnder(skillDir).filter((file) => file !== 'SHA256SUMS');
    expect(present.sort()).toEqual([...expected.keys()].sort());
    for (const file of present) {
      const actual = createHash('sha256')
        .update(readFileSync(join(skillDir, file)))
        .digest('hex');
      expect(actual, file).toBe(expected.get(file));
    }
  });

  it('is one release: every SKILL.md carries the router version', () => {
    const version = frontmatterVersion('SKILL.md');
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    const skills = filesUnder(skillDir).filter((file) => file.endsWith('SKILL.md'));
    expect(skills.length).toBeGreaterThan(1);
    for (const file of skills) expect(frontmatterVersion(file), file).toBe(version);
  });

  it('describes the Texuli release this workspace installs', () => {
    const installed = JSON.parse(
      readFileSync(join(root, 'node_modules', 'texuli', 'package.json'), 'utf8')
    ) as { version: string };
    const router = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
    // The router states the published line ("every one at `0.9.0`"); a bump
    // to a new Texuli minor needs the matching skill release.
    expect(router).toContain(`every one at\n   \`${installed.version}\``);
    expect(readFileSync(join(skillDir, 'router', 'packages.md'), 'utf8')).toContain(
      `\`${installed.version}\``
    );
  });
});
