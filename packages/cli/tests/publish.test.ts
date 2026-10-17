// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatCommand } from '../src/publish/cli-tool.ts';
import {
  cloudflareArgs,
  parseCloudflareOutput,
  validateCloudflareProject,
} from '../src/publish/cloudflare.ts';
import { netlifyArgs, parseNetlifyOutput } from '../src/publish/netlify.ts';
import { parseVercelOutput, vercelArgs, vercelLinkArgs } from '../src/publish/vercel.ts';
import { addBuildablePrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const input = {
  slug: 'crm',
  distDir: '/w/artifacts/crm/dist',
  project: 'protoyard-crm',
  target: 'preview' as const,
};

describe('publish adapters', () => {
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
      data: { dryRun: boolean; command: string[]; project: string; target: string };
    }>();
    expect(data.dryRun).toBe(true);
    expect(data.project).toBe('protoyard-dry-app');
    expect(data.target).toBe('preview');
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
