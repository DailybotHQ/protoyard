// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkInvocation, cliTree, extractInvocations } from '../../../scripts/check-skill-cli.ts';
import { createProgram } from '../src/program.ts';

/**
 * The skill's iteration flow (skills/protoyard/iterate/SKILL.md): it walks the
 * dev server, blueprint regeneration and validation with real commands and
 * flags, separates generated from owned files and warns against editing
 * generated output, and the router links it.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const ITERATE = join('skills', 'protoyard', 'iterate', 'SKILL.md');
const read = (path: string) => readFileSync(join(REPO, path), 'utf8');
const tree = cliTree(createProgram({ setExitCode: () => {} }));

/** Command paths (`generate`, `quick iterate`) named by the file's real invocations. */
function commandPaths(path: string): Set<string> {
  const paths = new Set<string>();
  for (const invocation of extractInvocations(read(path), path)) {
    const words: string[] = [];
    for (const word of invocation.args) {
      if (!/^[a-z][a-z-]*$/.test(word)) break;
      words.push(word);
    }
    while (words.length > 0 && !tree.paths.has(words.join(' '))) words.pop();
    if (words.length > 0) paths.add(words.join(' '));
  }
  return paths;
}

describe('the skill’s iteration flow', () => {
  const text = read(ITERATE);

  it('covers the dev server, regeneration, validation and quick iteration', () => {
    const paths = commandPaths(ITERATE);
    for (const path of [
      'dev',
      'generate',
      'spec',
      'validate',
      'quick iterate',
      'quick undo',
      'quick serve',
      'quick promote',
    ]) {
      expect(paths, path).toContain(path);
    }
    // Plan before writing, and the flags that lose data are named as such.
    expect(text).toContain('--dry-run');
    expect(text).toMatch(/--allow-drop[\s\S]{0,200}delete/);
    expect(text).toMatch(/--force[\s\S]{0,200}(overwrite|lost)/);
  });

  it('separates generated from owned files and warns against editing generated output', () => {
    expect(text).toContain('src/generated/');
    expect(text).toContain('**Never edit generated files.**');
    expect(text).toMatch(/Owned files/);
    expect(text).toMatch(
      /blueprint\.json`?.{0,40}source of truth|source of truth[\s\S]{0,80}blueprint\.json/
    );
  });

  it('uses only commands and flags the real CLI has', () => {
    const invocations = extractInvocations(text, ITERATE);
    expect(invocations.length).toBeGreaterThan(8);
    expect(invocations.flatMap((invocation) => checkInvocation(tree, invocation))).toEqual([]);
  });

  it('is linked from the router, and every relative link resolves', () => {
    expect(read(join('skills', 'protoyard', 'SKILL.md'))).toContain('](iterate/SKILL.md)');
    for (const [, target] of text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      if (/^[a-z]+:/.test(target ?? '')) continue;
      expect(existsSync(resolve(dirname(join(REPO, ITERATE)), target ?? '')), target).toBe(true);
    }
  });
});
