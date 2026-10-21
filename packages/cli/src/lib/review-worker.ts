import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { builtinModules, createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Text } from './checksum.ts';
import { CliError } from './output.ts';

/**
 * `publish --comments` (Cloudflare Pages): the shared review comments mode.
 * The comments handler from `@protoyard/review/server` is bundled with the
 * CLI's own Vite (Rolldown) into `dist/_worker.js` (Pages advanced mode),
 * and `dist/_routes.json` sends only `/api/comments/*` to it, so every
 * other request stays a free static asset. `functions/` is not used:
 * Wrangler resolves it from its working directory, which `pages deploy`
 * does not set. Nothing here creates a cloud resource or runs Wrangler.
 */

export const COMMENTS_STORES = ['d1', 'kv'] as const;
export type CommentsStore = (typeof COMMENTS_STORES)[number];

/** D1 is the default: its upserts and rate buckets are strongly consistent. */
export const DEFAULT_COMMENTS_STORE: CommentsStore = 'd1';

/** Same-origin endpoint the built prototype's http review adapter calls. */
export const COMMENTS_ENDPOINT = '/api/comments';

/** The review adapter `publish --comments` bakes into the build. */
export const COMMENTS_REVIEW_BUILD = { adapter: 'http', endpoint: COMMENTS_ENDPOINT } as const;

/** Hard limit for the raw (uncompressed) worker; never raised to make a bundle fit. */
export const REVIEW_WORKER_MAX_BYTES = 20 * 1024;

export const REVIEW_WORKER_FILE = '_worker.js';
export const REVIEW_ROUTES_FILE = '_routes.json';

export const COMMENTS_BINDINGS: Record<CommentsStore, string> = {
  d1: 'REVIEW_DB',
  kv: 'REVIEW_KV',
};

/** Pages invokes the worker for these paths only. */
export const REVIEW_ROUTES = {
  version: 1,
  include: [`${COMMENTS_ENDPOINT}/*`],
  exclude: [],
} as const;

/** `--comments` with no value is D1; anything but d1 or kv is a usage error. */
export function parseCommentsOption(value: unknown): CommentsStore | undefined {
  if (value === undefined || value === false) return undefined;
  if (value === true) return DEFAULT_COMMENTS_STORE;
  if (typeof value === 'string' && (COMMENTS_STORES as readonly string[]).includes(value)) {
    return value as CommentsStore;
  }
  throw new CliError('usage', `--comments takes d1 or kv (got "${String(value)}").`, {
    hint: 'D1 is the default and recommended store; KV is eventually consistent.',
  });
}

/** The D1 schema the developer applies once with `wrangler d1 execute`. */
export function reviewSchemaFile(): string {
  const server = createRequire(import.meta.url).resolve('@protoyard/review/server');
  return join(dirname(server), '..', '..', 'schema', 'd1.sql');
}

const entryFile = import.meta.url.endsWith('.ts')
  ? './review-worker-entry.ts'
  : './review-worker-entry.js';
const ENTRY = fileURLToPath(new URL(entryFile, import.meta.url));

const NODE_BUILTINS = new Set(
  builtinModules.flatMap((name) => [name, name.replace(/^node:/, '')]).filter(Boolean)
);

/**
 * Problems that keep a bundle from shipping as a worker: imports of any kind
 * (everything must be inlined), Node built-ins, CommonJS `require`, `process`
 * and the size limit. Empty means safe.
 */
export function reviewWorkerProblems(code: string): string[] {
  const problems: string[] = [];
  const bytes = Buffer.byteLength(code, 'utf8');
  if (bytes >= REVIEW_WORKER_MAX_BYTES) {
    problems.push(`worker is ${bytes} bytes; the limit is under ${REVIEW_WORKER_MAX_BYTES}`);
  }
  const specifiers = [
    ...code.matchAll(/\bimport\s*(?:[\w$*{},\s]+from\s*)?["'`]([^"'`]+)["'`]/g),
    ...code.matchAll(/\bimport\s*\(\s*["'`]([^"'`]+)["'`]/g),
    ...code.matchAll(/\brequire\s*\(\s*["'`]([^"'`]+)["'`]/g),
  ].map((match) => match[1] ?? '');
  for (const spec of specifiers) {
    problems.push(
      NODE_BUILTINS.has(spec) || spec.startsWith('node:')
        ? `imports the Node built-in "${spec}"`
        : `imports "${spec}" (a worker must be self-contained)`
    );
  }
  if (/["'`]node:[a-z_/]+["'`]/.test(code)) problems.push('references a node: module');
  if (/\brequire\s*\(/.test(code)) problems.push('calls require()');
  if (/\bprocess\s*\.\s*(?:env|versions|cwd|exit)\b/.test(code)) problems.push('uses process');
  return problems;
}

export interface ReviewWorkerBundle {
  store: CommentsStore;
  code: string;
  bytes: number;
  sha256: string;
}

/** Bundles and minifies the worker in memory with the CLI's Vite; nothing is written. */
export async function bundleReviewWorker(store: CommentsStore): Promise<ReviewWorkerBundle> {
  const { build } = await import('vite');
  const result = await build({
    configFile: false,
    envFile: false,
    logLevel: 'silent',
    root: dirname(ENTRY),
    publicDir: false,
    define: { __PROTOYARD_REVIEW_STORE__: JSON.stringify(store) },
    build: {
      write: false,
      minify: true,
      target: 'es2022',
      modulePreload: false,
      copyPublicDir: false,
      reportCompressedSize: false,
      rolldownOptions: {
        input: ENTRY,
        preserveEntrySignatures: 'exports-only',
        output: { format: 'es', entryFileNames: REVIEW_WORKER_FILE, codeSplitting: false },
      },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) =>
    'output' in r ? r.output : []
  );
  const chunks = outputs.filter((o) => o.type === 'chunk');
  const chunk = chunks.find((o) => o.fileName === REVIEW_WORKER_FILE);
  if (!chunk || chunks.length !== 1 || outputs.length !== 1) {
    throw new CliError('failure', 'The comments worker did not bundle into one file.', {
      hint: `Vite produced: ${outputs.map((o) => o.fileName).join(', ') || 'nothing'}.`,
    });
  }
  if (chunk.imports.length > 0 || chunk.dynamicImports.length > 0) {
    throw new CliError('validation', 'The comments worker still imports other modules.', {
      hint: [...chunk.imports, ...chunk.dynamicImports].join(', '),
    });
  }
  const code = chunk.code;
  const problems = reviewWorkerProblems(code);
  if (problems.length > 0) {
    throw new CliError('validation', 'The comments worker cannot ship.', {
      hint: problems.join('; '),
    });
  }
  return { store, code, bytes: Buffer.byteLength(code, 'utf8'), sha256: sha256Text(code) };
}

export interface ReviewWorkerFiles {
  store: CommentsStore;
  binding: string;
  worker: { path: string; bytes: number; sha256: string };
  routes: { path: string; include: string[] };
}

/**
 * Writes `_worker.js` and `_routes.json` into a deployable folder (a fresh
 * build). Refuses when either already exists: a prototype's own routing must
 * never be overwritten silently.
 */
export async function writeReviewWorker(
  distDir: string,
  store: CommentsStore
): Promise<ReviewWorkerFiles> {
  const workerPath = resolve(distDir, REVIEW_WORKER_FILE);
  const routesPath = resolve(distDir, REVIEW_ROUTES_FILE);
  for (const path of [workerPath, routesPath, resolve(distDir, 'functions')]) {
    if (existsSync(path)) {
      throw new CliError('validation', `${path} already exists in the build.`, {
        hint: 'publish --comments writes its own _worker.js and _routes.json; remove the prototype copy from public/.',
      });
    }
  }
  const bundle = await bundleReviewWorker(store);
  await writeFile(workerPath, bundle.code, 'utf8');
  await writeFile(routesPath, `${JSON.stringify(REVIEW_ROUTES, null, 2)}\n`, 'utf8');
  return {
    store,
    binding: COMMENTS_BINDINGS[store],
    worker: { path: workerPath, bytes: bundle.bytes, sha256: bundle.sha256 },
    routes: { path: routesPath, include: [...REVIEW_ROUTES.include] },
  };
}

/** True when a folder carries the comments worker (static and ZIP exports refuse it). */
export function hasReviewWorker(dir: string): boolean {
  return existsSync(join(dir, REVIEW_WORKER_FILE));
}
