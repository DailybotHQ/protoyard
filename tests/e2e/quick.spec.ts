import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const slug = 'quick-compare-e2e';
const folder = join(root, '.protoyard', 'quick', slug);
const port = Number(process.env.PROTOYARD_E2E_QUICK_PORT ?? 4878);

test('served compare frames become ready in separate blueprint namespaces', async ({ page }) => {
  rmSync(folder, { recursive: true, force: true });
  execFileSync(
    process.execPath,
    [
      'packages/cli/bin/protoyard.mjs',
      'quick',
      '--blueprint',
      'blueprints/quick/analytics.json',
      '--slug',
      slug,
      '--variants',
      '2',
    ],
    { cwd: root, stdio: 'pipe' }
  );

  const server: ChildProcess = spawn(
    process.execPath,
    [
      'packages/cli/bin/protoyard.mjs',
      'quick',
      'serve',
      slug,
      '--port',
      String(port),
      '--strict-port',
    ],
    { cwd: root, stdio: 'ignore' }
  );
  try {
    const origin = `http://127.0.0.1:${port}`;
    let available = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (server.exitCode !== null) throw new Error(`quick server exited with ${server.exitCode}`);
      available = await fetch(`${origin}/${slug}/compare.html`).then(
        (response) => response.ok,
        () => false
      );
      if (available) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(available).toBe(true);
    await page.goto(`${origin}/${slug}/compare.html`);

    await expect.poll(() => page.locator('iframe').count()).toBe(2);
    for (const index of [0, 1]) {
      const iframe = page.locator('iframe').nth(index);
      await iframe.scrollIntoViewIfNeeded();
      await expect(iframe.contentFrame().locator('html[data-protoyard-ready="1"]')).toBeAttached({
        timeout: 30_000,
      });
    }
    const frames = page
      .frames()
      .filter((frame) => new URL(frame.url()).pathname.includes('/_player/1.0.0/'));
    expect(frames).toHaveLength(2);
    for (const frame of frames) {
      await frame.locator('html[data-protoyard-ready="1"]').waitFor({ timeout: 30_000 });
    }

    const namespaces = await page.evaluate(async () =>
      (await indexedDB.databases())
        .map((database) => /^protoyard\.(bp-[a-z2-7]+)\.data$/.exec(database.name ?? '')?.[1])
        .filter((namespace): namespace is string => namespace !== undefined)
    );
    expect(namespaces).toHaveLength(2);
    expect(new Set(namespaces).size).toBe(2);
  } finally {
    server.kill('SIGINT');
    await new Promise<void>((resolve) => {
      if (server.exitCode !== null) resolve();
      else {
        server.once('exit', () => resolve());
        setTimeout(resolve, 2_000);
      }
    });
    rmSync(folder, { recursive: true, force: true });
  }
});
