// @vitest-environment node
/**
 * Archetype routes in a real browser (Chromium, the built player under its
 * CSP header): /assistant, /chat (team chat), /onboarding (SaaS kit) and
 * /analytics each render from a blueprint loaded with ?src=, with no page
 * error or policy violation, and the business kits download only when their
 * route opens. Skips with a warning when Playwright or Chromium is missing.
 */
import type { Server } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensurePlayerBuild, serveDist } from './support/serve-dist.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const QUICK = ['assistant', 'team-chat', 'saas-onboarding', 'analytics'] as const;

type Playwright = typeof import('@playwright/test');
type Browser = Awaited<ReturnType<Playwright['chromium']['launch']>>;

let server: Server | undefined;
let origin = '';
let browser: Browser | null = null;

beforeAll(async () => {
  const dist = ensurePlayerBuild(ROOT);
  const extra = Object.fromEntries(
    QUICK.map((name) => [`/fixtures/${name}.json`, join(ROOT, 'blueprints/quick', `${name}.json`)])
  );
  ({ server, origin } = await serveDist(dist, extra));
  try {
    const playwright: Playwright = await import('@playwright/test');
    browser = await playwright.chromium.launch();
  } catch (error) {
    console.warn(
      `archetypes-browser: no Chromium (${String(error).split('\n')[0]}); browser checks skipped`
    );
  }
}, 600_000);

afterAll(async () => {
  await browser?.close();
  server?.close();
});

/** Opens the player on a quick blueprint at an app route and waits until it is ready. */
async function open(name: (typeof QUICK)[number], route: string) {
  if (!browser) return null;
  const page = await browser.newPage();
  const problems: string[] = [];
  const scripts: { url: string; body: string }[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy/i.test(message.text()))
      problems.push(message.text());
  });
  page.on('response', async (response) => {
    if (response.url().endsWith('.js'))
      scripts.push({ url: response.url(), body: await response.text().catch(() => '') });
  });
  await page.goto(`${origin}/index.html?devtools=0&src=./fixtures/${name}.json#${route}`);
  await page.waitForSelector('html[data-protoyard-ready="1"]', { timeout: 60_000 });
  return { page, problems, scripts };
}

describe.runIf(process.env.PROTOYARD_SKIP_BROWSER !== '1')('archetype routes in Chromium', () => {
  it('renders the assistant workspace at /assistant', { timeout: 120_000 }, async () => {
    const opened = await open('assistant', '/assistant');
    if (!opened) return;
    const view = opened.page.getByTestId('player-conversational-archetype');
    await view.waitFor({ timeout: 30_000 });
    expect(await view.getAttribute('data-archetype')).toBe('assistant');
    expect(opened.problems).toEqual([]);
    await opened.page.close();
  });

  it('renders team chat at /chat through the shared conversational entry', {
    timeout: 120_000,
  }, async () => {
    const opened = await open('team-chat', '/chat');
    if (!opened) return;
    const view = opened.page.getByTestId('player-conversational-archetype');
    await view.waitFor({ timeout: 30_000 });
    expect(await view.getAttribute('data-archetype')).toBe('team-chat');
    expect(opened.problems).toEqual([]);
    await opened.page.close();
  });

  it('opens the SaaS onboarding wizard at /onboarding from the lazy kit route', {
    timeout: 120_000,
  }, async () => {
    const opened = await open('saas-onboarding', '/');
    if (!opened) return;
    const { page } = opened;
    await page
      .getByRole('link', { name: /Get started/ })
      .first()
      .waitFor({ timeout: 30_000 });
    expect(opened.scripts.some((script) => script.body.includes('Set up your account'))).toBe(
      false
    );
    await page.evaluate(() => {
      (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
    });
    await page
      .getByRole('link', { name: /Get started/ })
      .first()
      .click();
    await page.getByRole('heading', { name: /Set up your account/ }).waitFor({ timeout: 30_000 });
    expect(
      await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)
    ).toBe(true);
    expect(opened.scripts.some((script) => script.body.includes('Set up your account'))).toBe(true);
    expect(opened.problems).toEqual([]);
    await page.close();
  });

  it('loads the analytics dashboard only when /analytics opens, then records a metric', {
    timeout: 120_000,
  }, async () => {
    const opened = await open('analytics', '/');
    if (!opened) return;
    const { page } = opened;
    await page.locator('a[href="#/analytics"]').first().waitFor({ timeout: 30_000 });
    const before = opened.scripts.filter((script) => script.body.includes('Record metric')).length;
    expect(before).toBe(0);
    await page.locator('a[href="#/analytics"]').first().click();
    await page.getByTestId('player-analytics-archetype').waitFor({ timeout: 30_000 });
    const dashboard = opened.scripts.filter((script) => script.body.includes('Record metric'));
    expect(dashboard.length).toBeGreaterThan(0);
    console.info(
      `archetypes-browser: analytics route chunk(s) ${dashboard.map((script) => `${script.url.split('/').pop()} ${(script.body.length / 1024).toFixed(1)} KB raw`).join(', ')}`
    );
    await page.getByLabel('Metric name').fill('Activation rate');
    await page.getByLabel('Metric value').fill('42');
    await page.getByRole('button', { name: 'Record metric' }).click();
    await page
      .getByRole('list', { name: 'Metrics' })
      .getByText('Activation rate')
      .waitFor({ timeout: 30_000 });
    expect(opened.problems).toEqual([]);
    await page.close();
  });
});
