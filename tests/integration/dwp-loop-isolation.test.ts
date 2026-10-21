// @vitest-environment node
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setQuickPlayerLocator } from '../../packages/cli/src/commands/quick/index.ts';
import { cli } from '../../packages/cli/tests/helpers.ts';
import {
  type DwpLoopFixture,
  fixtureTempDirs,
  PlanScopeError,
  planQuickArgs,
  resolvePlanScoped,
  treeChanges,
  treeSnapshot,
  withDwpLoopFixture,
} from './fixtures/dwp-loop-plan.ts';

/**
 * Isolation of the DWP exploration loop. The loop may write only the
 * temporary plan's evidence (`analysis_results/prototypes/`), and every
 * boundary is observed rather than assumed:
 * - the runner resolves the task's paths inside the plan scope and refuses
 *   traversal, absolute paths and symlink escapes before anything runs;
 * - the CLI's own `--out` guards refuse source folders, the workspace root,
 *   folders it did not create and links, and write nothing when they refuse;
 * - a successful run creates files only under the evidence scope;
 * - fixture workspaces are removed after success and after failure;
 * - the host repository's Git status is the same before and after.
 */

const REPO_ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
/** This file's own temp prefix, so other suites' fixtures never look like leaks here. */
const PREFIX = 'protoyard-dwp-isolation-';

function hostStatus(): string {
  return execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all', '--', '.'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

let hostBefore = '';
let tempBefore: string[] = [];
beforeAll(() => {
  hostBefore = hostStatus();
  tempBefore = fixtureTempDirs(PREFIX);
});
afterAll(() => {
  // No fixture outlives the suite, and the host source tree is untouched.
  expect(fixtureTempDirs(PREFIX)).toEqual(tempBefore);
  expect(hostStatus()).toBe(hostBefore);
});

/** Runs `body` on a fixture whose quick player is the fixture's own. */
function onFixture<T>(
  body: (
    fixture: DwpLoopFixture,
    quick: (...args: string[]) => ReturnType<typeof cli>
  ) => Promise<T>,
  values?: Record<string, string>
): Promise<T> {
  return withDwpLoopFixture(
    { tempPrefix: PREFIX, ...(values ? { values } : {}) },
    async (fixture) => {
      const restore = setQuickPlayerLocator(() => fixture.player);
      try {
        return await body(fixture, (...args) =>
          cli(['--root', fixture.root, '--json', 'quick', ...args])
        );
      } finally {
        restore();
      }
    }
  );
}

const errorCode = (result: Awaited<ReturnType<typeof cli>>) =>
  result.json<{ error?: { code: string } }>().error?.code;

describe('the runner keeps the task inside the plan scope', () => {
  it('resolves the template’s own paths inside the plan', async () => {
    await onFixture(async (fixture) => {
      const args = planQuickArgs(fixture);
      const out = args[args.indexOf('--out') + 1] as string;
      const input = args[args.indexOf('--blueprint') + 1] as string;
      expect(out).toBe(fixture.explorationDir);
      expect(input).toBe(fixture.blueprintPath);
    });
  });

  it.each([
    ['--out=outside', { SCRATCH_DIR: 'analysis_results/prototypes/idea --out=../../outside' }],
    [
      '--blueprint=outside',
      { INPUT: 'analysis_results/prototypes/idea --blueprint=../../outside' },
    ],
    ['an unapproved option', { SCRATCH_DIR: 'analysis_results/prototypes/idea --force' }],
  ])('refuses %s in the filled quick command', async (_label, values) => {
    await onFixture(async (fixture) => {
      expect(() => planQuickArgs(fixture)).toThrow(PlanScopeError);
    }, values);
  });

  it.each([
    ['--blueprint=', '--blueprint input/analytics.json', '--blueprint=input/analytics.json'],
    [
      '--out=',
      `--out analysis_results/prototypes/dwp-loop-fixture`,
      `--out=analysis_results/prototypes/dwp-loop-fixture`,
    ],
  ])('refuses the unsupported %s form', async (_label, oldText, newText) => {
    await onFixture(async (fixture) => {
      const path = join(fixture.planDir, 'exploration-task.md');
      const task = readFileSync(path, 'utf8');
      expect(task).toContain(oldText);
      writeFileSync(path, task.replace(oldText, newText));
      expect(() => planQuickArgs(fixture)).toThrow(PlanScopeError);
    });
  });

  it.each([
    ['a traversal out of the evidence', { SCRATCH_DIR: 'analysis_results/prototypes/../../..' }],
    ['a traversal into the host', { SCRATCH_DIR: '../../../../../../tmp' }],
    ['an absolute folder', { SCRATCH_DIR: '/var/tmp' }],
    ['the plan root instead of the evidence', { SCRATCH_DIR: '.' }],
    ['an input outside the plan', { INPUT: '../outside.json' }],
  ])('refuses %s before the CLI runs', async (_label, values) => {
    await onFixture(async (fixture) => {
      const before = treeSnapshot(fixture.root);
      expect(() => planQuickArgs(fixture)).toThrow(PlanScopeError);
      expect(treeChanges(before, treeSnapshot(fixture.root))).toEqual({
        created: [],
        changed: [],
        removed: [],
      });
    }, values);
  });

  it('refuses a symbolic link inside the evidence folder that leads out of it', async () => {
    await onFixture(async (fixture) => {
      const outside = join(fixture.root, 'prototypes');
      symlinkSync(outside, join(fixture.evidenceDir, 'linked'));
      expect(() => resolvePlanScoped(fixture, 'analysis_results/prototypes/linked/idea')).toThrow(
        /symbolic link/
      );
      expect(resolvePlanScoped(fixture, 'analysis_results/prototypes/new-idea')).toBe(
        join(fixture.evidenceDir, 'new-idea')
      );
    });
  });
});

describe('the CLI refuses out-of-scope output on its own', () => {
  it.each([
    ['a prototype source folder', 'prototypes/escaped'],
    ['a template folder', 'templates/escaped'],
    ['the workspace root', '.'],
    ['a traversal into prototypes', 'plan/analysis_results/prototypes/../../../prototypes/x'],
  ])('refuses --out into %s and writes nothing', async (_label, out) => {
    await onFixture(async (fixture, quick) => {
      const before = treeSnapshot(fixture.root);
      const result = await quick(
        '--blueprint',
        fixture.blueprintPath,
        '--slug',
        'escaped',
        '--out',
        join(fixture.root, out),
        '--allow-external-out'
      );
      expect(result.code).toBe(2);
      expect(errorCode(result)).toBe('unsafe_path');
      expect(treeChanges(before, treeSnapshot(fixture.root))).toEqual({
        created: [],
        changed: [],
        removed: [],
      });
    });
  });

  it('refuses a folder it did not create, and a symlinked output, without touching them', async () => {
    await onFixture(async (fixture, quick) => {
      const occupied = join(fixture.evidenceDir, 'notes');
      mkdirSync(occupied, { recursive: true });
      writeFileSync(join(occupied, 'keep.md'), 'reviewer notes\n');
      symlinkSync(join(fixture.root, 'prototypes'), join(fixture.evidenceDir, 'linked'));
      const before = treeSnapshot(fixture.root);
      for (const out of [occupied, join(fixture.evidenceDir, 'linked')]) {
        const result = await quick('--blueprint', fixture.blueprintPath, '--out', out);
        expect(errorCode(result), out).toBe('unsafe_path');
      }
      expect(treeChanges(before, treeSnapshot(fixture.root))).toEqual({
        created: [],
        changed: [],
        removed: [],
      });
    });
  });

  it('leaves no partial output when the input is invalid', async () => {
    await onFixture(async (fixture, quick) => {
      writeFileSync(fixture.blueprintPath, '{"formatVersion": 1, "name": "Broken"}\n');
      const before = treeSnapshot(fixture.root);
      const result = await quick(
        '--blueprint',
        fixture.blueprintPath,
        '--out',
        fixture.explorationDir
      );
      expect(errorCode(result)).toBe('validation');
      expect(existsSync(fixture.explorationDir)).toBe(false);
      expect(treeChanges(before, treeSnapshot(fixture.root))).toEqual({
        created: [],
        changed: [],
        removed: [],
      });
    });
  });
});

describe('a successful loop writes only the plan’s evidence', () => {
  it('creates files under analysis_results/prototypes/ and nowhere else', async () => {
    await onFixture(async (fixture, quick) => {
      const before = treeSnapshot(fixture.root);
      const result = await quick(...planQuickArgs(fixture));
      expect(result.code, result.stderr || result.stdout).toBe(0);
      const { created, changed, removed } = treeChanges(before, treeSnapshot(fixture.root));
      expect(changed).toEqual([]);
      expect(removed).toEqual([]);
      expect(created.length).toBeGreaterThan(5);
      for (const path of created) {
        expect(path.startsWith('plan/analysis_results/prototypes/dwp-loop-fixture/'), path).toBe(
          true
        );
      }
      // The exploration is self-contained: no shared quick zone, no source folders touched.
      expect(existsSync(join(fixture.root, '.protoyard'))).toBe(false);
      expect(readdirSync(join(fixture.root, 'prototypes'))).toEqual([]);
      expect(readdirSync(join(fixture.root, 'templates'))).toEqual([]);
      // No staging or temp files left behind next to the outputs.
      expect(created.filter((path) => /\.tmp$|\.staging/.test(path))).toEqual([]);
    });
  });
});

describe('cleanup', () => {
  it('removes the fixture workspace after success', async () => {
    let root = '';
    await onFixture(async (fixture) => {
      root = fixture.root;
      expect(existsSync(root)).toBe(true);
      expect(root.startsWith(resolve(tmpdir()))).toBe(true);
    });
    expect(existsSync(root)).toBe(false);
  });

  it('removes the fixture workspace when the loop fails', async () => {
    let root = '';
    await expect(
      onFixture(async (fixture, quick) => {
        root = fixture.root;
        const result = await quick(...planQuickArgs(fixture));
        expect(result.code).toBe(0);
        throw new Error('a later loop step failed');
      })
    ).rejects.toThrow('a later loop step failed');
    expect(root).not.toBe('');
    expect(existsSync(root)).toBe(false);
  });

  it('removes the fixture workspace when the task leaves the plan scope', async () => {
    let root = '';
    await expect(
      onFixture(
        async (fixture) => {
          root = fixture.root;
          planQuickArgs(fixture);
        },
        { SCRATCH_DIR: '../../escape' }
      )
    ).rejects.toThrow(PlanScopeError);
    expect(existsSync(root)).toBe(false);
  });
});
