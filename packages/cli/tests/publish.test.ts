// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOutput } from '../src/lib/output.ts';
import { publishPrototype } from '../src/lib/publish-run.ts';
import { createContext, resolveTarget } from '../src/lib/workspace.ts';
import { formatCommand } from '../src/publish/cli-tool.ts';
import {
  cloudflareArgs,
  cloudflareEnsureProjectArgs,
  ensureCloudflareProject,
  isCloudflareProjectAlreadyExists,
  parseCloudflareOutput,
  parseCloudflareProjectList,
  validateCloudflareBranch,
  validateCloudflareProject,
} from '../src/publish/cloudflare.ts';
import { createProvider } from '../src/publish/index.ts';
import { netlifyArgs, parseNetlifyOutput } from '../src/publish/netlify.ts';
import type { PublishInput } from '../src/publish/types.ts';
import { parseVercelOutput, vercelArgs, vercelLinkArgs } from '../src/publish/vercel.ts';
import { addBuildablePrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const input = {
  slug: 'crm',
  distDir: '/w/artifacts/crm/dist',
  project: 'protoyard-crm',
  target: 'preview' as const,
};

describe('publish adapters', () => {
  it('uses a named branch for Cloudflare preview argv', () => {
    expect(cloudflareArgs({ ...input, branch: 'pr-42' })).toContain('pr-42');
    expect(cloudflareArgs({ ...input, branch: 'pr-42' })).toEqual([
      'pages',
      'deploy',
      '/w/artifacts/crm/dist',
      '--project-name',
      'protoyard-crm',
      '--branch',
      'pr-42',
      '--commit-dirty=true',
    ]);
    expect(cloudflareArgs({ ...input, target: 'production', branch: 'pr-42' })).toContain('main');
  });

  it('validates Cloudflare preview branch slugs', () => {
    expect(validateCloudflareBranch('pr-42')).toBeNull();
    for (const bad of ['main', 'Upper', '-lead', 'trail-', 'a_b', 'x'.repeat(64)]) {
      expect(validateCloudflareBranch(bad), bad).not.toBeNull();
    }
  });

  it('builds exact provider argv arrays', () => {
    expect(cloudflareArgs(input)).toEqual([
      'pages',
      'deploy',
      '/w/artifacts/crm/dist',
      '--project-name',
      'protoyard-crm',
      '--branch',
      'preview',
      '--commit-dirty=true',
    ]);
    expect(cloudflareArgs({ ...input, target: 'production' })).toContain('main');
    expect(netlifyArgs({ ...input, target: 'production' })).toEqual([
      'deploy',
      '--dir',
      '/w/artifacts/crm/dist',
      '--site',
      'protoyard-crm',
      '--prod',
      '--json',
    ]);
    expect(vercelLinkArgs(input)).toEqual([
      'link',
      '--yes',
      '--project',
      'protoyard-crm',
      '--cwd',
      '/w/artifacts/crm/dist',
    ]);
    expect(vercelArgs({ ...input, target: 'production' })).toEqual([
      'deploy',
      '--cwd',
      '/w/artifacts/crm/dist',
      '--yes',
      '--prod',
    ]);
    expect(formatCommand(['wrangler', 'pages', 'deploy', '/a b/dist'])).toBe(
      "wrangler pages deploy '/a b/dist'"
    );
  });

  it('validates Cloudflare project names', () => {
    expect(validateCloudflareProject('protoyard-crm')).toBeNull();
    for (const bad of ['Upper', '-lead', 'trail-', 'a_b', 'x'.repeat(59)]) {
      expect(validateCloudflareProject(bad), bad).not.toBeNull();
    }
  });

  it('ensure: builds create-project argv and parses project list / already-exists offline', () => {
    expect(cloudflareEnsureProjectArgs('protoyard-crm')).toEqual([
      'pages',
      'project',
      'create',
      'protoyard-crm',
      '--production-branch',
      'main',
    ]);

    // Recorded-style wrangler list fixtures (names only; extra fields ignored).
    const listFixture = `[
  {"name":"protoyard-alpha","id":"acct-should-not-leak","account_id":"SECRET"},
  {"name":"protoyard-crm","subdomain":"protoyard-crm.pages.dev"}
]`;
    expect(parseCloudflareProjectList(listFixture)).toEqual(['protoyard-alpha', 'protoyard-crm']);
    expect(
      parseCloudflareProjectList(
        '🌀 Listing...\n{"result":[{"name":"protoyard-crm"},{"name":"other"}]}\n'
      )
    ).toEqual(['protoyard-crm', 'other']);
    expect(parseCloudflareProjectList('not json')).toEqual([]);
    expect(parseCloudflareProjectList('')).toEqual([]);

    expect(
      isCloudflareProjectAlreadyExists(
        'Error: A project with this name already exists. Code: 8000004'
      )
    ).toBe(true);
    expect(isCloudflareProjectAlreadyExists('project already exists')).toBe(true);
    expect(isCloudflareProjectAlreadyExists('Deployed ok')).toBe(false);

    const provider = createProvider('cloudflare', process.cwd());
    const bare: PublishInput = { ...input, ensureProject: undefined };
    expect(provider.setupCommands?.(bare) ?? []).toEqual([]);
    const withEnsure: PublishInput = { ...input, ensureProject: true };
    const setup = provider.setupCommands?.(withEnsure) ?? [];
    expect(setup).toHaveLength(1);
    expect(setup[0]?.slice(-6)).toEqual(cloudflareEnsureProjectArgs('protoyard-crm'));
    expect(setup[0]?.includes('pages')).toBe(true);
    expect(setup[0]?.includes('project')).toBe(true);
    expect(setup[0]?.includes('create')).toBe(true);
  });

  it('ensure: skips create when list already contains the project (no network)', async () => {
    const calls: string[][] = [];
    const runFn = async (cmd: string, args: readonly string[]) => {
      calls.push([cmd, ...args]);
      if (args.includes('list')) {
        return {
          code: 0,
          stdout: JSON.stringify([{ name: 'protoyard-crm', id: 'do-not-log' }, { name: 'other' }]),
          stderr: '',
        };
      }
      throw new Error(`unexpected run: ${cmd} ${args.join(' ')}`);
    };
    const result = await ensureCloudflareProject(['wrangler'], 'protoyard-crm', {
      runFn: runFn as typeof import('../src/lib/process.ts').run,
    });
    expect(result).toEqual({ created: false, existed: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(['wrangler', 'pages', 'project', 'list', '--json']);
  });

  it('ensure: creates when missing and treats already-exists create output as ok', async () => {
    const calls: string[][] = [];
    let listEmpty = true;
    const runFn = async (_cmd: string, args: readonly string[]) => {
      calls.push([...args]);
      if (args.includes('list')) {
        return {
          code: 0,
          stdout: listEmpty ? '[]' : JSON.stringify([{ name: 'protoyard-crm' }]),
          stderr: '',
        };
      }
      if (args.includes('create')) {
        return {
          code: 1,
          stdout: '',
          stderr: 'A project with this name already exists (code: 8000004)',
        };
      }
      return { code: 1, stdout: '', stderr: 'nope' };
    };
    const raced = await ensureCloudflareProject(
      ['npx', '--no-install', 'wrangler'],
      'protoyard-crm',
      {
        runFn: runFn as typeof import('../src/lib/process.ts').run,
      }
    );
    expect(raced).toEqual({ created: false, existed: true });
    expect(calls[0]).toEqual(['--no-install', 'wrangler', 'pages', 'project', 'list', '--json']);
    expect(calls[1]).toEqual([
      '--no-install',
      'wrangler',
      'pages',
      'project',
      'create',
      'protoyard-crm',
      '--production-branch',
      'main',
    ]);

    listEmpty = true;
    const createOk = async (_cmd: string, args: readonly string[]) => {
      if (args.includes('list')) return { code: 0, stdout: '[]', stderr: '' };
      if (args.includes('create')) return { code: 0, stdout: 'Created protoyard-new', stderr: '' };
      return { code: 1, stdout: '', stderr: '' };
    };
    const made = await ensureCloudflareProject(['wrangler'], 'protoyard-new', {
      runFn: createOk as typeof import('../src/lib/process.ts').run,
    });
    expect(made).toEqual({ created: true, existed: false });
  });

  it('parses only URLs the provider actually printed', () => {
    const wrangler =
      '\u001b[32m✨ Success!\u001b[0m Uploaded 4 files\n✨ Deployment complete! Take a peek over at https://1a2b3c4d.protoyard-crm.pages.dev\n';
    expect(parseCloudflareOutput(wrangler)).toEqual({
      url: 'https://1a2b3c4d.protoyard-crm.pages.dev',
      deploymentId: '1a2b3c4d',
    });
    expect(parseCloudflareOutput('Deployed to https://preview.protoyard-crm.pages.dev.')).toEqual({
      url: 'https://preview.protoyard-crm.pages.dev',
    });
    expect(parseCloudflareOutput('Uploaded. Done.')).toBeNull();
    expect(
      parseNetlifyOutput(
        'Deploying…\n{"deploy_id":"abc","deploy_url":"https://abc--site.netlify.app"}'
      )
    ).toEqual({
      url: 'https://abc--site.netlify.app',
      deploymentId: 'abc',
    });
    expect(parseNetlifyOutput('{"deploy_url":"http://insecure"}')).toBeNull();
    expect(
      parseVercelOutput('Inspect: https://vercel.com/x\nhttps://crm-abc.vercel.app\n')
    ).toEqual({ url: 'https://crm-abc.vercel.app' });
  });
});

describe('protoyard publish --dry-run', () => {
  let ws: TempWorkspace;
  beforeAll(() => {
    ws = createWorkspace();
    addBuildablePrototype(ws, 'dry-app');
  });
  afterAll(() => ws.cleanup());

  it('builds, verifies and prints the exact command without contacting a provider', async () => {
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'publish',
      'dry-app',
      '--provider',
      'cloudflare',
      '--dry-run',
    ]);
    expect(run.code).toBe(0);
    const { data } = run.json<{
      data: {
        dryRun: boolean;
        command: string[];
        setup?: string[][];
        project: string;
        target: string;
      };
    }>();
    expect(data.dryRun).toBe(true);
    expect(data.project).toBe('protoyard-dry-app');
    expect(data.target).toBe('preview');
    expect(data.setup ?? []).toEqual([]);
    const realDist = data.command[data.command.indexOf('deploy') + 1] ?? '';
    expect(realDist.endsWith('/artifacts/dry-app/dist')).toBe(true);
    expect(data.command.slice(data.command.indexOf('pages'))).toEqual([
      'pages',
      'deploy',
      realDist,
      '--project-name',
      'protoyard-dry-app',
      '--branch',
      'preview',
      '--commit-dirty=true',
    ]);
    expect(data.command).toContain('--project-name');
  }, 60_000);

  it('ensure: dry-run lists create-project setup argv before deploy', async () => {
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'publish',
      'dry-app',
      '--provider',
      'cloudflare',
      '--ensure-project',
      '--dry-run',
    ]);
    expect(run.code).toBe(0);
    const { data } = run.json<{
      data: {
        dryRun: boolean;
        ensureProject?: boolean;
        setup: string[][];
        command: string[];
        commandLine: string;
        project: string;
      };
    }>();
    expect(data.dryRun).toBe(true);
    expect(data.ensureProject).toBe(true);
    expect(data.project).toBe('protoyard-dry-app');
    expect(data.setup).toHaveLength(1);
    const setup = data.setup[0] ?? [];
    expect(setup.slice(setup.indexOf('pages'))).toEqual([
      'pages',
      'project',
      'create',
      'protoyard-dry-app',
      '--production-branch',
      'main',
    ]);
    expect(data.command).toContain('deploy');
    // Human/shell line: setup first, then deploy.
    expect(data.commandLine.indexOf('project create')).toBeGreaterThanOrEqual(0);
    expect(data.commandLine.indexOf('project create')).toBeLessThan(
      data.commandLine.indexOf('pages deploy')
    );
  }, 60_000);

  it('returns a structured dry-run result from publishPrototype', async () => {
    const ctx = createContext(
      ws.root,
      createOutput({ json: true, quiet: false, color: false }),
      false
    );
    const { entry, registry } = await resolveTarget(ctx, 'dry-app');
    const result = await publishPrototype(
      ctx,
      entry,
      createProvider('cloudflare', ws.root),
      { dryRun: true },
      registry
    );
    expect(result).toMatchObject({
      slug: 'dry-app',
      provider: 'cloudflare',
      target: 'preview',
      project: 'protoyard-dry-app',
      dryRun: true,
      kind: 'dry-run',
      toolAvailable: expect.any(Boolean),
      command: expect.arrayContaining(['--project-name', 'protoyard-dry-app']),
    });
    expect(result.files).toBeGreaterThan(0);
    expect(result.bytes).toBeGreaterThan(0);
  }, 60_000);

  it('prints a named Cloudflare branch in the dry-run command', async () => {
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'publish',
      'dry-app',
      '--provider',
      'cloudflare',
      '--branch',
      'pr-42',
      '--dry-run',
    ]);
    expect(run.code).toBe(0);
    const { data } = run.json<{ data: { command: string[] } }>();
    expect(
      data.command.slice(data.command.indexOf('--branch'), data.command.indexOf('--branch') + 2)
    ).toEqual(['--branch', 'pr-42']);
  }, 60_000);

  it('rejects invalid, production, and unsupported branch options', async () => {
    const runPublish = (provider: string, ...extra: string[]) =>
      cli([
        '--root',
        ws.root,
        '--json',
        'publish',
        'dry-app',
        '--provider',
        provider,
        '--branch',
        'Bad_Name',
        '--dry-run',
        ...extra,
      ]);
    const invalid = await runPublish('cloudflare');
    expect(invalid.code).toBe(2);
    expect(invalid.json<{ error: { message: string } }>().error.message).toContain('lowercase');

    const production = await cli([
      '--root',
      ws.root,
      '--json',
      'publish',
      'dry-app',
      '--provider',
      'cloudflare',
      '--branch',
      'pr-42',
      '--production',
      '--dry-run',
    ]);
    expect(production.code).toBe(2);
    expect(production.json<{ error: { message: string } }>().error.message).toContain('preview');

    for (const provider of ['netlify', 'vercel']) {
      const unsupported = await runPublish(provider);
      expect(unsupported.code).toBe(2);
      expect(unsupported.json<{ error: { message: string } }>().error.message).toContain(
        'not supported by the'
      );
    }
  });

  it('requires --yes for production deploys and rejects bad project names', async () => {
    const prod = await cli([
      '--root',
      ws.root,
      '--json',
      'publish',
      'dry-app',
      '--provider',
      'cloudflare',
      '--production',
    ]);
    expect(prod.code).toBe(2);
    const bad = await cli([
      '--root',
      ws.root,
      '--json',
      'publish',
      'dry-app',
      '--provider',
      'cloudflare',
      '--dry-run',
      '--project',
      'Bad_Name',
    ]);
    expect(bad.code).toBe(2);
  });

  it('static provider produces the ZIP and upload instructions', async () => {
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'publish',
      'dry-app',
      '--provider',
      'static',
    ]);
    expect(run.code).toBe(0);
    const { data } = run.json<{ data: { zip: string; instructions: string[] } }>();
    expect(data.zip).toBe('artifacts/dry-app/dry-app.zip');
    expect(data.instructions.length).toBeGreaterThan(2);
  }, 60_000);
});

describe('publish --help', () => {
  it('says that publishing without --dry-run deploys immediately', async () => {
    const run = await cli(['publish', '--help']);
    expect(run.code).toBe(0);
    const help = run.stdout.replace(/\s+/g, ' ');
    expect(help).toContain('Without --dry-run it uploads a preview immediately, with no prompt');
    expect(help).toContain('(without it, publish deploys)');
  });
});
