// @vitest-environment node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyCiInit,
  assertShaPinnedUses,
  assertWritable,
  ciTemplatesRoot,
  parseWorkflowList,
  planCiInit,
  renderTemplate,
  unifiedDiff,
} from '../src/lib/ci-templates.ts';
import { CliError } from '../src/lib/output.ts';
import { addPrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const placeholders = {
  NODE_VERSION: '24',
  PROTOTYPES: 'alpha-app,beta-app',
  PROVIDER: 'cloudflare',
};

let ws: TempWorkspace | undefined;
afterEach(() => {
  ws?.cleanup();
  ws = undefined;
});

describe('ci template rendering', () => {
  it('substitutes placeholders and rejects leftovers', () => {
    const out = renderTemplate(
      'node={{NODE_VERSION}} list={{PROTOTYPES}} p={{PROVIDER}}\n',
      placeholders
    );
    expect(out).toBe('node=24 list=alpha-app,beta-app p=cloudflare\n');
    expect(() => renderTemplate('x={{MISSING}}', placeholders)).toThrow(CliError);
  });

  it('requires every uses: line to be a 40-char SHA pin', () => {
    const good =
      'steps:\n  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\n';
    expect(assertShaPinnedUses(good, 'good.yml')).toHaveLength(1);
    expect(() => assertShaPinnedUses('steps:\n  - uses: actions/checkout@v4\n', 'bad.yml')).toThrow(
      /40-character/
    );
    expect(() =>
      assertShaPinnedUses('steps:\n  - uses: actions/checkout@abcdef\n', 'bad.yml')
    ).toThrow(/40-character/);
  });

  it('parses --with lists', () => {
    expect(parseWorkflowList(undefined)).toEqual(['check', 'build']);
    expect(parseWorkflowList('check,preview')).toEqual(['check', 'preview']);
    expect(() => parseWorkflowList('check,nope')).toThrow(CliError);
  });

  it('renders packaged templates with no unresolved placeholders and SHA pins', async () => {
    const root = ciTemplatesRoot();
    expect(existsSync(join(root, 'github', 'protoyard-check.yml'))).toBe(true);
    const plan = await planCiInit({
      root: '/tmp/unused',
      provider: 'github',
      workflows: ['check', 'build', 'e2e', 'preview'],
      deploy: 'cloudflare',
      placeholders,
      templatesRoot: root,
    });
    expect(plan.files).toHaveLength(4);
    for (const file of plan.files) {
      expect(file.content).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
      assertShaPinnedUses(file.content, file.relativePath);
      expect(file.relativePath.startsWith('.github/workflows/protoyard-')).toBe(true);
    }
    expect(plan.secrets).toEqual(['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']);
    expect(plan.manualSteps.some((s) => s.includes('Settings are not changed'))).toBe(true);
  });
});

describe('protoyard ci init', () => {
  it('writes workflows into a temp workspace', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'alpha-app');
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'ci',
      'init',
      '--with',
      'check,build',
      '--prototypes',
      'alpha-app',
    ]);
    expect(run.code).toBe(0);
    const body = run.json<{
      ok: boolean;
      data: {
        dryRun: boolean;
        files: Array<{ path: string; action: string }>;
        secrets: string[];
        settingsNote: string;
      };
    }>();
    expect(body.ok).toBe(true);
    expect(body.data.dryRun).toBe(false);
    expect(body.data.files.map((f) => f.path).sort()).toEqual([
      '.github/workflows/protoyard-build.yml',
      '.github/workflows/protoyard-check.yml',
    ]);
    expect(body.data.secrets).toEqual([]);
    expect(body.data.settingsNote).toMatch(/Settings are not changed/);
    const check = readFileSync(join(ws.root, '.github/workflows/protoyard-check.yml'), 'utf8');
    expect(check).toContain("NODE_VERSION: '24'");
    // GitHub Actions `${{ … }}` expressions remain; only {{PLACEHOLDER}} tokens must be gone.
    expect(check).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
    assertShaPinnedUses(check, 'check');
  });

  it('refuses overwrite without --force and overwrites with --force', async () => {
    ws = createWorkspace();
    mkdirSync(join(ws.root, '.github/workflows'), { recursive: true });
    const path = join(ws.root, '.github/workflows/protoyard-check.yml');
    writeFileSync(path, '# stale\n');

    const blocked = await cli(['--root', ws.root, '--json', 'ci', 'init', '--with', 'check']);
    expect(blocked.code).toBe(2);
    const blockedBody = blocked.json<{ ok: boolean; error?: { message?: string } }>();
    expect(blockedBody.ok).toBe(false);
    expect(String(blockedBody.error?.message ?? '')).toMatch(/already exists/);
    expect(readFileSync(path, 'utf8')).toBe('# stale\n');

    const forced = await cli([
      '--root',
      ws.root,
      '--json',
      'ci',
      'init',
      '--with',
      'check',
      '--force',
    ]);
    expect(forced.code).toBe(0);
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('Protoyard check');
    expect(content).not.toContain('# stale');
  });

  it('--dry-run prints paths and writes nothing', async () => {
    ws = createWorkspace();
    const workflowsDir = join(ws.root, '.github/workflows');
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'ci',
      'init',
      '--with',
      'check,build',
      '--dry-run',
    ]);
    expect(run.code).toBe(0);
    const body = run.json<{
      data: {
        dryRun: boolean;
        files: Array<{ path: string; diff: string; action: string }>;
      };
    }>();
    expect(body.data.dryRun).toBe(true);
    expect(body.data.files).toHaveLength(2);
    for (const file of body.data.files) {
      expect(file.diff).toContain(`+++ b/${file.path}`);
      expect(file.action).toBe('create');
    }
    expect(existsSync(workflowsDir)).toBe(false);
  });

  it('lists Cloudflare secrets when preview is selected', async () => {
    ws = createWorkspace();
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'ci',
      'init',
      '--with',
      'preview',
      '--deploy',
      'cloudflare',
      '--dry-run',
    ]);
    expect(run.code).toBe(0);
    const body = run.json<{ data: { secrets: string[]; placeholders: { PROVIDER: string } } }>();
    expect(body.data.secrets).toEqual(['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']);
    expect(body.data.placeholders.PROVIDER).toBe('cloudflare');
  });

  it('assertWritable and applyCiInit honor force in-library', async () => {
    ws = createWorkspace();
    const plan = await planCiInit({
      root: ws.root,
      provider: 'github',
      workflows: ['check'],
      deploy: null,
      placeholders,
    });
    await applyCiInit(plan, { force: false });
    const again = await planCiInit({
      root: ws.root,
      provider: 'github',
      workflows: ['check'],
      deploy: null,
      placeholders,
    });
    expect(() => assertWritable(again, false)).toThrow(CliError);
    await applyCiInit(again, { force: true });
    expect(readFileSync(join(ws.root, again.files[0]!.relativePath), 'utf8')).toContain(
      'NODE_VERSION'
    );
  });

  it('unifiedDiff marks creates and edits', () => {
    const create = unifiedDiff('a.yml', null, 'one\ntwo\n');
    expect(create).toContain('--- /dev/null');
    expect(create).toContain('+one');
    const edit = unifiedDiff('a.yml', 'one\n', 'one\ntwo\n');
    expect(edit).toContain('--- a/a.yml');
    expect(edit).toContain('+two');
  });
});
