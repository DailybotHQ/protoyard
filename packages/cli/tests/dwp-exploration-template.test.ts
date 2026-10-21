// @vitest-environment node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkInvocation,
  cliTree,
  extractInvocations,
  shellWords,
} from '../../../scripts/check-skill-cli.ts';
import { setQuickPlayerLocator } from '../src/commands/quick/index.ts';
import { QUICK_MAX_VARIANTS } from '../src/lib/quick/model.ts';
import {
  createPlayerAssetsManifest,
  readPlayerAssetsManifest,
} from '../src/lib/quick/player-assets.ts';
import { createProgram } from '../src/program.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

/**
 * The DWP exploration task template
 * (integrations/deepworkplan/protoyard/templates/EXPLORATION_TASK.md): its
 * placeholders are documented and complete, its commands exist in the real
 * CLI, and the quick command it prescribes really produces the envelope
 * fields and the determinism it promises.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const FILE = join('integrations', 'deepworkplan', 'protoyard', 'templates', 'EXPLORATION_TASK.md');
const DOC = readFileSync(join(REPO, FILE), 'utf8');
const START = '<!-- exploration-template:start -->';
const END = '<!-- exploration-template:end -->';
const BODY = DOC.slice(DOC.indexOf(START) + START.length, DOC.indexOf(END));
const placeholders = (text: string) => new Set(text.match(/\{\{[A-Z_]+\}\}/g) ?? []);

/** Placeholders named in the documentation table (first column). */
function documented(): Set<string> {
  const start = DOC.indexOf('## Placeholders');
  const table = DOC.slice(start, DOC.indexOf(START));
  return new Set(
    [...table.matchAll(/^\| `(\{\{[A-Z_]+\}\})` \|/gm)].map((match) => match[1] as string)
  );
}

describe('the exploration task template', () => {
  it('has a template body between its markers', () => {
    expect(DOC.indexOf(START)).toBeGreaterThan(0);
    expect(DOC.indexOf(END)).toBeGreaterThan(DOC.indexOf(START));
    expect(BODY.trim().startsWith('# {{TASK_TITLE}}')).toBe(true);
  });

  it('has placeholders for the idea, variants, output scope, decision and evidence', () => {
    const used = placeholders(BODY);
    for (const required of [
      '{{IDEA}}',
      '{{DECISION_QUESTION}}',
      '{{VARIANT_COUNT}}',
      '{{SEED}}',
      '{{EVIDENCE_DIR}}',
      '{{SCRATCH_DIR}}',
      '{{CHOSEN_VARIANT}}',
      '{{DECISION}}',
      '{{EVIDENCE}}',
      '{{CRITERIA}}',
    ]) {
      expect(used, required).toContain(required);
    }
  });

  it('documents exactly the placeholders the body uses', () => {
    expect([...documented()].sort()).toEqual([...placeholders(BODY)].sort());
  });

  it('confines evidence to analysis_results and records a missing browser as a skip', () => {
    expect(DOC).toContain('analysis_results/prototypes/');
    expect(BODY).toContain('`playwright-unavailable`');
    expect(BODY).toMatch(/Never written by this task/);
    expect(DOC).toContain(`the CLI accepts 1–${QUICK_MAX_VARIANTS}`);
  });

  it('names no absolute local path', () => {
    expect(DOC).not.toMatch(/(?:^|[\s`(])(?:\/Users\/|\/home\/[a-z]|[A-Z]:\\)/m);
  });

  it('uses only commands and flags the real CLI has', () => {
    const tree = cliTree(createProgram({ setExitCode: () => {} }));
    const invocations = extractInvocations(DOC, FILE);
    const paths = new Set(invocations.map((i) => i.args.filter((a) => /^[a-z]/.test(a))[0]));
    expect(paths).toEqual(new Set([undefined, 'quick', 'blueprint']));
    expect(invocations.length).toBeGreaterThanOrEqual(5);
    expect(invocations.flatMap((invocation) => checkInvocation(tree, invocation))).toEqual([]);
  });
});

describe('the template’s quick command, run as written', () => {
  let ws: TempWorkspace;
  let restore: (() => void)[] = [];
  beforeEach(async () => {
    ws = createWorkspace();
    const dir = join(ws.root, 'fixture-player', 'dist', 'app');
    mkdirSync(join(dir, 'assets'), { recursive: true });
    writeFileSync(
      join(dir, 'index.html'),
      '<!doctype html><script type="module" src="./assets/app.js"></script>\n'
    );
    writeFileSync(join(dir, 'assets', 'app.js'), 'export {};\n');
    const manifest = await createPlayerAssetsManifest(dir, '1.0.0');
    const player = {
      dir,
      packageDir: join(ws.root, 'fixture-player'),
      version: '1.0.0',
      manifest,
      source: 'repository' as const,
    };
    restore = [
      setQuickPlayerLocator(() => ({ ...player, manifest: readPlayerAssetsManifest(dir) })),
    ];
  });
  afterEach(() => {
    for (const undo of restore.splice(0)) undo();
    ws.cleanup();
  });

  /** Section 4's `protoyard quick …` line with the placeholders filled in. */
  function filledQuickArgs(values: Record<string, string>): string[] {
    const line = /^protoyard quick --blueprint .*$/m.exec(BODY)?.[0];
    expect(line).toBeDefined();
    const filled = (line ?? '').replace(/\{\{([A-Z_]+)\}\}/g, (_match, name: string) => {
      const value = values[name];
      if (value === undefined) throw new Error(`no test value for {{${name}}}`);
      return value;
    });
    return shellWords(filled).slice(1);
  }

  type Envelope = {
    ok: boolean;
    data: {
      blueprintSha256: string;
      compare: string | null;
      variants: { id: string; label: string; dir: string; blueprintSha256: string }[];
    };
  };

  it('returns every envelope field the task reads, and reruns to the same variants', async () => {
    const values = {
      INPUT: join(REPO, 'blueprints', 'quick', 'analytics.json'),
      SLUG: 'gym-explore',
      SEED: '7',
      VARIANT_COUNT: '3',
      SCRATCH_DIR: join(ws.root, 'tmp', 'plan-scratch'),
    };
    const first = await cli(['--root', ws.root, ...filledQuickArgs(values)]);
    expect(first.code, first.stderr || first.stdout).toBe(0);
    const envelope = first.json<Envelope>();
    expect(envelope.ok).toBe(true);
    expect(envelope.data.blueprintSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(envelope.data.compare).toEqual(expect.any(String));
    expect(envelope.data.variants.map((variant) => variant.id)).toEqual(['v1', 'v2', 'v3']);
    for (const variant of envelope.data.variants) {
      expect(variant.label.length).toBeGreaterThan(0);
      expect(variant.blueprintSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(existsSync(join(ws.root, variant.dir, 'blueprint.json'))).toBe(true);
    }
    expect(existsSync(join(values.SCRATCH_DIR, values.SLUG, 'quick.json'))).toBe(true);

    // Section 5: the same command into `<slug>-rerun` gives identical hashes.
    const rerun = await cli([
      '--root',
      ws.root,
      ...filledQuickArgs({ ...values, SLUG: `${values.SLUG}-rerun` }),
    ]);
    expect(rerun.code, rerun.stderr || rerun.stdout).toBe(0);
    const again = rerun.json<Envelope>().data;
    expect(again.blueprintSha256).toBe(envelope.data.blueprintSha256);
    expect(again.variants.map((variant) => variant.blueprintSha256)).toEqual(
      envelope.data.variants.map((variant) => variant.blueprintSha256)
    );
  });
});
