// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addBuildablePrototype,
  addPrototype,
  addTemplate,
  cli,
  createWorkspace,
  type TempWorkspace,
} from './helpers.ts';

interface BatchItem {
  slug: string;
  ok: boolean;
  durationMs: number;
  project?: string;
  kind?: string;
  command?: string[];
  commandLine?: string;
  toolAvailable?: boolean;
  zip?: string;
  sha256?: string;
  url?: string;
  error?: string;
}

interface BatchData {
  provider: string;
  target: string;
  dryRun: boolean;
  total: number;
  failed: number;
  results: BatchItem[];
}

let ws: TempWorkspace;

/** A buildable prototype whose protoyard.json carries tags. */
function addTagged(slug: string, tags: string[]) {
  addBuildablePrototype(ws, slug, `${slug} says hi`);
  addPrototype(ws, slug, { tags });
}

beforeAll(() => {
  ws = createWorkspace();
  addTagged('alpha-app', ['review']);
  addTagged('beta-app', ['review', 'mobile']);
  addTagged('gamma-app', []);
  // Deliberately broken: the Vite build fails on a syntax error.
  addTagged('broken-app', ['review']);
  ws.write('prototypes/broken-app/src/main.ts', 'export const = ;\n');
  // Templates are never part of a batch.
  addTemplate(ws, 'starter');
});
afterAll(() => ws.cleanup());

const publish = (...args: string[]) => cli(['--root', ws.root, '--json', 'publish', ...args]);

// Real Vite builds, one per prototype.
describe('publish batch selection and partial failure', { timeout: 120_000 }, () => {
  it('publishes every prototype with --all, continues past a failure and exits 1', async () => {
    const run = await publish('--all', '--provider', 'static');
    expect(run.code).toBe(1);
    const envelope = run.json<{ ok: boolean; error: { message: string }; data: BatchData }>();
    expect(envelope.ok).toBe(false);
    expect(envelope.error.message).toBe('1 of 4 publishes failed.');
    const { data } = envelope;
    expect(data).toMatchObject({ provider: 'static', target: 'preview', total: 4, failed: 1 });
    expect(data.results.map((r) => r.slug).sort()).toEqual([
      'alpha-app',
      'beta-app',
      'broken-app',
      'gamma-app',
    ]);
    const broken = data.results.find((r) => r.slug === 'broken-app') as BatchItem;
    expect(broken.ok).toBe(false);
    expect(broken.error).toMatch(/Vite build failed for broken-app/);
    // The prototypes after the broken one were still published.
    for (const item of data.results.filter((r) => r.slug !== 'broken-app')) {
      expect(item).toMatchObject({
        ok: true,
        kind: 'static',
        zip: `artifacts/${item.slug}/${item.slug}.zip`,
      });
      expect(item.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(item.durationMs).toBeGreaterThan(0);
      expect(existsSync(join(ws.root, item.zip as string))).toBe(true);
    }
    expect(existsSync(join(ws.root, 'artifacts/starter'))).toBe(false);
  });

  it('dry-runs only the prototypes with --tag and contacts no provider', async () => {
    const run = await publish('--tag', 'mobile', '--provider', 'cloudflare', '--dry-run');
    expect(run.code).toBe(0);
    const { data } = run.json<{ data: BatchData }>();
    expect(data).toMatchObject({ dryRun: true, total: 1, failed: 0 });
    const [beta] = data.results;
    expect(beta).toMatchObject({
      slug: 'beta-app',
      ok: true,
      kind: 'dry-run',
      project: 'protoyard-beta-app',
    });
    expect(beta?.command).toEqual(
      expect.arrayContaining(['pages', 'deploy', '--project-name', 'protoyard-beta-app'])
    );
    expect(beta?.commandLine).toContain('--branch preview');
    expect(typeof beta?.toolAvailable).toBe('boolean');
    expect(beta?.url).toBeUndefined();
  });

  it('accepts several explicit slugs, de-duplicated, in the given order', async () => {
    const run = await publish(
      'gamma-app',
      'alpha-app',
      'gamma-app',
      '--provider',
      'cloudflare',
      '--dry-run'
    );
    expect(run.code).toBe(0);
    const { data } = run.json<{ data: BatchData }>();
    expect(data.results.map((r) => [r.slug, r.ok])).toEqual([
      ['gamma-app', true],
      ['alpha-app', true],
    ]);
    expect(data.results.map((r) => r.project)).toEqual([
      'protoyard-gamma-app',
      'protoyard-alpha-app',
    ]);
  });

  it('passes --branch to every prototype in the batch', async () => {
    const run = await publish(
      'alpha-app',
      'beta-app',
      '--provider',
      'cloudflare',
      '--branch',
      'pr-42',
      '--dry-run'
    );
    expect(run.code).toBe(0);
    const { data } = run.json<{ data: BatchData }>();
    expect(data.results.map((r) => r.commandLine?.includes('--branch pr-42'))).toEqual([
      true,
      true,
    ]);
  });

  it('keeps the single-slug envelope for one slug', async () => {
    const run = await publish('alpha-app', '--provider', 'cloudflare', '--dry-run');
    expect(run.code).toBe(0);
    const data = run.json<{ data: Record<string, unknown> }>().data;
    expect(data.slug).toBe('alpha-app');
    expect(data.results).toBeUndefined();
    expect(data.commandLine).toContain('protoyard-alpha-app');
  });

  it('renders a summary table in human mode', async () => {
    const run = await cli([
      '--root',
      ws.root,
      'publish',
      'alpha-app',
      'beta-app',
      '--provider',
      'cloudflare',
      '--dry-run',
    ]);
    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/alpha-app\s+[\d.]+ s {2}would run .*protoyard-alpha-app/);
    expect(run.stdout).toMatch(/beta-app\s+[\d.]+ s {2}would run .*protoyard-beta-app/);
    expect(run.stdout).toContain('All 2 prototypes verified.');
  });
});

describe('publish batch refusals (nothing is built)', { timeout: 60_000 }, () => {
  it('rejects mixing slugs, --all and --tag, and an empty selection', async () => {
    expect((await publish('alpha-app', '--all', '--provider', 'static')).code).toBe(2);
    expect((await publish('--all', '--tag', 'review', '--provider', 'static')).code).toBe(2);
    expect((await publish('--provider', 'static')).code).toBe(2);
  });

  it('refuses --project for several prototypes and production without --yes', async () => {
    const project = await publish(
      '--all',
      '--provider',
      'cloudflare',
      '--dry-run',
      '--project',
      'shared'
    );
    expect(project.code).toBe(2);
    expect(project.json<{ error: { message: string } }>().error.message).toMatch(/--project/);
    const production = await publish('--tag', 'review', '--provider', 'cloudflare', '--production');
    expect(production.code).toBe(2);
    expect(production.json<{ error: { message: string } }>().error.message).toMatch(
      /explicit confirmation/
    );
  });

  it('fails fast on an unknown slug or tag before building anything', async () => {
    addTagged('fresh-app', []);
    const unknown = await publish(
      'fresh-app',
      'no-such-app',
      '--provider',
      'cloudflare',
      '--dry-run'
    );
    expect(unknown.code).toBe(3);
    expect(existsSync(join(ws.root, 'artifacts/fresh-app'))).toBe(false);
    const template = await publish('fresh-app', 'starter', '--provider', 'cloudflare', '--dry-run');
    expect(template.code).toBe(3);
    const tag = await publish('--tag', 'nothing-has-this', '--provider', 'cloudflare', '--dry-run');
    expect(tag.code).toBe(3);
    expect(existsSync(join(ws.root, 'artifacts/fresh-app'))).toBe(false);
  });
});
