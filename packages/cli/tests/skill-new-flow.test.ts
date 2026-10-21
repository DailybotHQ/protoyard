// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHETYPE_IDS, KIT_ARCHETYPE_IDS } from '@protoyard/blueprint';
import { describe, expect, it } from 'vitest';
import { checkInvocation, cliTree, extractInvocations } from '../../../scripts/check-skill-cli.ts';
import { createProgram } from '../src/program.ts';

/**
 * The skill's full-prototype flow (skills/protoyard/new/SKILL.md) and its
 * blueprint reference (skills/protoyard/references/blueprints.md): the flow
 * names the blueprint and generation commands with real flags and links the
 * reference; the reference's key and archetype lists match the code.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const NEW = join('skills', 'protoyard', 'new', 'SKILL.md');
const REFERENCE = join('skills', 'protoyard', 'references', 'blueprints.md');
const read = (path: string) => readFileSync(join(REPO, path), 'utf8');
const tree = cliTree(createProgram({ setExitCode: () => {} }));

/** `quick promote`, `blueprint new`… named by the file's real invocations. */
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

describe('the skill’s full-prototype flow', () => {
  it('lists the blueprint, generation, promotion and validation commands', () => {
    const paths = commandPaths(NEW);
    for (const path of [
      'blueprint new',
      'blueprint validate',
      'generate',
      'quick promote',
      'new',
      'list',
      'validate',
      'spec',
    ]) {
      expect(paths, path).toContain(path);
    }
  });

  it('uses only commands and flags the real CLI has', () => {
    for (const path of [NEW, REFERENCE]) {
      const invocations = extractInvocations(read(path), path);
      expect(invocations.length, path).toBeGreaterThan(3);
      expect(invocations.flatMap((invocation) => checkInvocation(tree, invocation))).toEqual([]);
    }
  });

  it('links the blueprint reference, and every relative link resolves', () => {
    const text = read(NEW);
    expect(text).toContain('](../references/blueprints.md)');
    for (const path of [NEW, REFERENCE]) {
      for (const [, target] of read(path).matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
        if (/^[a-z]+:/.test(target ?? '')) continue;
        expect(existsSync(resolve(dirname(join(REPO, path)), target ?? '')), target).toBe(true);
      }
    }
  });
});

describe('the blueprint reference', () => {
  const text = read(REFERENCE);

  it('lists exactly the top-level keys of the blueprint JSON Schema', () => {
    const schema = JSON.parse(read('packages/blueprint/schema/blueprint.schema.json')) as {
      properties: Record<string, unknown>;
    };
    const keys = Object.keys(schema.properties).filter((key) => key !== '$schema');
    const start = text.indexOf('## Top-level keys');
    const table = text.slice(start, text.indexOf('\n## ', start + 1));
    const documented = [...table.matchAll(/^\| ((?:`[a-zA-Z]+`(?:, )?)+) \|/gm)].flatMap((row) =>
      [...(row[1] ?? '').matchAll(/`([a-zA-Z]+)`/g)].map((match) => match[1] as string)
    );
    expect([...documented].sort()).toEqual([...keys].sort());
  });

  it('lists exactly the brief archetypes and the kit archetypes', () => {
    const brief = /forces one of these starting shapes:\n\n([\s\S]*?)\n\n/.exec(text)?.[1] ?? '';
    expect(new Set([...brief.matchAll(/`([a-z-]+)`/g)].map((m) => m[1]))).toEqual(
      new Set(ARCHETYPE_IDS)
    );
    const kit = /a different, smaller set:\n([\s\S]*?)\. It selects/.exec(text)?.[1] ?? '';
    expect(new Set([...kit.matchAll(/`([a-z-]+)`/g)].map((m) => m[1]))).toEqual(
      new Set(KIT_ARCHETYPE_IDS)
    );
  });

  it('names no absolute local path', () => {
    for (const path of [NEW, REFERENCE]) {
      expect(read(path)).not.toMatch(/(?:^|[\s`(])(?:\/Users\/|\/home\/[a-z])/m);
    }
  });
});
