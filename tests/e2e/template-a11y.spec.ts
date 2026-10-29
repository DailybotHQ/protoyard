import { type ChildProcess, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { listTemplates } from '../../packages/templates/index.js';
import { expectAccessible } from './support/a11y.ts';

const enabled = process.env.PROTOYARD_E2E_TEMPLATES_A11Y === '1';
const templates = listTemplates();
const root = process.cwd();
const vite = resolve(root, 'node_modules/vite/bin/vite.js');
const port = Number(process.env.PROTOYARD_E2E_TEMPLATE_PORT ?? 5551);

async function waitUntilReady(child: ChildProcess, url: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`Template Vite exited with code ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  throw new Error(`Template Vite did not become ready at ${url}`);
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.killed) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise<void>((resolvePromise) => child.once('exit', () => resolvePromise())),
    new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 5_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

test.describe('template home accessibility', () => {
  test.describe.configure({ mode: 'serial' });

  for (const template of templates) {
    test(`${template.name} home has no serious or critical axe findings in light and dark`, async ({
      page,
    }, testInfo) => {
      test.skip(!enabled, 'set PROTOYARD_E2E_TEMPLATES_A11Y=1 to run the all-template axe sweep');
      test.skip(
        testInfo.project.name !== 'chromium',
        'the all-template sweep runs once in Chromium'
      );
      test.setTimeout(120_000);

      const child = spawn(
        process.execPath,
        [vite, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
        { cwd: template.dir, stdio: 'ignore' }
      );
      const url = `http://127.0.0.1:${port}/`;
      const homeUrl = template.name === 'team-chat' ? `${url}?scenario=busy-day` : url;
      try {
        await waitUntilReady(child, url);
        for (const mode of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: mode, reducedMotion: 'reduce' });
          await page.goto(homeUrl);
          await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', {
            timeout: 15_000,
          });
          await expect(page.locator('html')).toHaveAttribute('data-py-mode', mode);
          await page.waitForLoadState('networkidle');
          await page.waitForFunction(() =>
            document.getAnimations().every((animation) => animation.playState !== 'running')
          );
          await expectAccessible(page, testInfo, { label: `${template.name}-${mode}` });

          if (mode === 'light' && template.name === 'plugin-panel') {
            await page.locator('[data-py-shell-part="screen"]').evaluate((element) => {
              element.style.setProperty('--py-app-height', '400px');
            });
            await expect(page.locator('.plugin-panel')).toHaveCSS('min-height', '400px');
            await page.getByRole('button', { name: 'Connect account' }).click();
            await expect(
              page.getByRole('dialog').getByRole('heading', { name: 'Connect an account' })
            ).toHaveCount(1);
          }

          if (mode === 'light' && template.name === 'ai-assistant') {
            await page.locator('[data-py-shell-part="screen"]').evaluate((element) => {
              element.style.setProperty('--py-app-height', '400px');
            });
            await expect(page.locator('[class*="h-[var(--py-app-height,100dvh)]"]')).toHaveCSS(
              'height',
              '400px'
            );
            await page.route('**/LazyCanvas.svelte*', (route) => route.abort());
            await page.getByRole('button', { name: 'Canvas' }).click();
            await expect(page.getByRole('status')).toBeVisible();
            await page.unroute('**/LazyCanvas.svelte*');
            await page.route('**/*voice*', (route) => route.abort());
            await page.getByRole('button', { name: 'Voice' }).click();
            await expect(page.getByRole('alert')).toBeVisible();
            await page.unroute('**/*voice*');
            await page.reload();
            await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true');
            await page.getByRole('link', { name: 'Settings', exact: true }).click();
            await expect(page.getByRole('heading', { name: 'Assistant settings' })).toBeVisible();
            const clearData = page.getByRole('button', { name: 'Clear local workspace data' });
            await expect(clearData).toBeVisible();
            await clearData.hover();
            await expectAccessible(page, testInfo, { label: 'ai-assistant-clear-data-hover' });
          }

          if (mode === 'dark' && template.name === 'ai-assistant') {
            const attach = page.getByRole('button', { name: 'Attach files' });
            await expect(attach).toBeVisible();
            await expect(attach).not.toHaveCSS('color', 'rgb(36, 34, 53)');
          }

          if (mode === 'light' && template.name === 'team-chat') {
            const search = page.getByRole('textbox', { name: 'Search messages' });
            await search.fill('shipping');
            await page.getByRole('button', { name: 'Search', exact: true }).first().click();
            const results = page.getByRole('region', { name: 'Search results' });
            const hit = results.getByRole('button').first();
            await expect(hit).toBeVisible();
            await expect(hit).toHaveAttribute('data-variant', 'ghost');
            await expect(hit).toHaveCSS('white-space', 'normal');
            await expect(hit).toHaveCSS('justify-content', 'flex-start');
          }

          if (mode === 'light' && template.name === 'docs-wiki') {
            await page.locator('a[href^="#/pages/"]').first().click();
            await page.getByRole('link', { name: 'History' }).click();
            await expect(page.getByRole('heading', { name: 'History', level: 1 })).toBeVisible();
            const version = page
              .getByRole('list', { name: 'Versions' })
              .getByRole('button')
              .first();
            await expect(version).toHaveCSS('flex-direction', 'column');
            await expect(version).toHaveCSS('white-space', 'normal');
          }
        }
      } finally {
        await stop(child);
      }
    });
  }
});
