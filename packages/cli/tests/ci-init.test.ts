// @vitest-environment node
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyCiInit,
  assertShaPinnedUses,
  assertWritable,
  CI_HASH_PREFIX,
  checkCiDrift,
  ciTemplatesRoot,
  contentSha256,
  driftStatus,
  parseTemplateHeader,
  parseWorkflowList,
  planCiInit,
  renderTemplate,
  splitHashLine,
  stampContent,
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

describe('drift detection (ci check)', () => {
  const rendered =
    '# protoyard-ci-template: check v1\nname: Protoyard check\non:\n  pull_request:\n';
  const latestV1 = (id: string) => (id === 'check' ? 1 : null);

  it('drift: ci init stamps a hash of the rendered body under the template header', () => {
    const stamped = stampContent(rendered);
    const lines = stamped.split('\n');
    expect(lines[0]).toBe('# protoyard-ci-template: check v1');
    expect(lines[1]).toBe(`${CI_HASH_PREFIX}${contentSha256(rendered)}`);
    expect(splitHashLine(stamped)).toEqual({ hash: contentSha256(rendered), body: rendered });
    expect(parseTemplateHeader(stamped)).toEqual({ id: 'check', version: 1 });
    expect(() => stampContent('name: no header\n')).toThrow(/header/);
  });

  it('drift: classifies up-to-date, modified, outdated, unhashed and unmanaged files', () => {
    const stamped = stampContent(rendered);
    expect(driftStatus(stamped, latestV1)).toMatchObject({
      status: 'up-to-date',
      modified: false,
      outdated: false,
    });
    expect(driftStatus(stamped.replace('Protoyard check', 'Our check'), latestV1)).toMatchObject({
      status: 'modified',
      modified: true,
    });
    expect(driftStatus(stamped, () => 2)).toMatchObject({
      status: 'outdated',
      version: 1,
      latestVersion: 2,
      outdated: true,
      modified: false,
    });
    // Edited AND behind: reported as modified, with outdated still flagged.
    expect(driftStatus(stamped.replace('pull_request', 'push'), () => 2)).toMatchObject({
      status: 'modified',
      outdated: true,
    });
    expect(driftStatus(rendered, latestV1).status).toBe('unhashed');
    expect(driftStatus('name: hand written\n', latestV1).status).toBe('unmanaged');
    expect(
      driftStatus(stampContent(rendered.replace('check v1', 'custom v1')), latestV1).status
    ).toBe('unmanaged');
  });

  it('drift: ci check reports scaffolded files and --strict exits 4 on a local edit', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'alpha-app');
    expect(
      (await cli(['--root', ws.root, '--json', 'ci', 'check'])).json<{
        data: { files: unknown[] };
      }>().data.files
    ).toEqual([]);
    await cli([
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
    const clean = await cli(['--root', ws.root, '--json', 'ci', 'check', '--strict']);
    expect(clean.code).toBe(0);
    expect(clean.json<{ data: { upToDate: number; drift: number } }>().data).toMatchObject({
      upToDate: 2,
      drift: 0,
    });

    const file = join(ws.root, '.github/workflows/protoyard-check.yml');
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace('name: Protoyard check', 'name: Edited check')
    );
    writeFileSync(join(ws.root, '.github/workflows/protoyard-legacy.yml'), 'name: hand written\n');
    const loose = await cli(['--root', ws.root, '--json', 'ci', 'check']);
    expect(loose.code).toBe(0);
    const files = loose.json<{
      data: { files: { path: string; status: string }[]; drift: number };
    }>().data;
    expect(files.files.map((f) => [f.path, f.status])).toEqual([
      ['.github/workflows/protoyard-build.yml', 'up-to-date'],
      ['.github/workflows/protoyard-check.yml', 'modified'],
      ['.github/workflows/protoyard-legacy.yml', 'unmanaged'],
    ]);
    expect(files.drift).toBe(1);
    const strict = await cli(['--root', ws.root, '--json', 'ci', 'check', '--strict']);
    expect(strict.code).toBe(4);
    expect(strict.json<{ error: { hint: string } }>().error.hint).toContain(
      'ci init --with check --dry-run'
    );

    // --force restores the template and its hash.
    await cli([
      '--root',
      ws.root,
      '--json',
      'ci',
      'init',
      '--with',
      'check',
      '--force',
      '--prototypes',
      'alpha-app',
    ]);
    expect((await cli(['--root', ws.root, '--json', 'ci', 'check', '--strict'])).code).toBe(0);
  });

  it('drift: a newer packaged template marks an untouched workflow outdated', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'alpha-app');
    await cli([
      '--root',
      ws.root,
      '--json',
      'ci',
      'init',
      '--with',
      'check,e2e',
      '--prototypes',
      'alpha-app',
    ]);
    const templates = mkdtempSync(join(tmpdir(), 'protoyard-ci-templates-'));
    try {
      cpSync(ciTemplatesRoot(), templates, { recursive: true });
      const check = join(templates, 'github', 'protoyard-check.yml');
      writeFileSync(check, readFileSync(check, 'utf8').replace(/check v\d+/, 'check v99'));
      const reports = await checkCiDrift({
        root: ws.root,
        provider: 'github',
        templatesRoot: templates,
      });
      expect(reports.map((r) => [r.id, r.status, r.latestVersion])).toEqual([
        ['check', 'outdated', 99],
        ['e2e', 'up-to-date', 1],
      ]);
    } finally {
      rmSync(templates, { recursive: true, force: true });
    }
  });

  // Runs `doctor` three times (git, Playwright and provider probes): slow under full-suite load.
  it('drift: doctor adds an informational line for outdated or unhashed workflows', {
    timeout: 60_000,
  }, async () => {
    ws = createWorkspace();
    addPrototype(ws, 'alpha-app');
    const doctorLine = async () =>
      (await cli(['--root', ws?.root ?? '', '--json', 'doctor', '--offline']))
        .json<{
          data: { checks: { id: string; status: string; detail: string; required: boolean }[] };
        }>()
        .data.checks.find((c) => c.id === 'ci-templates');
    expect(await doctorLine()).toBeUndefined();
    await cli([
      '--root',
      ws.root,
      '--json',
      'ci',
      'init',
      '--with',
      'check',
      '--prototypes',
      'alpha-app',
    ]);
    expect(await doctorLine()).toMatchObject({
      status: 'pass',
      detail: '1 up to date',
      required: false,
    });
    // A workflow scaffolded from an older template version (v0), untouched since.
    const file = join(ws.root, '.github/workflows/protoyard-check.yml');
    const { body } = splitHashLine(readFileSync(file, 'utf8'));
    writeFileSync(file, stampContent(body.replace(/check v\d+/, 'check v0')));
    expect(await doctorLine()).toMatchObject({
      status: 'warn',
      detail: '1 of 1 outdated: .github/workflows/protoyard-check.yml',
      required: false,
    });
  });
});
