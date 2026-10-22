import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Frame, type FrameLocator, type Page, test } from '@playwright/test';
import { type AnyBlueprint, encodeBlueprintShare } from '../../packages/blueprint/src/index.ts';
import { expectAccessible } from './support/a11y.ts';
import { readShowcaseKindBlueprint, SHOWCASE_KIND_TARGETS } from './targets.ts';

/**
 * The hosted showcase (`protoyard showcase`): the gallery's live preview
 * frames the bundled crm-demo build with no local control server, and data
 * created inside the iframe persists (IndexedDB) across a reload.
 *
 * PROTOYARD_E2E_SHOWCASE_BASE=/protoyard/ runs the same checks under a
 * GitHub Pages-style sub-path.
 */
const SHOWCASE_PORT = Number(process.env.PROTOYARD_E2E_SHOWCASE_PORT ?? 4501);
const ORIGIN = `http://127.0.0.1:${SHOWCASE_PORT}`;
const BASE = process.env.PROTOYARD_E2E_SHOWCASE_BASE ?? '/';
const SITE = `${ORIGIN}${BASE}`;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ANALYTICS_BLUEPRINT = readFileSync(
  resolve(process.cwd(), 'blueprints/quick/analytics.json'),
  'utf8'
);
const CREATE_ANYTHING_DECK = readFileSync(
  resolve(process.cwd(), 'blueprints/decks/protoyard-create-anything.json'),
  'utf8'
);

function playerFrame(page: Page): Frame {
  const frame = page.frames().find((candidate) => candidate.url().includes('/player/'));
  if (!frame) throw new Error(`The hosted player frame was not found on ${page.url()}`);
  return frame;
}

async function openPlay(page: Page): Promise<FrameLocator> {
  await page.goto(`${SITE}play/`);
  await expect(page.getByRole('heading', { name: 'Run a blueprint' })).toBeVisible();
  return page.frameLocator('iframe[title="Running Protoyard blueprint"]');
}

function browserFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText ?? 'unknown';
    if (errorText === 'net::ERR_ABORTED') return;
    failures.push(`requestfailed: ${request.url()} (${errorText})`);
  });
  return failures;
}

async function loadPastedAnalytics(page: Page, app: FrameLocator): Promise<void> {
  await page.getByLabel('Blueprint JSON (app, deck, page, or document)').fill(ANALYTICS_BLUEPRINT);
  await page.getByRole('button', { name: 'Load blueprint' }).click();
  await expect(page.getByRole('status')).toContainText('Quick Product Analytics is running');
  await expect(app.locator('html')).toHaveAttribute('data-py-ready', 'true', { timeout: 20_000 });
  await expect(app.locator('main').getByRole('heading').first()).toBeVisible();
  const hideTask = app.getByRole('button', { name: 'Hide', exact: true });
  if (await hideTask.count())
    await hideTask.evaluate((element) => (element as HTMLButtonElement).click());
}

test.describe('showcase site', () => {
  test.skip(process.env.PROTOYARD_E2E_SHOWCASE !== '1', 'set PROTOYARD_E2E_SHOWCASE=1');

  for (const target of SHOWCASE_KIND_TARGETS) {
    test(`opens and reloads the hosted ${target.kind} blueprint`, async ({ page }) => {
      const failures = browserFailures(page);
      const source = JSON.parse(readShowcaseKindBlueprint(target)) as AnyBlueprint;
      const share = await encodeBlueprintShare(source);
      await page.goto(`${SITE}play/#bp=${share}`);
      await expect(page.getByRole('heading', { name: 'Run a blueprint' })).toBeVisible();
      const app = page.frameLocator('iframe[title="Running Protoyard blueprint"]');
      await expect(app.locator('html')).toHaveAttribute('data-py-ready', 'true', {
        timeout: 20_000,
      });
      const kindRoot = app.locator(target.root);
      await expect(kindRoot).toBeVisible();
      if (target.kind === 'app') {
        await expect(kindRoot.getByRole('heading').first()).toBeVisible();
      } else {
        await expect(
          kindRoot.getByRole('heading', { name: target.heading, exact: true }).first()
        ).toBeVisible();
      }

      if (target.kind === 'deck') {
        await kindRoot.press('ArrowRight');
        await expect(kindRoot).toHaveAttribute('data-slide-id', target.nextSlide);
      }

      await page.reload();

      const reloadedApp = page.frameLocator('iframe[title="Running Protoyard blueprint"]');
      await expect(reloadedApp.locator('html')).toHaveAttribute('data-py-ready', 'true', {
        timeout: 20_000,
      });
      const reloadedRoot = reloadedApp.locator(target.root);
      await expect(reloadedRoot).toBeVisible();
      if (target.kind === 'app') {
        await expect(reloadedRoot.getByRole('heading').first()).toBeVisible();
      } else {
        await expect(
          reloadedRoot.getByRole('heading', { name: target.heading, exact: true }).first()
        ).toBeVisible();
      }
      expect(playerFrame(page).url()).toContain('/player/');
      expect(failures).toEqual([]);
    });
  }

  test('runs a pasted blueprint through a mutation and persona/scenario switch', async ({
    page,
  }, testInfo) => {
    const failures = browserFailures(page);
    const app = await openPlay(page);
    await loadPastedAnalytics(page, app);

    const frame = playerFrame(page);
    const switched = await frame.evaluate(async () => {
      const runtime = window.__protoyard;
      if (!runtime) throw new Error('Hosted player runtime is unavailable.');
      const before = runtime.session.principal()?.persona.id;
      await runtime.scenarios.load('active');
      const candidate = runtime.session.personas().find((persona) => persona.id !== before);
      if (candidate) await runtime.session.switchActor(candidate.id);
      return {
        scenario: runtime.scenarios.active()?.scenario.id,
        before,
        after: runtime.session.principal()?.persona.id,
      };
    });
    expect(switched.scenario).toBe('active');
    expect(switched.after).toBeTruthy();
    expect(switched.after).not.toBe(switched.before);

    const ownerId = await frame.evaluate(() => {
      const runtime = window.__protoyard;
      return runtime?.session.memberships().find((membership) => membership.role === 'owner')
        ?.personaId;
    });
    if (!ownerId) throw new Error('The hosted analytics blueprint has no owner persona.');
    await frame.evaluate(async (personaId: string) => {
      await window.__protoyard?.session.switchActor(personaId);
    }, ownerId);

    const openNavigation = app.getByRole('button', { name: 'Open navigation' });
    if (await openNavigation.count()) await openNavigation.click();
    await app
      .getByRole('link', { name: 'Metrics' })
      .evaluate((element) => (element as HTMLAnchorElement).click());
    await expect(app.getByRole('heading', { name: 'Metric' })).toBeVisible();
    await expect.poll(() => frame.url()).toContain('#/metrics');
    await app.getByRole('button', { name: 'New', exact: true }).click();
    const metricName = `Hosted Play Metric ${testInfo.project.name}`;
    await app.getByLabel('Name').fill(metricName);
    await app.getByLabel('Value').fill('42');
    await app.getByRole('button', { name: 'Create Metric' }).click({ force: true });
    await expect(app.getByText(metricName, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Copy share link' }).click();
    await expect(page.getByRole('status')).toContainText(/Share link/);
    const shareUrl = page.url();
    expect(shareUrl).toContain('#bp=1.');
    await expectAccessible(page, testInfo, { include: 'main', label: 'hosted-player-paste' });
    expect(failures).toEqual([]);
  });

  test('loads and shares the flagship deck pasted into the hosted player', async ({ page }) => {
    await openPlay(page);
    await page
      .getByLabel('Blueprint JSON (app, deck, page, or document)')
      .fill(CREATE_ANYTHING_DECK);
    await page.getByRole('button', { name: 'Load blueprint' }).click();
    await expect(page.getByRole('status')).toContainText('Protoyard: create anything is running');

    const deckFrame = page.frameLocator('iframe[title="Running Protoyard blueprint"]');
    await expect(deckFrame.locator('[data-py-deck-app]')).toBeVisible();
    expect(playerFrame(page).url()).toContain('/player/deck.html?embedder=');

    await page.getByRole('button', { name: 'Copy share link' }).click();
    await expect(page.getByRole('status')).toContainText(/Share link/);
    const shareUrl = page.url();
    expect(shareUrl).toContain('#bp=1.');

    const sharedPage = await page.context().newPage();
    await sharedPage.goto(shareUrl);
    const sharedDeck = sharedPage.frameLocator('iframe[title="Running Protoyard blueprint"]');
    await expect(sharedDeck.locator('[data-py-deck-app]')).toBeVisible({ timeout: 20_000 });
    expect(playerFrame(sharedPage).url()).toContain('/player/deck.html?embedder=');
    await sharedPage.close();
  });

  test('opens a share-link blueprint in the hosted player route with axe coverage', async ({
    page,
  }, testInfo) => {
    const failures = browserFailures(page);
    await openPlay(page);
    await page
      .getByLabel('Blueprint JSON (app, deck, page, or document)')
      .fill(ANALYTICS_BLUEPRINT);
    await page.getByRole('button', { name: 'Copy share link' }).click();
    await expect(page.getByRole('status')).toContainText(/Share link/);
    const shareUrl = page.url();
    expect(shareUrl).toContain('#bp=1.');

    const sharedPage = await page.context().newPage();
    const sharedFailures = browserFailures(sharedPage);
    await sharedPage.goto(shareUrl);
    let sharedApp = sharedPage.frameLocator('iframe[title="Running Protoyard blueprint"]');
    await expect(sharedApp.locator('html')).toHaveAttribute('data-py-ready', 'true', {
      timeout: 20_000,
    });
    await expect(sharedApp.locator('main').getByRole('heading').first()).toBeVisible();
    await sharedPage.reload();
    sharedApp = sharedPage.frameLocator('iframe[title="Running Protoyard blueprint"]');
    await expect(sharedApp.locator('html')).toHaveAttribute('data-py-ready', 'true', {
      timeout: 20_000,
    });
    expect(playerFrame(sharedPage).url()).toContain('/player/');
    await expectAccessible(sharedPage, testInfo, { include: 'main', label: 'hosted-player-share' });
    expect(failures).toEqual([]);
    expect(sharedFailures).toEqual([]);
    await sharedPage.close();
  });

  test('opens a card, previews the bundled CRM and keeps data after reload', async ({ page }) => {
    await page.goto(SITE);
    await expect(page.locator('#browse[data-hydrated="true"]')).toHaveCount(1);
    await page.getByTestId('search').fill('crm-demo');
    await page.locator('[data-testid="results"] [data-slug="crm-demo"] h3 a').click();
    await expect(page).toHaveURL(new RegExp(`${escapeRe(BASE)}p/crm-demo/?$`));
    await expect(page.getByTestId('control-status')).toContainText('Live demo');

    const app = page.frameLocator('iframe[title^="Pipeline CRM preview"]');
    await expect(app.locator('html')).toHaveAttribute('data-py-ready', 'true', { timeout: 20_000 });

    // A real write through the CRM's own UI and services.
    const name = `Showcase Probe ${test.info().project.name}`;
    await app.getByRole('link', { name: 'Companies' }).first().click();
    await app.getByRole('button', { name: 'New company' }).click();
    const dialog = app.getByRole('dialog');
    await dialog.getByLabel('Name').fill(name);
    await dialog.getByLabel('Website domain').fill('probe.example');
    await dialog.getByLabel('Employees').fill('12');
    // Enter submits the form; inside a scaled preview the button can sit below the fold.
    await dialog.getByLabel('Employees').press('Enter');
    await expect(app.getByText(name).first()).toBeVisible();

    // Reload the framed app only: data must come back from IndexedDB.
    await page
      .getByTestId('control-status')
      .getByRole('button', { name: 'Reload', exact: true })
      .click();
    await expect(app.locator('html')).toHaveAttribute('data-py-ready', 'true', { timeout: 20_000 });
    await app.getByRole('link', { name: 'Companies' }).first().click();
    // The list is paginated and sorted; search for the probe like a user would.
    await app.getByRole('searchbox', { name: 'Search Companies' }).fill('Showcase Probe');
    await expect(app.getByText(name).first()).toBeVisible();
  });

  test('scenario links open the bundled build with ?scenario=', async ({ page }) => {
    await page.goto(`${SITE}p/crm-demo/`);
    const link = page.getByTestId('scenarios').getByRole('link').first();
    await expect(link).toHaveAttribute(
      'href',
      new RegExp(`^${escapeRe(BASE)}p/crm-demo/app/\\?scenario=`)
    );
    const response = await page.request.get(
      new URL((await link.getAttribute('href')) ?? '', ORIGIN).toString()
    );
    expect(response.ok()).toBe(true);
  });

  test('thumbnails and assets resolve under the base path', async ({ page }) => {
    const failed: string[] = [];
    page.on('response', (r) => {
      if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
    });
    await page.goto(SITE);
    await expect(page.locator('#browse[data-hydrated="true"]')).toHaveCount(1);
    await page.waitForLoadState('networkidle');
    expect(failed).toEqual([]);
  });

  test('compare scenarios: sandboxed frames never touch each other or the default world', async ({
    page,
  }, testInfo) => {
    const ready = (frame: FrameLocator) =>
      expect(frame.locator('html')).toHaveAttribute('data-py-ready', 'true', { timeout: 20_000 });
    // Negative checks only after the list shows its data (data-py-ready is set
    // at mount, before the first query returns).
    const searchCompanies = async (frame: FrameLocator, text: string) => {
      await frame.getByRole('link', { name: 'Companies' }).first().click();
      await expect(frame.getByText('18 accounts')).toBeVisible();
      await frame.getByRole('searchbox', { name: 'Search Companies' }).fill(text);
    };

    await page.goto(`${SITE}p/crm-demo/`);
    await page.getByTestId('compare-link').click();
    await expect(page).toHaveURL(new RegExp(`${escapeRe(BASE)}p/crm-demo/compare/`));
    await expect(page.locator('[data-testid="compare"][data-hydrated="true"]')).toHaveCount(1);
    const a = page.frameLocator('[data-testid="compare-pane-a"] iframe');
    const b = page.frameLocator('[data-testid="compare-pane-b"] iframe');
    await ready(a);
    await ready(b);
    await expectAccessible(page, testInfo, { label: 'compare' });

    // Both frames on the SAME scenario, so only the sandbox separates them.
    await page.getByTestId('compare-scenario-b').selectOption('growing-team');
    await expect(page).toHaveURL(/[?&]b=growing-team/);
    await ready(b);

    const name = `Compare Probe ${testInfo.project.name}`;
    await a.getByRole('link', { name: 'Companies' }).first().click();
    await a.getByRole('button', { name: 'New company' }).click();
    const dialog = a.getByRole('dialog');
    await dialog.getByLabel('Name').fill(name);
    await dialog.getByLabel('Website domain').fill('compare.example');
    await dialog.getByLabel('Employees').fill('7');
    await dialog.getByLabel('Employees').press('Enter');
    await expect(a.getByRole('heading', { level: 1, name })).toBeVisible();

    await searchCompanies(b, 'Compare Probe');
    await expect(b.getByRole('row', { name: /^Open Compare Probe/ })).toHaveCount(0);
    await expect(b.getByText('18 accounts')).toBeVisible();

    // The prototype's default (non-sandboxed) world is untouched too.
    const app = await page.context().newPage();
    await app.goto(`${SITE}p/crm-demo/app/#/companies`);
    await expect(app.locator('html')).toHaveAttribute('data-py-ready', 'true', { timeout: 20_000 });
    await expect(app.getByText('18 accounts')).toBeVisible();
    await app.getByRole('searchbox', { name: 'Search Companies' }).fill('Compare Probe');
    await expect(app.getByRole('row', { name: /^Open Compare Probe/ })).toHaveCount(0);
    await app.close();

    // Reset: fresh sandbox names, so frame A re-seeds without the probe.
    await page.getByTestId('compare-reset').click();
    await expect(page.locator('[data-testid="compare-pane-a"] iframe')).toHaveAttribute(
      'data-sandbox',
      'compare-a-1'
    );
    await expect(page).toHaveURL(/[?&]gen=1/);
    await ready(a);
    await searchCompanies(a, 'Compare Probe');
    await expect(a.getByRole('row', { name: /^Open Compare Probe/ })).toHaveCount(0);
  });
});
