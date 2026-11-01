import { type ChildProcess, execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';

/**
 * The quick loop in a real browser, end to end, opt-in with PROTOYARD_E2E_QUICK=1:
 * a brief becomes an exploration (`protoyard quick`),
 * `quick serve` hosts it, and the launcher opens a ready player that passes axe.
 *
 * Desktop project only. The exploration is served at the root of its origin,
 * with its own copy of the player, on PROTOYARD_E2E_QUICK_PORT (default 4878). The
 * prebuilt player is rebuilt once per run, because quick copies it from
 * packages/player/dist/app (PROTOYARD_E2E_QUICK_PLAYER=prebuilt skips that).
 */

test.skip(
  process.env.PROTOYARD_E2E_QUICK !== '1',
  'set PROTOYARD_E2E_QUICK=1 to run the quick loop'
);
test.describe.configure({ mode: 'serial' });

const root = process.cwd();
const CLI = join(root, 'packages', 'cli', 'bin', 'protoyard.mjs');
const BRIEF = 'A small clinic books patient appointments with doctors and tracks visit notes.';
const PROJECTS = ['chromium', 'mobile'];
const slug = 'quick-loop';

/** Runs the CLI with --json and returns its envelope's data (the run must succeed). */
function cli<T = Record<string, unknown>>(args: string[], input?: string): T {
  const result = spawnSync(process.execPath, [CLI, '--json', ...args], {
    cwd: root,
    encoding: 'utf8',
    input,
  });
  const envelope = JSON.parse(result.stdout || '{}') as { ok?: boolean; data?: T; error?: unknown };
  if (result.status !== 0 || envelope.ok !== true) {
    throw new Error(
      `protoyard ${args.join(' ')} failed (${result.status}): ${JSON.stringify(envelope.error ?? result.stderr)}`
    );
  }
  return envelope.data as T;
}

/**
 * Builds the prebuilt player once per Playwright run: quick copies it from
 * packages/player/dist/app, which can be older than the source. A lock folder
 * serializes the projects' workers; a stamp with the runner's pid skips the
 * build for the second worker.
 */
function ensurePlayerBuilt() {
  if (process.env.PROTOYARD_E2E_QUICK_PLAYER === 'prebuilt') return;
  const state = join(root, 'tmp', 'e2e-quick');
  mkdirSync(state, { recursive: true });
  const lock = join(state, '.player-build.lock');
  const stamp = join(state, '.player-build.stamp');
  const run = String(process.ppid);
  const deadline = Date.now() + 240_000;
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch {
      // A lock left behind by a crashed run is stale after four minutes.
      if (Date.now() - statSync(lock).mtimeMs > 240_000) rmSync(lock, { recursive: true });
      if (Date.now() > deadline) throw new Error('timed out waiting for the player build');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
  try {
    if (existsSync(stamp) && readFileSync(stamp, 'utf8') === run) return;
    execFileSync('pnpm', ['--filter', '@protoyard/player', 'build'], { cwd: root, stdio: 'pipe' });
    writeFileSync(stamp, run);
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

let folder = '';
let origin = '';
let server: ChildProcess | null = null;

test.beforeAll(async () => {
  const testInfo = test.info();
  testInfo.setTimeout(300_000);
  const projectIndex = Math.max(0, PROJECTS.indexOf(testInfo.project.name));
  const port = Number(process.env.PROTOYARD_E2E_QUICK_PORT ?? 4878) + projectIndex;
  folder = join(root, 'tmp', 'e2e-quick', testInfo.project.name, slug);
  origin = `http://127.0.0.1:${port}`;
  ensurePlayerBuilt();
  rmSync(folder, { recursive: true, force: true });
  const created = cli<{ source: string }>([
    'quick',
    BRIEF,
    '--slug',
    slug,
    '--out',
    relative(root, folder),
  ]);
  expect(created.source).toBe('brief');

  server = spawn(
    process.execPath,
    [CLI, 'quick', 'serve', relative(root, folder), '--port', String(port), '--strict-port'],
    { cwd: root, stdio: 'ignore' }
  );
  let available = false;
  for (let attempt = 0; attempt < 150 && !available; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`quick serve exited with ${server.exitCode}`);
    available = await fetch(`${origin}/`).then(
      (response) => response.ok,
      () => false
    );
    if (!available) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  expect(available, `quick serve on ${origin}`).toBe(true);
});

test.afterAll(async () => {
  const running = server;
  if (running && running.exitCode === null) {
    running.kill('SIGINT');
    await new Promise<void>((resolve) => {
      running.once('exit', () => resolve());
      setTimeout(resolve, 3_000);
    });
  }
  if (folder) rmSync(folder, { recursive: true, force: true });
});

/** Opens an exploration page (`''` is the base launcher) and waits for the player. */
async function openPlayer(page: Page, path: string) {
  await page.goto(`${origin}/${path}`);
  await expect(page.locator('html[data-protoyard-ready="1"]')).toBeAttached({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible({ timeout: 30_000 });
}

test(
  'a brief becomes a served exploration whose launcher opens a ready, accessible player',
  { tag: '@desktop' },
  async ({ page }, testInfo) => {
    const record = JSON.parse(readFileSync(join(folder, 'quick.json'), 'utf8')) as {
      source: string;
    };
    expect(record.source).toBe('brief');
    await openPlayer(page, '');
    expect(new URL(page.url()).pathname).toMatch(/\/player\/index\.html$/);
    await expectAccessible(page, testInfo, { label: 'quick launcher' });
  }
);
