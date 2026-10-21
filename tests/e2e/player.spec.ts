import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';

const PLAYER_PORT = Number(process.env.PROTOYARD_E2E_PLAYER_PORT ?? 4861);
const EMBEDDER_PORT = Number(process.env.PROTOYARD_E2E_PLAYER_EMBEDDER_PORT ?? 4862);
const PLAYER_URL = `http://127.0.0.1:${PLAYER_PORT}`;
const EMBEDDER_URL = `http://127.0.0.1:${EMBEDDER_PORT}`;
const ENABLED = process.env.PROTOYARD_E2E_PLAYER === '1';

function blueprintPath(name: string): string {
  return resolve(process.cwd(), 'blueprints/quick', name);
}

function shareFragment(name: string): string {
  const source = JSON.parse(readFileSync(blueprintPath(name), 'utf8')) as object;
  const payload = deflateRawSync(Buffer.from(JSON.stringify(source))).toString('base64url');
  return `#bp=1.${payload}`;
}

async function openPlayer(page: import('@playwright/test').Page, url: string): Promise<void> {
  await page.goto(url);
  await waitForPrototypeReady(page, { slug: 'player', timeoutMs: 30_000 });
}

test.describe('player sources, isolation and accessibility', () => {
  test.skip(!ENABLED, 'set PROTOYARD_E2E_PLAYER=1 to run the player browser suite');

  test('loads a catalog blueprint from a file source and applies scenario presentation', async ({
    page,
  }, testInfo) => {
    await openPlayer(
      page,
      `${PLAYER_URL}/?src=./blueprints/quick/analytics.json&scenario=active&mode=dark&shell=browser#/`
    );
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-py-mode', 'dark');
    if (testInfo.project.name === 'chromium') {
      await expect(page.locator('html')).toHaveAttribute('data-py-shell', 'browser');
    }
  });

  test('loads assistant from a share hash, persists a message across reload, and keeps its route', async ({
    page,
  }, testInfo) => {
    await openPlayer(page, `${PLAYER_URL}/${shareFragment('assistant.json')}`);
    const app = page.getByTestId('player-conversational-archetype');
    await expect(app).toHaveAttribute('data-archetype', 'assistant');
    await expect(app).toHaveAttribute('data-route', '/assistant');

    const prompt = 'Give me a deterministic launch checklist';
    const composer = page.getByLabel('Message the simulated assistant');
    await composer.fill(prompt);
    await composer.press('Enter');
    await expect(
      page.getByRole('article', { name: 'Your message' }).filter({ hasText: prompt })
    ).toBeVisible();

    await page.reload();
    await waitForPrototypeReady(page, { slug: 'player', timeoutMs: 30_000 });
    await expect(
      page.getByRole('article', { name: 'Your message' }).filter({ hasText: prompt })
    ).toBeVisible();
    await expectAccessible(page, testInfo, { label: 'player-share-assistant' });
  });

  test('keeps the assistant archetype accessible in dark mode', async ({ page }, testInfo) => {
    // Regression: the conversational archetype had no surface, so dark-theme text sat on
    // the browser's white canvas (axe color-contrast, found by the visual sweep).
    await page.emulateMedia({ colorScheme: 'dark' });
    await openPlayer(page, `${PLAYER_URL}/?src=./blueprints/quick/assistant.json&mode=dark`);
    await expect(page.locator('html')).toHaveAttribute('data-py-mode', 'dark');
    const surface = page.getByTestId('player-conversational-surface');
    await expect(surface).toBeVisible();
    const background = await surface.evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(background).not.toBe('rgba(0, 0, 0, 0)');
    expect(background).not.toBe('rgb(255, 255, 255)');
    await expectAccessible(page, testInfo, { label: 'player-assistant-dark' });
  });

  test('loads team chat through the postMessage embedder and checks its real route', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(
      `${EMBEDDER_URL}/tests/e2e/fixtures/player-embedder.html?player=${encodeURIComponent(PLAYER_URL)}`
    );
    await expect(page.getByTestId('embedder-status')).toHaveAttribute('data-state', 'loaded', {
      timeout: 30_000,
    });
    const frame = page.frameLocator('#player');
    await waitForPrototypeReady(page, { slug: 'player-team-chat', root: frame, timeoutMs: 30_000 });
    const app = frame.getByTestId('player-conversational-archetype');
    await expect(app).toHaveAttribute('data-archetype', 'team-chat');
    await expect(app).toHaveAttribute('data-route', '/team-chat');
    await expect(frame.getByRole('heading', { name: 'Quick Team Chat' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('keeps file and share blueprints in separate IndexedDB namespaces', async ({ page }) => {
    await openPlayer(page, `${PLAYER_URL}/?src=./blueprints/quick/analytics.json`);
    const fileNamespace = await page.evaluate(() => window.__protoyard?.manifest.storage.namespace);
    expect(fileNamespace).toMatch(/^bp-/);

    await openPlayer(page, `${PLAYER_URL}/${shareFragment('assistant.json')}`);
    const shareNamespace = await page.evaluate(
      () => window.__protoyard?.manifest.storage.namespace
    );
    expect(shareNamespace).toMatch(/^bp-/);
    expect(shareNamespace).not.toBe(fileNamespace);

    const databases = await page.evaluate(async () =>
      (await indexedDB.databases()).map((entry) => entry.name).filter(Boolean)
    );
    expect(databases).toContain(`protoyard.${fileNamespace}.data`);
    expect(databases).toContain(`protoyard.${shareNamespace}.data`);
  });
});
