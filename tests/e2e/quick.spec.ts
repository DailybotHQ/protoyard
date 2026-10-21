import { type ChildProcess, execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';

/**
 * The quick loop in a real browser, end to end, opt-in with PROTOYARD_E2E_QUICK=1:
 * a brief becomes an exploration with three variants (`protoyard quick`),
 * `quick serve` hosts it, and the browser checks what a person does with it:
 * - the launcher opens a ready player that passes axe;
 * - every variant keeps its own rows across a reload, in its own storage;
 * - compare.html shows each variant ready in a distinct `bp-` namespace;
 * - a comment placed through the review UI lands in review/comments.json and,
 *   through `quick feedback`, in REVIEW.md;
 * - `quick iterate` live-reloads the open tab with its rows kept, the
 *   validation task it adds can be completed there, and the metrics that tab
 *   downloads (still under the pre-iterate namespace) import into
 *   `quick report` as an earlier version of the base;
 * - a validation session on the iterated blueprint is reported by `quick report`;
 * - `quick shot` captures PNGs, or records why it skipped.
 *
 * Each project gets its own standalone exploration (served at the root of its
 * origin, with its own copy of the player) and port (base
 * PROTOYARD_E2E_QUICK_PORT, default 4878, plus the project's index). The
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
const VARIANTS = ['v1', 'v2', 'v3'] as const;

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
  const created = cli<{ source: string; variants: { id: string }[]; compare: string }>([
    'quick',
    BRIEF,
    '--slug',
    slug,
    '--variants',
    '3',
    '--out',
    relative(root, folder),
  ]);
  expect(created.source).toBe('brief');
  expect(created.variants.map((v) => v.id)).toEqual([...VARIANTS]);

  server = spawn(
    process.execPath,
    [CLI, 'quick', 'serve', relative(root, folder), '--port', String(port), '--strict-port'],
    { cwd: root, stdio: 'ignore' }
  );
  let available = false;
  for (let attempt = 0; attempt < 150 && !available; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`quick serve exited with ${server.exitCode}`);
    available = await fetch(`${origin}/compare.html`).then(
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

/** Navigates the open player by its hash route (layouts differ between desktop and phone). */
async function route(page: Page, path: string, heading: string) {
  await page.evaluate((hash) => {
    location.hash = hash;
  }, `#${path}`);
  await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
}

/** Creates a patient through the real form (UI → service → database). */
async function createPatient(page: Page, name: string) {
  await route(page, '/patients', 'Patients');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByLabel(/^Name/).fill(name);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await route(page, '/patients', 'Patients');
  await expect(page.locator('main').getByText(name, { exact: true })).toBeVisible();
}

/** The `bp-` namespaces of the blueprint data databases on this origin. */
async function dataNamespaces(page: Page): Promise<string[]> {
  return page.evaluate(async () =>
    (await indexedDB.databases())
      .map((database) => /^protoyard\.(bp-[a-z2-7]+)\.data$/.exec(database.name ?? '')?.[1])
      .filter((namespace): namespace is string => namespace !== undefined)
  );
}

test('a brief becomes a served exploration whose launcher opens a ready, accessible player', async ({
  page,
}, testInfo) => {
  const record = JSON.parse(readFileSync(join(folder, 'quick.json'), 'utf8')) as {
    source: string;
  };
  expect(record.source).toBe('brief');
  await openPlayer(page, '');
  expect(new URL(page.url()).pathname).toMatch(/\/player\/index\.html$/);
  await expectAccessible(page, testInfo, { label: 'quick launcher' });
});

test('every variant keeps its own rows across a reload, in its own storage', async ({ page }) => {
  for (const variant of VARIANTS) {
    await openPlayer(page, `${variant}/index.html`);
    await createPatient(page, `Ada Variant ${variant}`);
    await page.reload();
    await expect(page.locator('html[data-protoyard-ready="1"]')).toBeAttached({ timeout: 30_000 });
    await route(page, '/patients', 'Patients');
    await expect(
      page.locator('main').getByText(`Ada Variant ${variant}`, { exact: true })
    ).toBeVisible();
    // Rows created in the other variants never appear here.
    for (const other of VARIANTS.filter((v) => v !== variant)) {
      await expect(
        page.locator('main').getByText(`Ada Variant ${other}`, { exact: true })
      ).toHaveCount(0);
    }
  }
  const namespaces = await dataNamespaces(page);
  expect(new Set(namespaces).size).toBe(namespaces.length);
  expect(namespaces.length).toBeGreaterThanOrEqual(VARIANTS.length);
});

test('compare.html shows every variant ready in a distinct bp- namespace', async ({ page }) => {
  await page.goto(`${origin}/compare.html`);
  await expect.poll(() => page.locator('iframe').count()).toBe(VARIANTS.length);
  for (let index = 0; index < VARIANTS.length; index += 1) {
    const iframe = page.locator('iframe').nth(index);
    await iframe.scrollIntoViewIfNeeded();
    await expect(iframe.contentFrame().locator('html[data-protoyard-ready="1"]')).toBeAttached({
      timeout: 30_000,
    });
  }
  const frames = page
    .frames()
    .filter((frame) => new URL(frame.url()).pathname.endsWith('/player/index.html'));
  expect(frames).toHaveLength(VARIANTS.length);
  const namespaces = await dataNamespaces(page);
  expect(namespaces.length).toBeGreaterThanOrEqual(VARIANTS.length);
  expect(new Set(namespaces).size).toBe(namespaces.length);
});

test('a comment placed through the review UI lands in review/comments.json and REVIEW.md', async ({
  page,
}) => {
  // Plain words: REVIEW.md escapes Markdown punctuation in reviewer text.
  const body = `Rename this heading on ${test.info().project.name}`;
  page.on('dialog', (dialog) => {
    if (dialog.type() !== 'prompt') return void dialog.dismiss();
    if (dialog.message().startsWith('Name shown')) return void dialog.accept('Riley Reviewer');
    return void dialog.accept(body);
  });
  await openPlayer(page, 'v1/index.html');
  const launcher = page.getByRole('button', { name: /^Review: \d+ comment threads?/ });
  await expect(launcher).toBeVisible();
  await launcher.click();
  await page
    .getByRole('navigation', { name: 'Prototype review toolbar' })
    .getByRole('button', { name: 'Comment', exact: true })
    .click();
  await expect(page.locator('[data-py-review-capture]')).toBeVisible();
  const heading = page.getByRole('heading', { name: 'Overview', level: 1 });
  const box = await heading.boundingBox();
  if (!box) throw new Error('the Overview heading is visible');
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await expect(launcher).toHaveAccessibleName(/^Review: 1 comment thread/);

  const comments = join(folder, 'review', 'comments.json');
  await expect
    .poll(() => (existsSync(comments) ? readFileSync(comments, 'utf8') : ''))
    .toContain(body);

  cli(['quick', 'feedback', relative(root, folder)]);
  const review = readFileSync(join(folder, 'REVIEW.md'), 'utf8');
  expect(review).toContain(body);
  expect(review).toContain('Riley Reviewer');
});

test('quick iterate live-reloads the open tab with its rows kept, and its validation task completes', async ({
  page,
}) => {
  await openPlayer(page, '');
  await createPatient(page, 'Ada Iterate');
  // Marks this document: a live reload swaps the prototype, not the page.
  await page.evaluate(() => {
    (window as unknown as { quickLoopTab: string }).quickLoopTab = 'same';
  });

  const patch = [
    {
      op: 'add',
      path: '/validation',
      value: {
        tasks: [
          {
            id: 'open-patients',
            prompt: 'Open the list of patients.',
            success: { route: { path: '/patients' } },
          },
        ],
      },
    },
  ];
  cli(['quick', 'iterate', relative(root, folder), '--patch', '-'], JSON.stringify(patch));

  const panel = page.getByTestId('validation-panel');
  await expect(panel).toBeVisible({ timeout: 30_000 });
  expect(
    await page.evaluate(() => (window as unknown as { quickLoopTab?: string }).quickLoopTab)
  ).toBe('same');
  await route(page, '/patients', 'Patients');
  await expect(page.locator('main').getByText('Ada Iterate', { exact: true })).toBeVisible();

  await route(page, '/', 'Overview');
  await completeTask(page);

  // The live-reloaded tab keeps the pre-iterate world, so its metrics carry
  // that namespace; quick report accepts them as an earlier version.
  await importMetrics(page, panel, 'live');
  const report = JSON.parse(readFileSync(join(folder, 'report.json'), 'utf8')) as {
    groups: {
      variant: string | null;
      tasks: { id: string; earlier: { sequence: number } | null }[];
    }[];
  };
  const base = report.groups.find((group) => group.variant === null);
  expect(base?.tasks).toContainEqual(
    expect.objectContaining({
      id: 'open-patients',
      earlier: expect.objectContaining({ sequence: 1 }),
    })
  );
  expect(readFileSync(join(folder, 'REPORT.md'), 'utf8')).toContain(
    '(earlier version: before change 1, `history/0001.json`)'
  );
});

/** Downloads the panel's metrics and imports them with quick report (the run must succeed). */
async function importMetrics(page: Page, panel: ReturnType<Page['getByTestId']>, label: string) {
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download metrics' }).click();
  const metrics = join(folder, '..', `${test.info().project.name}-${label}-metrics.json`);
  await (await download).saveAs(metrics);
  try {
    cli(['quick', 'report', relative(root, folder), '--import', relative(root, metrics)]);
  } finally {
    rmSync(metrics, { force: true });
  }
}

/** Starts the panel's task (open the patients list), completes it and returns the panel. */
async function completeTask(page: Page) {
  const panel = page.getByTestId('validation-panel');
  await expect(panel.getByTestId('validation-prompt')).toHaveText('Open the list of patients.');
  await panel.getByRole('button', { name: 'Start task' }).click();
  await route(page, '/patients', 'Patients');
  await expect(panel.getByTestId('validation-outcome')).toContainText('Completed');
  return panel;
}

test('a validation session on the iterated blueprint is reported by quick report', async ({
  page,
}) => {
  // A fresh tab opens the current blueprint's own world: a current (not earlier) row.
  await openPlayer(page, '');
  const panel = await completeTask(page);
  await importMetrics(page, panel, 'fresh');
  const report = JSON.parse(readFileSync(join(folder, 'report.json'), 'utf8')) as {
    groups: { variant: string | null; tasks: { id: string; earlier: unknown }[] }[];
  };
  const base = report.groups.find((group) => group.variant === null);
  expect(base?.tasks).toContainEqual(
    expect.objectContaining({ id: 'open-patients', earlier: null })
  );
  expect(readFileSync(join(folder, 'REPORT.md'), 'utf8')).toContain('Open the list of patients.');
});

test('quick shot captures every variant, or records why it skipped', async () => {
  const testInfo = test.info();
  test.skip(testInfo.project.name !== 'chromium', 'one capture per run is enough');
  testInfo.setTimeout(180_000);
  const shot = cli<{
    files: { variant: string | null; path: string }[];
    skipped: { reason: string } | null;
  }>(['quick', 'shot', relative(root, folder)]);
  if (shot.skipped) {
    testInfo.annotations.push({ type: 'quick shot skipped', description: shot.skipped.reason });
    expect(shot.skipped.reason).toMatch(/\S/);
    expect(shot.files).toEqual([]);
    return;
  }
  expect(shot.files.map((f) => f.variant)).toEqual([null, ...VARIANTS]);
  for (const file of shot.files) {
    const png = readFileSync(join(folder, file.path));
    expect(png.subarray(1, 4).toString('latin1'), file.path).toBe('PNG');
  }
});
