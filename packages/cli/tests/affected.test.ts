// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type AffectedRegistry,
  assertSafeGitRef,
  classifyPath,
  mapChangedPaths,
} from '../src/lib/affected.ts';
import { CliError } from '../src/lib/output.ts';
import { run } from '../src/lib/process.ts';
import { addPrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const registry: AffectedRegistry = {
  entries: [
    { kind: 'prototype', slug: 'alpha-app' },
    { kind: 'prototype', slug: 'beta-app' },
    { kind: 'template', slug: 'blank' },
  ],
};

describe('assertSafeGitRef', () => {
  it('accepts common refs', () => {
    for (const ref of ['HEAD', 'HEAD~1', 'HEAD^', 'main', 'origin/main', 'abc1234', 'v1.2.3']) {
      expect(assertSafeGitRef(ref)).toBe(ref);
    }
  });

  it('rejects empty, option-like, range and shell-tainted values', () => {
    for (const bad of ['', '  ', '-r', 'main;rm', 'a b', 'main$(x)', 'main`x`', 'a..b', 'a&b']) {
      expect(() => assertSafeGitRef(bad), bad).toThrow(CliError);
    }
  });
});

describe('classifyPath', () => {
  it('maps prototypes/<slug>/** to that slug', () => {
    expect(classifyPath('prototypes/alpha-app/src/main.ts')).toEqual({
      effect: 'slug',
      slug: 'alpha-app',
      reason: 'prototype',
    });
    expect(classifyPath('prototypes/beta-app')).toEqual({
      effect: 'slug',
      slug: 'beta-app',
      reason: 'prototype',
    });
  });

  it('treats packages and templates as shared', () => {
    expect(classifyPath('packages/core/src/index.ts').effect).toBe('all');
    expect(classifyPath('templates/blank/src/main.ts').effect).toBe('all');
  });

  it('treats root configs as shared and docs as none', () => {
    expect(classifyPath('package.json')).toEqual({ effect: 'all', reason: 'root-config' });
    expect(classifyPath('pnpm-workspace.yaml').effect).toBe('all');
    expect(classifyPath('docs/ARCHITECTURE.md')).toEqual({ effect: 'none', reason: 'docs' });
    expect(classifyPath('README.md').effect).toBe('none');
    expect(classifyPath('AGENTS.md').effect).toBe('none');
  });
});

describe('mapChangedPaths', () => {
  it('returns only the touched prototype slug', () => {
    const result = mapChangedPaths(
      ['prototypes/alpha-app/src/App.svelte', 'docs/README.md'],
      registry
    );
    expect(result).toEqual({
      slugs: ['alpha-app'],
      reasons: { 'alpha-app': 'prototype' },
      all: false,
    });
  });

  it('returns every prototype when packages change', () => {
    const result = mapChangedPaths(['packages/cli/src/lib/affected.ts'], registry);
    expect(result.all).toBe(true);
    expect(result.slugs).toEqual(['alpha-app', 'beta-app']);
    expect(result.reasons['alpha-app']).toBe('packages');
    expect(result.reasons['beta-app']).toBe('packages');
  });

  it('returns every prototype for root configs and templates', () => {
    expect(mapChangedPaths(['biome.json'], registry).all).toBe(true);
    expect(mapChangedPaths(['templates/blank/protoyard.json'], registry).all).toBe(true);
  });

  it('returns none for docs-only diffs', () => {
    const result = mapChangedPaths(
      ['docs/PRODUCT_SPEC.md', 'README.md', 'AGENTS.md', '.agents/skills/x/SKILL.md'],
      registry
    );
    expect(result).toEqual({ slugs: [], reasons: {}, all: false });
  });

  it('shared paths win over individual prototype paths', () => {
    const result = mapChangedPaths(
      ['prototypes/alpha-app/a.ts', 'packages/ui/src/Button.svelte'],
      registry
    );
    expect(result.all).toBe(true);
    expect(result.slugs).toEqual(['alpha-app', 'beta-app']);
  });

  it('is fast on large path lists (perf budget: well under 1 s)', () => {
    const paths = Array.from({ length: 5_000 }, (_, i) => {
      if (i % 50 === 0) return `packages/core/src/f${i}.ts`;
      if (i % 7 === 0) return `docs/page-${i}.md`;
      return `prototypes/alpha-app/src/f${i}.ts`;
    });
    const started = performance.now();
    const result = mapChangedPaths(paths, registry);
    const ms = performance.now() - started;
    expect(result.all).toBe(true);
    expect(ms).toBeLessThan(100);
    // Visible in vitest output when reporters print console.
    // eslint-disable-next-line no-console
    console.log(`mapChangedPaths 5000 paths: ${ms.toFixed(2)} ms`);
  });
});

describe('protoyard affected (git integration)', () => {
  let ws: TempWorkspace | undefined;
  let gitRoot: string | undefined;

  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
    if (gitRoot) {
      rmSync(gitRoot, { recursive: true, force: true });
      gitRoot = undefined;
    }
  });

  async function git(cwd: string, args: string[]) {
    const result = await run('git', args, { cwd, timeoutMs: 15_000 });
    if (result.code !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
    }
    return result;
  }

  it('selects only the prototype changed since HEAD~1 in a temp repo', async () => {
    // Real git repo with the CLI workspace layout and two prototypes.
    gitRoot = mkdtempSync(join(tmpdir(), 'protoyard-affected-git-'));
    ws = {
      root: gitRoot,
      write(path, content) {
        const file = join(gitRoot!, path);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(
          file,
          typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`
        );
      },
      cleanup: () => {
        /* afterEach removes gitRoot */
      },
    };

    ws.write('pnpm-workspace.yaml', 'packages:\n  - prototypes/*\n  - templates/*\n');
    ws.write('package.json', { name: 'affected-fixture', private: true });
    mkdirSync(join(gitRoot, 'prototypes'), { recursive: true });
    mkdirSync(join(gitRoot, 'templates'), { recursive: true });
    addPrototype(ws, 'alpha-app');
    addPrototype(ws, 'beta-app');
    ws.write('prototypes/alpha-app/src/main.ts', 'export const a = 1;\n');
    ws.write('prototypes/beta-app/src/main.ts', 'export const b = 1;\n');
    ws.write('docs/note.md', '# note\n');

    await git(gitRoot, ['init']);
    await git(gitRoot, ['config', 'user.email', 'affected@example.com']);
    await git(gitRoot, ['config', 'user.name', 'Affected Fixture']);
    await git(gitRoot, ['add', '-A']);
    await git(gitRoot, ['commit', '-m', 'base']);

    ws.write('prototypes/alpha-app/src/main.ts', 'export const a = 2;\n');
    await git(gitRoot, ['add', '-A']);
    await git(gitRoot, ['commit', '-m', 'touch alpha']);

    const started = performance.now();
    const result = await cli(['affected', '--since', 'HEAD~1', '--json', '--root', gitRoot]);
    const ms = performance.now() - started;
    // eslint-disable-next-line no-console
    console.log(`affected git integration: ${ms.toFixed(1)} ms`);

    expect(result.code).toBe(0);
    const body = result.json<{
      ok: boolean;
      command: string;
      data: {
        slugs: string[];
        all: boolean;
        csv: string;
        reasons: Record<string, string>;
        durationMs: number;
      };
    }>();
    expect(body.ok).toBe(true);
    expect(body.command).toBe('affected');
    expect(body.data.all).toBe(false);
    expect(body.data.slugs).toEqual(['alpha-app']);
    expect(body.data.csv).toBe('alpha-app');
    expect(body.data.reasons['alpha-app']).toBe('prototype');
    expect(body.data.durationMs).toBeLessThan(1000);
    expect(ms).toBeLessThan(5000);
  });

  it('returns empty csv for a docs-only commit', async () => {
    const temp = createWorkspace();
    ws = temp;
    addPrototype(ws, 'alpha-app');
    addPrototype(ws, 'beta-app');
    ws.write('docs/only.md', 'docs\n');

    await git(temp.root, ['init']);
    await git(temp.root, ['config', 'user.email', 'affected@example.com']);
    await git(temp.root, ['config', 'user.name', 'Affected Fixture']);
    await git(temp.root, ['add', '-A']);
    await git(temp.root, ['commit', '-m', 'base']);

    ws.write('docs/only.md', 'docs changed\n');
    await git(temp.root, ['add', '-A']);
    await git(temp.root, ['commit', '-m', 'docs']);

    const result = await cli([
      'affected',
      '--since',
      'HEAD~1',
      '--format',
      'csv',
      '--root',
      temp.root,
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  it('requires --since and rejects unsafe refs', async () => {
    const temp = createWorkspace();
    ws = temp;
    const missing = await cli(['affected', '--root', temp.root]);
    expect(missing.code).toBe(2);

    // Commander still requires the option; unsafe values fail in the handler.
    await git(temp.root, ['init']);
    await git(temp.root, ['config', 'user.email', 'affected@example.com']);
    await git(temp.root, ['config', 'user.name', 'Affected Fixture']);
    addPrototype(ws, 'alpha-app');
    await git(temp.root, ['add', '-A']);
    await git(temp.root, ['commit', '-m', 'base']);

    const bad = await cli(['affected', '--since', 'main;rm', '--json', '--root', temp.root]);
    expect(bad.code).toBe(2);
    expect(bad.json().ok).toBe(false);
  });
});
