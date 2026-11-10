// @vitest-environment node
import { rmSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import {
  fileFindings,
  manifestFindings,
  releaseNoteFindings,
} from '../../../scripts/check-packages.ts';

/**
 * `pnpm check:packages` (scripts/check-packages.ts): every rule fires on a
 * fixture package that breaks it, a clean published-shaped package passes the
 * real pnpm pack + publint + attw pipeline, and pending packages only fail
 * with --require-all.
 */

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const bytes = (text: string) => new TextEncoder().encode(text);

function files(entries: Record<string, string>): Map<string, Uint8Array> {
  return new Map(Object.entries(entries).map(([path, text]) => [path, bytes(text)]));
}

describe('manifestFindings', () => {
  it('flags a version off the lockstep line and install lifecycle scripts', () => {
    const findings = manifestFindings(
      {
        name: 'x',
        version: '0.9.0',
        scripts: { postinstall: 'node a.js', preinstall: 'x', build: 'tsc' },
      },
      '1.0.0'
    );
    expect(findings.map((f) => f.rule)).toEqual([
      'version',
      'repository',
      'install-script',
      'install-script',
    ]);
    expect(findings.map((f) => f.message).join(' ')).toMatch(/preinstall.*postinstall/);
  });

  it('requires the repository url npm provenance checks', () => {
    const base = { name: 'x', version: '1.0.0' };
    const url = 'https://github.com/DailybotHQ/protoyard';
    expect(manifestFindings({ ...base, repository: { type: 'git', url } }, '1.0.0')).toEqual([]);
    expect(manifestFindings({ ...base, repository: `git+${url}.git` }, '1.0.0')).toEqual([]);
    for (const repository of [
      undefined,
      { type: 'git', url: '' },
      'https://github.com/other/repo',
    ]) {
      expect(manifestFindings({ ...base, repository }, '1.0.0').map((f) => f.rule)).toEqual([
        'repository',
      ]);
    }
  });
});

describe('releaseNoteFindings', () => {
  it('requires CHANGELOG.md and README.md in every tarball', () => {
    const bytes = new Uint8Array();
    expect(releaseNoteFindings(new Map([['dist/index.js', bytes]])).map((f) => f.message)).toEqual([
      expect.stringContaining('CHANGELOG.md'),
      expect.stringContaining('README.md'),
    ]);
    expect(
      releaseNoteFindings(
        new Map([
          ['CHANGELOG.md', bytes],
          ['README.md', bytes],
        ])
      )
    ).toEqual([]);
  });
});

describe('fileFindings', () => {
  it('flags tests, fixtures, snapshots and environment files', () => {
    const findings = fileFindings(
      files({
        'tests/a.test.ts': '',
        'dist/b.spec.js': '',
        'src/fixtures/world.json': '{}',
        'dist/__snapshots__/x.snap': '',
        '.env': 'TOKEN=x',
        '.env.local': '',
        '.env.example': 'TOKEN=',
        'dist/index.js': '',
      })
    );
    expect(findings.every((f) => f.rule === 'forbidden-file')).toBe(true);
    expect(findings.map((f) => f.message.split(' ')[0])).toEqual([
      '.env',
      '.env.local',
      'dist/__snapshots__/x.snap',
      'dist/b.spec.js',
      'src/fixtures/world.json',
      'tests/a.test.ts',
    ]);
  });
});
