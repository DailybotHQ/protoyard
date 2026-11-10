// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CI_RENDER_CHECK_PACKAGES,
  ciTemplatesRoot,
  manualStepsForInit,
} from '../src/lib/ci-templates.ts';
import { addPrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

type InitEnvelope = {
  ok: boolean;
  data: {
    files: { id: string; path: string; action: string; diff?: string }[];
    manualSteps: string[];
  };
};

const BUILD_TEMPLATE = join(ciTemplatesRoot(), 'github', 'protoyard-build.yml');

/** The `run:` block of a named step of a rendered workflow. */
function stepRun(workflow: string, name: string): string {
  const start = workflow.indexOf(`- name: ${name}`);
  expect(start, name).toBeGreaterThan(-1);
  const rest = workflow.slice(start);
  const next = rest.indexOf('\n      - ', 1);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('protoyard ci: the render check of locked prototypes', () => {
  let ws: TempWorkspace | undefined;
  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });

  it('the build workflow runs check ds --render only when a prototype is locked', () => {
    const source = readFileSync(BUILD_TEMPLATE, 'utf8');
    expect(source.split('\n')[0]).toBe('# protoyard-ci-template: build v4');
    const find = stepRun(source, 'Find locked prototypes');
    expect(find).toContain('protoyard check ds --report --json');
    expect(find).toContain('>> "$GITHUB_OUTPUT"');
    const render = stepRun(source, 'Render check of locked prototypes (required for them)');
    expect(render).toContain("if: steps.locked.outputs.slugs != ''");
    expect(render).toContain('run: pnpm protoyard check ds --render');
    // No report flag: a finding fails the job (the check is required for locked prototypes).
    expect(render).not.toContain('--report');
    for (const name of [
      'Resolve the Playwright version',
      'Cache Playwright browsers',
      'Install Chromium',
      'Install Chromium system dependencies (cached browser)',
    ]) {
      expect(stepRun(source, name)).toContain("steps.locked.outputs.slugs != ''");
    }
    // It runs after the builds it reuses, and before the upload.
    expect(source.indexOf('pnpm protoyard check ds --render')).toBeGreaterThan(
      source.indexOf('pnpm protoyard build --all')
    );
    expect(source.indexOf('pnpm protoyard check ds --render')).toBeLessThan(
      source.indexOf('Upload exported ZIPs')
    );
  });

  it('the locked-prototype lookup of the workflow selects locked prototypes only', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'locked-app', {
      designSystem: { id: 'acme', version: '1.0.0', locked: true },
    });
    ws.write('prototypes/locked-app/src/App.svelte', '<button>raw</button>\n');
    addPrototype(ws, 'bound-app', {
      designSystem: { id: 'acme', version: '1.0.0', locked: false },
    });
    addPrototype(ws, 'loose-app');
    const result = await cli(['--root', ws.root, '--json', 'check', 'ds', '--report']);
    // Report mode never fails, even with a violation in the locked prototype.
    expect(result.code).toBe(0);
    const script = /node -e '([^']+)'/.exec(
      stepRun(readFileSync(BUILD_TEMPLATE, 'utf8'), 'Find locked prototypes')
    )?.[1];
    expect(script).toBeDefined();
    const lookup = spawnSync(process.execPath, ['-e', script as string], {
      input: result.stdout,
      encoding: 'utf8',
    });
    expect(lookup.status).toBe(0);
    expect(lookup.stdout).toBe('locked-app');
  });

  it('ci init renders the step, pinned and without placeholders, and names its dependencies', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'alpha-app');
    const result = await cli([
      '--root',
      ws.root,
      '--json',
      'ci',
      'init',
      '--with',
      'build',
      '--dry-run',
    ]);
    expect(result.code).toBe(0);
    const body = result.json<InitEnvelope>();
    const file = body.data.files.find((f) => f.id === 'build');
    expect(file?.path).toBe('.github/workflows/protoyard-build.yml');
    expect(file?.diff).toContain('+        run: pnpm protoyard check ds --render');
    expect(file?.diff).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(body.data.manualSteps.join('\n')).toContain('check ds --render');
    for (const name of CI_RENDER_CHECK_PACKAGES)
      expect(body.data.manualSteps.join('\n')).toContain(name);
    // Only the build workflow carries the step.
    expect(
      manualStepsForInit({ provider: 'github', workflows: ['check'], secrets: [] }).join('\n')
    ).not.toContain('check ds --render');
  });

  it('ci check reports a build workflow scaffolded before the step as outdated', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'alpha-app');
    expect((await cli(['--root', ws.root, 'ci', 'init', '--with', 'build'])).code).toBe(0);
    const path = join(ws.root, '.github/workflows/protoyard-build.yml');
    expect(readFileSync(path, 'utf8')).toContain('pnpm protoyard check ds --render');
    const fresh = await cli(['--root', ws.root, '--json', 'ci', 'check']);
    expect(
      fresh.json<{ data: { files: { id: string; status: string }[] } }>().data.files
    ).toMatchObject([{ id: 'build', status: 'up-to-date' }]);

    ws.write(
      '.github/workflows/protoyard-build.yml',
      '# protoyard-ci-template: build v3\nname: Protoyard affected builds\n'
    );
    const old = await cli(['--root', ws.root, '--json', 'ci', 'check']);
    expect(
      old.json<{ data: { files: { id: string; outdated: boolean; latestVersion: number }[] } }>()
        .data.files[0]
    ).toMatchObject({ id: 'build', outdated: true, latestVersion: 4 });
  });
});
