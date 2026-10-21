// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createProgram } from '../../packages/cli/src/program.ts';
import { checkInvocation, cliTree, extractInvocations } from '../../scripts/check-skill-cli.ts';

/**
 * docs/SKILL.md, the repository guide to the distributable skill: the docs
 * index links it, and every local command it describes matches the scripts
 * and the CLI (paths, flags, package scripts, the host map, links, anchors).
 */

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const GUIDE = join(REPO, 'docs', 'SKILL.md');
const text = readFileSync(GUIDE, 'utf8');
const read = (path: string) => readFileSync(join(REPO, path), 'utf8');
const BASH = existsSync('/bin/bash') ? '/bin/bash' : 'bash';

/** Shell lines inside the guide's fenced code blocks. */
const shellLines = [...text.matchAll(/```bash\n([\s\S]*?)```/g)].flatMap(([, body]) =>
  (body ?? '').split('\n').map((line) => line.replace(/\s+#.*$/, '').trim())
);

/** Every `--flag` the given script's own help/usage text lists. */
function flagsOf(script: string): Set<string> {
  return new Set(read(script).match(/--[a-z][a-z-]*/g) ?? []);
}

/** GitHub-style heading anchors (lowercase, punctuation dropped, spaces to `-`). */
const anchors = new Set(
  [...text.matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) =>
    (heading ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-')
  )
);

describe('docs/SKILL.md', () => {
  it('is linked from the documentation index', () => {
    expect(read('docs/README.md')).toContain('](SKILL.md)');
  });

  it('lists exactly the hosts setup.sh installs into', () => {
    const listed = spawnSync(BASH, [join(REPO, 'skills/protoyard/setup.sh'), '--list-hosts'], {
      encoding: 'utf8',
    }).stdout;
    const fromScript = listed
      .trim()
      .split('\n')
      .map((line) => line.trim().split(/\s+/) as [string, string]);
    const table = [...text.matchAll(/^\| [^|]+ \| `([a-z]+)` \| `(~\/[^`]+)` \|$/gm)].map(
      ([, host, path]) => [host, path]
    );
    expect(table).toEqual(fromScript);
  });

  it('names only scripts that exist', () => {
    const paths = new Set(text.match(/scripts\/[a-z-]+\.(?:sh|ts)/g) ?? []);
    expect(paths.size).toBeGreaterThan(4);
    for (const path of paths) expect(existsSync(join(REPO, path)), path).toBe(true);
  });

  it('uses only flags setup.sh and upgrade-skill.sh accept', () => {
    const scripts: [RegExp, string][] = [
      [/setup\.sh\b/, 'skills/protoyard/setup.sh'],
      [/upgrade-skill\.sh\b/, 'scripts/upgrade-skill.sh'],
      [/generate-skill-checksums\.sh\b/, 'scripts/generate-skill-checksums.sh'],
      [/verify-skill-integrity\.sh\b/, 'scripts/verify-skill-integrity.sh'],
    ];
    let checked = 0;
    for (const line of shellLines) {
      for (const [pattern, script] of scripts) {
        if (!pattern.test(line)) continue;
        const known = flagsOf(script);
        for (const flag of line.match(/--[a-z][a-z-]*/g) ?? []) {
          expect(known.has(flag), `${script}: ${flag} in "${line}"`).toBe(true);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(8);
  });

  it('runs only package scripts the repository defines', () => {
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> })
      .scripts;
    const named = new Set(
      [
        ...text.matchAll(/`pnpm ([a-z][a-z:-]*)`/g),
        ...shellLines.map((l) => /^pnpm ([a-z][a-z:-]*)/.exec(l) ?? []),
      ]
        .map((match) => match[1])
        .filter((name): name is string => Boolean(name))
        .filter((name) => !['exec', 'vitest', 'tsx', 'protoyard', 'add', 'install'].includes(name))
    );
    expect(named).toContain('check:skill');
    for (const name of named) expect(scripts[name], `pnpm ${name}`).toBeDefined();
  });

  it('uses only commands and flags the real protoyard CLI has', () => {
    const tree = cliTree(createProgram({ setExitCode: () => {} }));
    const invocations = extractInvocations(text, 'docs/SKILL.md');
    expect(invocations.flatMap((invocation) => checkInvocation(tree, invocation))).toEqual([]);
  });

  it('has resolving relative links and in-page anchors', () => {
    for (const [, target, anchor] of text.matchAll(/\]\(([^)#\s]*)(?:#([^)\s]*))?\)/g)) {
      if (/^[a-z]+:/.test(target ?? '')) continue;
      if (target) {
        expect(existsSync(resolve(dirname(GUIDE), target)), target).toBe(true);
      } else if (anchor) {
        expect(anchors.has(anchor), `#${anchor}`).toBe(true);
      }
    }
  });
});
