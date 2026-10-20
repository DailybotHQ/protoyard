// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sampleComment } from '../../review/tests/conformance.ts';
import { publishShowcaseDirectory } from '../src/commands/showcase.ts';
import { SHOWCASE_MARKER } from '../src/lib/output-guard.ts';
import { readLedger } from '../src/lib/publish-ledger.ts';
import {
  bundleReviewWorker,
  COMMENTS_ENDPOINT,
  parseCommentsOption,
  REVIEW_ROUTES,
  REVIEW_WORKER_MAX_BYTES,
  reviewSchemaFile,
  reviewWorkerProblems,
  writeReviewWorker,
} from '../src/lib/review-worker.ts';
import { buildEnv } from '../src/lib/vite.ts';
import type { CommandContext } from '../src/lib/workspace.ts';
import { cloudflareCommentsSetup } from '../src/publish/cloudflare.ts';
import type { PublishProvider } from '../src/publish/types.ts';
import { addBuildablePrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const WRANGLER = ['npx', '--no-install', 'wrangler'];

interface CommentsData {
  adapter: string;
  endpoint: string;
  store: string;
  binding: string;
  worker: { file: string; bytes: number; sha256: string };
  routes: { file: string; include: string[] };
  setup: { commands: string[][]; secret: string[]; notes: string[]; resource: string };
}

/** A structural Workers KV fake (Map-backed). */
function fakeKv() {
  const data = new Map<string, string>();
  return {
    data,
    async get(key: string) {
      return data.get(key) ?? null;
    },
    async put(key: string, value: string) {
      data.set(key, value);
    },
    async delete(key: string) {
      data.delete(key);
    },
    async list(options: { prefix?: string } = {}) {
      const keys = [...data.keys()]
        .filter((name) => name.startsWith(options.prefix ?? ''))
        .map((name) => ({ name }));
      return { keys, list_complete: true };
    },
  };
}

type WorkerModule = {
  default: { fetch(request: Request, env: Record<string, unknown>): Promise<Response> };
};

async function loadWorker(ws: TempWorkspace, code: string, name: string): Promise<WorkerModule> {
  const file = join(ws.root, `${name}.mjs`);
  writeFileSync(file, code, 'utf8');
  return (await import(pathToFileURL(file).href)) as WorkerModule;
}

describe('comments worker bundle', () => {
  let ws: TempWorkspace;
  beforeAll(() => {
    ws = createWorkspace();
  });
  afterAll(() => ws.cleanup());

  for (const store of ['d1', 'kv'] as const) {
    it(`bundles a self-contained ${store} worker under 20 KB raw with no Node built-ins`, async () => {
      const bundle = await bundleReviewWorker(store);
      expect(bundle.bytes).toBeLessThan(REVIEW_WORKER_MAX_BYTES);
      expect(bundle.bytes).toBe(Buffer.byteLength(bundle.code, 'utf8'));
      expect(reviewWorkerProblems(bundle.code)).toEqual([]);
      for (const name of builtinModules) {
        expect(bundle.code).not.toContain(`"node:${name}"`);
        expect(bundle.code).not.toMatch(new RegExp(`from\\s*["'\`]${name}["'\`]`));
      }
      expect(bundle.code).not.toMatch(/\brequire\s*\(/);
      // zod and the core schema graph stay out (the root cause of the old 109 KB bundle).
      expect(bundle.code).not.toMatch(/ZodError|_zod|\$ZodType/);
      // Only the chosen store ships.
      if (store === 'd1') expect(bundle.code).not.toContain('protoyard:review:comments:');
      else expect(bundle.code).not.toContain('INSERT INTO comments');
    }, 60_000);
  }

  it('flags imports, Node built-ins, require and oversize code', () => {
    expect(reviewWorkerProblems('export default {}')).toEqual([]);
    expect(reviewWorkerProblems('import fs from "node:fs";').join(' ')).toMatch(/node:fs/);
    expect(reviewWorkerProblems('import { x } from "fs";').join(' ')).toMatch(/Node built-in "fs"/);
    expect(reviewWorkerProblems('const a = require("path");').join(' ')).toMatch(/require/);
    expect(reviewWorkerProblems('await import("./chunk.js")').join(' ')).toMatch(/chunk\.js/);
    expect(reviewWorkerProblems(`/*${'x'.repeat(REVIEW_WORKER_MAX_BYTES)}*/`).join(' ')).toMatch(
      /limit is under 20480/
    );
  });

  it('serves the comments API from KV and hands every other path to the static assets', async () => {
    const bundle = await bundleReviewWorker('kv');
    const worker = await loadWorker(ws, bundle.code, 'worker-kv');
    const kv = fakeKv();
    const assets: string[] = [];
    const env = {
      REVIEW_KV: kv,
      ASSETS: {
        async fetch(request: Request) {
          assets.push(new URL(request.url).pathname);
          return new Response('static');
        },
      },
    };
    const origin = 'https://protoyard-demo.pages.example';
    const page = await worker.default.fetch(new Request(`${origin}/index.html`), env);
    expect(await page.text()).toBe('static');
    expect(assets).toEqual(['/index.html']);

    const comment = sampleComment('demo-app', {
      id: 'comment-00042',
      threadId: 'comment-00042',
    });
    const put = await worker.default.fetch(
      new Request(`${origin}/api/comments/demo-app/comment-00042`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify(comment),
      }),
      env
    );
    expect(put.status).toBe(200);
    const invalid = await worker.default.fetch(
      new Request(`${origin}/api/comments/demo-app/comment-00043`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({ ...comment, id: 'comment-00043', role: 'admin' }),
      }),
      env
    );
    expect(invalid.status).toBe(422);
    const list = await worker.default.fetch(new Request(`${origin}/api/comments/demo-app`), env);
    const listed = (await list.json()) as { comments: Array<{ id: string; body: string }> };
    expect(listed.comments.map((c) => c.id)).toEqual(['comment-00042']);
    expect(listed.comments[0]?.body).toBe(comment.body);
    expect(assets).toEqual(['/index.html']);
  }, 60_000);

  it('answers 503 when the store binding is missing, and asks for REVIEW_KEY when set', async () => {
    const bundle = await bundleReviewWorker('d1');
    const worker = await loadWorker(ws, bundle.code, 'worker-d1');
    const assets = { fetch: async () => new Response('static') };
    const missing = await worker.default.fetch(
      new Request('https://demo.example/api/comments/demo-app'),
      { ASSETS: assets }
    );
    expect(missing.status).toBe(503);
    expect(((await missing.json()) as { error: { code: string } }).error.code).toBe(
      'store_unconfigured'
    );
    const keyed = await worker.default.fetch(
      new Request('https://demo.example/api/comments/demo-app'),
      { ASSETS: assets, REVIEW_KEY: 'example-review-key', REVIEW_DB: {} }
    );
    expect(keyed.status).toBe(401);
  }, 60_000);

  it('writes _worker.js and a _routes.json that only includes /api/comments/*', async () => {
    const dist = join(ws.root, 'artifacts/routes-check/dist');
    ws.write('artifacts/routes-check/dist/index.html', '<h1>x</h1>');
    const files = await writeReviewWorker(dist, 'kv');
    expect(files.binding).toBe('REVIEW_KV');
    expect(JSON.parse(readFileSync(join(dist, '_routes.json'), 'utf8'))).toEqual({
      version: 1,
      include: ['/api/comments/*'],
      exclude: [],
    });
    expect(REVIEW_ROUTES.include).toEqual([`${COMMENTS_ENDPOINT}/*`]);
    expect(readFileSync(join(dist, '_worker.js')).byteLength).toBe(files.worker.bytes);
    // A second write refuses to overwrite routing it did not create.
    await expect(writeReviewWorker(dist, 'kv')).rejects.toThrow(/already exists/);
  }, 60_000);
});

describe('comments setup commands', () => {
  it('prints the exact one-time D1 commands with the schema file and the secret', () => {
    const setup = cloudflareCommentsSetup(
      WRANGLER,
      'protoyard-crm',
      'd1',
      'packages/review/schema/d1.sql'
    );
    expect(setup.binding).toBe('REVIEW_DB');
    expect(setup.resource).toBe('protoyard-crm-comments');
    expect(setup.commands).toEqual([
      [...WRANGLER, 'd1', 'create', 'protoyard-crm-comments'],
      [
        ...WRANGLER,
        'd1',
        'execute',
        'protoyard-crm-comments',
        '--remote',
        '--file',
        'packages/review/schema/d1.sql',
      ],
    ]);
    expect(setup.secret).toEqual([
      ...WRANGLER,
      'pages',
      'secret',
      'put',
      'REVIEW_KEY',
      '--project-name',
      'protoyard-crm',
    ]);
    expect(setup.notes.join(' ')).toMatch(/as REVIEW_DB/);
    expect(setup.notes.join(' ')).toMatch(/not authentication/);
  });

  it('prints the KV namespace command and binding', () => {
    const setup = cloudflareCommentsSetup(WRANGLER, 'protoyard-crm', 'kv', 'x.sql');
    expect(setup.binding).toBe('REVIEW_KV');
    expect(setup.commands).toEqual([
      [...WRANGLER, 'kv', 'namespace', 'create', 'protoyard-crm-comments'],
    ]);
    expect(setup.notes.join(' ')).toMatch(/eventually consistent/);
  });

  it('points at the real review D1 schema', () => {
    const file = reviewSchemaFile();
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toMatch(/CREATE TABLE IF NOT EXISTS comments/);
  });

  it('parses --comments: no value is d1, kv is kv, anything else is a usage error', () => {
    expect(parseCommentsOption(undefined)).toBeUndefined();
    expect(parseCommentsOption(true)).toBe('d1');
    expect(parseCommentsOption('kv')).toBe('kv');
    expect(() => parseCommentsOption('postgres')).toThrow(/d1 or kv/);
  });

  it('bakes the http adapter into the build env only when asked, and clears inherited values', () => {
    const base = { outDir: '/o', base: './', includeDevtools: false };
    expect(buildEnv(base)).toMatchObject({
      PROTOYARD_REVIEW_ADAPTER: '',
      PROTOYARD_REVIEW_ENDPOINT: '',
    });
    expect(
      buildEnv({ ...base, review: { adapter: 'http', endpoint: '/api/comments' } })
    ).toMatchObject({
      PROTOYARD_REVIEW: '1',
      PROTOYARD_REVIEW_ADAPTER: 'http',
      PROTOYARD_REVIEW_ENDPOINT: '/api/comments',
    });
  });
});

describe('protoyard publish --comments', () => {
  let ws: TempWorkspace;
  beforeAll(() => {
    ws = createWorkspace();
    addBuildablePrototype(ws, 'review-app');
  });
  afterAll(() => ws.cleanup());

  const publish = (...extra: string[]) => cli(['--root', ws.root, '--json', 'publish', ...extra]);

  it('dry run: builds with comments, adds the worker and routes, prints the setup, runs nothing', async () => {
    const run = await publish(
      'review-app',
      '--provider',
      'cloudflare',
      '--comments',
      'd1',
      '--dry-run'
    );
    expect(run.code).toBe(0);
    const { data } = run.json<{
      data: { dryRun: boolean; command: string[]; comments: CommentsData; ledger: string };
    }>();
    expect(data.dryRun).toBe(true);
    expect(
      data.command.slice(data.command.indexOf('pages'), data.command.indexOf('pages') + 2)
    ).toEqual(['pages', 'deploy']);
    expect(data.comments).toMatchObject({
      adapter: 'http',
      endpoint: '/api/comments',
      store: 'd1',
      binding: 'REVIEW_DB',
      routes: { file: '_routes.json', include: ['/api/comments/*'] },
    });
    expect(data.comments.worker.bytes).toBeGreaterThan(0);
    expect(data.comments.worker.bytes).toBeLessThan(REVIEW_WORKER_MAX_BYTES);
    const [create, execute] = data.comments.setup.commands;
    expect(create?.slice(create.indexOf('d1'))).toEqual([
      'd1',
      'create',
      'protoyard-review-app-comments',
    ]);
    expect(execute?.slice(execute.indexOf('d1'))).toEqual([
      'd1',
      'execute',
      'protoyard-review-app-comments',
      '--remote',
      '--file',
      reviewSchemaFile(),
    ]);
    expect(data.comments.setup.secret).toContain('REVIEW_KEY');

    const dist = join(ws.root, 'artifacts/review-app/dist');
    const worker = readFileSync(join(dist, '_worker.js'), 'utf8');
    expect(Buffer.byteLength(worker)).toBe(data.comments.worker.bytes);
    expect(reviewWorkerProblems(worker)).toEqual([]);
    expect(JSON.parse(readFileSync(join(dist, '_routes.json'), 'utf8')).include).toEqual([
      '/api/comments/*',
    ]);
    // The build manifest records the adapter the build used.
    const manifest = JSON.parse(
      readFileSync(join(ws.root, 'artifacts/review-app/build-manifest.json'), 'utf8')
    ) as { review: { enabled: boolean; adapter: string } };
    expect(manifest.review).toEqual({ enabled: true, adapter: 'http' });

    const { entries } = await readLedger(join(ws.root, data.ledger));
    const last = entries.at(-1);
    expect(last).toMatchObject({
      kind: 'dry-run',
      url: null,
      review: { adapter: 'http', store: 'd1' },
    });
    expect(JSON.stringify(last)).not.toMatch(/REVIEW_KEY|example-review-key/);
  }, 120_000);

  it('human output lists the one-time commands before the deploy and says nothing was uploaded', async () => {
    const run = await cli([
      '--root',
      ws.root,
      'publish',
      'review-app',
      '--provider',
      'cloudflare',
      '--comments',
      'kv',
      '--dry-run',
    ]);
    expect(run.code).toBe(0);
    const text = run.stdout;
    expect(text).toMatch(/wrangler kv namespace create protoyard-review-app-comments/);
    expect(text).toMatch(/REVIEW_KV/);
    expect(text).toMatch(/pages secret put REVIEW_KEY --project-name protoyard-review-app/);
    expect(text).toMatch(/protoyard runs none of these/);
    expect(text.indexOf('namespace create')).toBeLessThan(text.indexOf('pages deploy'));
  }, 120_000);

  it('static ZIP exports never ship the worker', async () => {
    // The dist from the previous test still holds _worker.js.
    expect(existsSync(join(ws.root, 'artifacts/review-app/dist/_worker.js'))).toBe(true);
    const skip = await cli(['--root', ws.root, '--json', 'export', 'review-app', '--skip-build']);
    expect(skip.code).not.toBe(0);
    const fresh = await cli(['--root', ws.root, '--json', 'export', 'review-app']);
    expect(fresh.code).toBe(0);
    expect(existsSync(join(ws.root, 'artifacts/review-app/dist/_worker.js'))).toBe(false);
    const zip = readFileSync(join(ws.root, 'artifacts/review-app/review-app.zip'));
    expect(zip.includes(Buffer.from('_worker.js'))).toBe(false);
    expect(zip.includes(Buffer.from('_routes.json'))).toBe(false);
  }, 120_000);

  it('rejects --comments for other providers, batches and unknown stores', async () => {
    const staticRun = await publish('review-app', '--provider', 'static', '--comments');
    expect(staticRun.code).not.toBe(0);
    expect(staticRun.stdout + staticRun.stderr).toMatch(/--comments is not supported/);
    const batch = await publish('--all', '--provider', 'cloudflare', '--comments', '--dry-run');
    expect(batch.code).not.toBe(0);
    expect(batch.stdout + batch.stderr).toMatch(/one prototype at a time/);
    const bad = await publish(
      'review-app',
      '--provider',
      'cloudflare',
      '--comments',
      'sql',
      '--dry-run'
    );
    expect(bad.code).not.toBe(0);
    expect(bad.stdout + bad.stderr).toMatch(/d1 or kv/);
  }, 60_000);
});

describe('showcase --publish cloudflare --comments', () => {
  it('needs --publish cloudflare', async () => {
    const ws = createWorkspace();
    try {
      const run = await cli(['--root', ws.root, '--json', 'showcase', '--comments']);
      expect(run.code).not.toBe(0);
      expect(run.stdout + run.stderr).toMatch(/--comments needs --publish cloudflare/);
    } finally {
      ws.cleanup();
    }
  });

  it('dry-runs one comments Function at the site root for every demo', async () => {
    const ws = createWorkspace();
    try {
      const out = join(ws.root, 'artifacts/showcase');
      ws.write('artifacts/showcase/index.html', '<h1>Showcase</h1>');
      ws.write('artifacts/showcase/p/crm-demo/app/index.html', '<h1>CRM</h1>');
      ws.write(`artifacts/showcase/${SHOWCASE_MARKER}`, '{"generator":"@protoyard/cli"}\n');
      await writeReviewWorker(out, 'd1');
      const provider: PublishProvider = {
        id: 'cloudflare',
        label: 'Cloudflare Pages',
        experimental: false,
        defaultProject: (slug) => `protoyard-${slug}`,
        validateProject: () => null,
        isAvailable: async () => ({ available: true }),
        isAuthenticated: async () => {
          throw new Error('A dry run must not check credentials.');
        },
        command: (input) => [...WRANGLER, 'pages', 'deploy', input.distDir],
        commentsSetup: (input, comments) =>
          cloudflareCommentsSetup(WRANGLER, input.project, comments.store, comments.schemaFile),
        publish: async () => {
          throw new Error('A dry run must not publish.');
        },
      };
      const ctx = {
        root: ws.root,
        yes: false,
        paths: { artifacts: join(ws.root, 'artifacts') },
      } as CommandContext;
      const result = await publishShowcaseDirectory(ctx, out, provider, {
        dryRun: true,
        project: 'protoyard-showcase',
        comments: 'd1',
      });
      expect(result.kind).toBe('dry-run');
      expect(result.comments?.setup.commands[0]).toEqual([
        ...WRANGLER,
        'd1',
        'create',
        'protoyard-showcase-comments',
      ]);
      expect(result.comments?.worker.bytes).toBeLessThan(REVIEW_WORKER_MAX_BYTES);
      expect(existsSync(join(out, '_worker.js'))).toBe(true);
      expect(existsSync(join(out, 'p/crm-demo/app/_worker.js'))).toBe(false);
      // Without --comments, a folder that carries a worker is refused.
      await expect(publishShowcaseDirectory(ctx, out, provider, { dryRun: true })).rejects.toThrow(
        /only --comments deploys a worker/
      );
    } finally {
      ws.cleanup();
    }
  }, 60_000);
});
