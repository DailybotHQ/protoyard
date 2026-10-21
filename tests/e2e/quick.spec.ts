import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';

/**
 * The quick loop in a real browser (PROTOYARD_E2E_QUICK=1): `protoyard quick`
 * from a brief with three variants, a validation task added with
 * `quick iterate`, then `quick serve`. Over http (compare frames are
 * unreliable from file://) every compare frame reaches ready in its own
 * `bp-` namespace, each variant keeps its own world across a reload, a
 * comment posted through the review UI lands in REVIEW.md via
 * `quick feedback`, one validation task completes and is recorded, and axe
 * finds nothing serious on the exploration or the compare page. It runs on
 * the desktop and mobile projects, each with its own workspace and port, in
 * a fresh browser context per test. The player is the built one that
 * @protoyard/cli depends on (`pnpm --filter @protoyard/player build`).
 */

const enabled = process.env.PROTOYARD_E2E_QUICK === '1';
test.skip(!enabled, 'set PROTOYARD_E2E_QUICK=1 to run the quick loop');
test.describe.configure({ mode: 'serial' });

const REPO = process.cwd();
const CLI = join(REPO, 'packages', 'cli', 'bin', 'protoyard.mjs');
const BRIEF = 'A fictional climbing gym tracks members and their bookings for classes.';
const SLUG = 'gym-bookings';
const PORT_BASE = Number(process.env.PROTOYARD_E2E_QUICK_PORT ?? 4878);
const TASK_PATCH = [
  {
    op: 'add',
    path: '/validation',
    value: {
      tasks: [
        {
          id: 'open-bookings',
          prompt: 'Open the bookings list.',
          timeLimitSeconds: 120,
          success: { route: { path: '/bookings' } },
        },
      ],
    },
  },
];

let workspace = '';
let server: ChildProcess | undefined;
let origin = '';

/** Runs the CLI against the throwaway workspace and returns its JSON envelope's data. */
function protoyard<T>(...args: string[]): T {
  const stdout = execFileSync(process.execPath, [CLI, '--root', workspace, '--json', ...args], {
    cwd: REPO,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return (JSON.parse(stdout) as { data: T }).data;
}

const exploration = (path = '') => join(workspace, '.protoyard', 'quick', SLUG, path);

test.beforeAll(async ({}, testInfo) => {
  workspace = realpathSync(mkdtempSync(join(tmpdir(), 'protoyard-quick-e2e-')));
  writeFileSync(join(workspace, 'pnpm-workspace.yaml'), 'packages:\n  - prototypes/*\n');
  writeFileSync(join(workspace, 'package.json'), '{"name":"quick-e2e","private":true}\n');

  const created = protoyard<{ variants: { id: string }[] }>(
    'quick',
    BRIEF,
    '--slug',
    SLUG,
    '--variants',
    '3'
  );
  expect(created.variants.map((variant) => variant.id)).toEqual(['v1', 'v2', 'v3']);
  const patch = join(workspace, 'add-task.json');
  writeFileSync(patch, JSON.stringify(TASK_PATCH));
  protoyard('quick', 'iterate', SLUG, '--patch', patch);

  const port = PORT_BASE + testInfo.project.name.length; // chromium 8, mobile 6: distinct
  origin = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    [CLI, '--root', workspace, 'quick', 'serve', SLUG, '--port', String(port), '--strict-port'],
    { cwd: REPO, stdio: 'ignore' }
  );
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`quick serve exited with ${server.exitCode}`);
    const ok = await fetch(`${origin}/${SLUG}/compare.html`).then(
      (response) => response.ok,
      () => false
    );
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('quick serve did not start');
});

test.afterAll(async () => {
  if (server && server.exitCode === null) {
    server.kill('SIGINT');
    await new Promise<void>((resolve) => {
      server?.once('exit', () => resolve());
      setTimeout(resolve, 3_000);
    });
  }
  if (workspace) rmSync(workspace, { recursive: true, force: true });
});

type Runtime = {
  manifest: { storage: { namespace: string } };
  definition: { scenarios: { id: string }[] };
  scenarios: { active(): { scenario: { id: string } } | null; load(id: string): Promise<unknown> };
};
declare global {
  interface Window {
    __protoyard?: Runtime;
  }
}

/** Opens a launcher (`''` for the base, `v1/`…) and waits for the player to be ready. */
async function open(page: Page, folder = '') {
  await page.goto(`${origin}/${SLUG}/${folder}`);
  await waitForPrototypeReady(page, { slug: `${SLUG}/${folder}`, timeoutMs: 30_000 });
}

const runtimeState = (page: Page) =>
  page.evaluate(() => {
    const rt = window.__protoyard;
    if (!rt) throw new Error('no runtime');
    return {
      namespace: rt.manifest.storage.namespace,
      scenario: rt.scenarios.active()?.scenario.id ?? null,
      scenarios: rt.definition.scenarios.map((scenario) => scenario.id),
    };
  });

test('every compare frame becomes ready in its own blueprint namespace', async ({ page }) => {
  await page.goto(`${origin}/${SLUG}/compare.html`);
  await expect(page.locator('iframe')).toHaveCount(3);
  for (const index of [0, 1, 2]) {
    const iframe = page.locator('iframe').nth(index);
    await iframe.scrollIntoViewIfNeeded();
    await expect(iframe.contentFrame().locator('html[data-protoyard-ready="1"]')).toBeAttached({
      timeout: 30_000,
    });
  }
  const namespaces = await page.evaluate(async () =>
    (await indexedDB.databases())
      .map((database) => /^protoyard\.(bp-[a-z2-7]+)\.data$/.exec(database.name ?? '')?.[1])
      .filter((namespace): namespace is string => namespace !== undefined)
  );
  expect(namespaces).toHaveLength(3);
  expect(new Set(namespaces).size).toBe(3);
});

test('each variant keeps its own world across a reload', async ({ page }) => {
  const seen: { namespace: string; scenario: string | null }[] = [];
  for (const [index, folder] of ['v1/', 'v2/', 'v3/'].entries()) {
    await open(page, folder);
    const before = await runtimeState(page);
    // Move this variant to a scenario of its own choosing (not the default one).
    const target = before.scenarios[(index + 1) % before.scenarios.length] as string;
    await page.evaluate((id) => window.__protoyard?.scenarios.load(id), target);
    await page.reload();
    await waitForPrototypeReady(page, { slug: folder, timeoutMs: 30_000 });
    const after = await runtimeState(page);
    expect(after.namespace, folder).toBe(before.namespace);
    expect(after.scenario, folder).toBe(target);
    seen.push(after);
  }
  expect(new Set(seen.map((state) => state.namespace)).size).toBe(3);
  // Isolation: the base exploration still has its own default world.
  await open(page);
  const base = await runtimeState(page);
  expect(seen.map((state) => state.namespace)).not.toContain(base.namespace);
  expect(base.scenario).toBe('active');
});

test('a comment posted through the review UI lands in REVIEW.md', async ({ page }) => {
  const body = 'Show the class name on each booking card.';
  page.on('dialog', (dialog) => {
    if (dialog.type() !== 'prompt') return void dialog.dismiss();
    if (dialog.message().startsWith('Name shown')) return void dialog.accept('Riley');
    return void dialog.accept(body);
  });
  await open(page);
  await page.getByRole('button', { name: /^Review: \d+ comment threads?/ }).click();
  await page
    .getByRole('navigation', { name: 'Prototype review toolbar' })
    .getByRole('button', { name: 'Comment', exact: true })
    .click();
  await page.locator('[data-py-review-capture]').waitFor();
  const box = await page.locator('h1').first().boundingBox();
  if (!box) throw new Error('the heading is visible');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect
    .poll(() => {
      try {
        return readFileSync(exploration('review/comments.json'), 'utf8');
      } catch {
        return '';
      }
    })
    .toContain(body);

  protoyard('quick', 'feedback', SLUG);
  expect(readFileSync(exploration('REVIEW.md'), 'utf8')).toContain(
    '> Show the class name on each booking card\\.'
  );
});

test('a validation task completes and its attempt is recorded', async ({ page }) => {
  await open(page);
  const panel = page.getByTestId('validation-panel');
  await expect(panel.getByTestId('validation-prompt')).toHaveText('Open the bookings list.');
  await panel.getByRole('button', { name: 'Start task' }).click();
  await page.evaluate(() => {
    location.hash = '#/bookings';
  });
  await expect(panel).toContainText('Completed', { timeout: 15_000 });
  const namespace = (await runtimeState(page)).namespace;
  const attempts = await page.evaluate(
    (name) =>
      new Promise<{ taskId: string; outcome: string }[]>((resolve, reject) => {
        const request = indexedDB.open(`protoyard.${name}.validation`);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const all = request.result.transaction('attempts').objectStore('attempts').getAll();
          all.onsuccess = () => resolve(all.result as { taskId: string; outcome: string }[]);
          all.onerror = () => reject(all.error);
        };
      }),
    namespace
  );
  expect(attempts.map(({ taskId, outcome }) => ({ taskId, outcome }))).toEqual([
    { taskId: 'open-bookings', outcome: 'success' },
  ]);
});

test('the exploration and the compare page have no serious axe findings', async ({
  page,
}, testInfo) => {
  await open(page);
  await expectAccessible(page, testInfo, { label: 'quick exploration' });
  await page.goto(`${origin}/${SLUG}/compare.html`);
  await expect(page.locator('iframe')).toHaveCount(3);
  await expectAccessible(page, testInfo, { label: 'quick compare page' });
});
