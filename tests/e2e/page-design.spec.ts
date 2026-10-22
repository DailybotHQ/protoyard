import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import {
  checkDesignFacts,
  collectDesignFacts,
  type DesignLevel,
  type DesignTarget,
  PAGE_DESIGN_TARGETS,
  prepareDesignBuilds,
  REQUIRED_THEME_TOKENS,
  serveStatic,
} from '../../scripts/lib/page-design.ts';

/**
 * The page and doc design gate (opt-in: PROTOYARD_E2E_PAGE=1). It opens the
 * example landing page (Tidewater Roasters) and quarterly report (Northwind)
 * in the built player (level 1) and as prototypes generated and built by the
 * real CLI (level 2), on the desktop and phone projects, and asserts:
 *
 * - the theme stylesheet is applied (theme tokens set, body and title in the
 *   theme's fonts, never the browser's default serif);
 * - the hero and doc titles use the display scale, and appear once;
 * - a doc has exactly one table of contents;
 * - nothing overflows horizontally;
 * - timeline labels do not overlap their markers;
 * - the page form accepts input and its response survives a reload;
 * - CTA, nav and table-of-contents links scroll to their sections.
 *
 * The builds land in tmp/page-design/ (shared by both projects through a lock;
 * PROTOYARD_E2E_PAGE_REUSE=1 keeps a finished build between runs), and a
 * full-page screenshot of every view is saved in tmp/page-design/shots/ for
 * review. Nothing there is committed.
 */

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUT = join(REPO, 'tmp', 'page-design');
const SHOTS = join(OUT, 'shots');

test.skip(
  process.env.PROTOYARD_E2E_PAGE !== '1',
  'Opt-in: PROTOYARD_E2E_PAGE=1 builds the player and the generated page and doc.'
);

const servers: { player?: string; generated: Partial<Record<string, string>> } = { generated: {} };
const closers: (() => Promise<void>)[] = [];

test.beforeAll(async () => {
  // Two production builds and the player build; slow on a loaded machine.
  test.setTimeout(50 * 60_000);
  const builds = await prepareDesignBuilds({
    repo: REPO,
    out: OUT,
    reuse: process.env.PROTOYARD_E2E_PAGE_REUSE === '1',
  });
  const player = await serveStatic(builds.player);
  closers.push(player.close);
  servers.player = player.url;
  for (const [kind, dir] of Object.entries(builds.generated)) {
    const served = await serveStatic(dir);
    closers.push(served.close);
    servers.generated[kind] = served.url;
  }
  await mkdir(SHOTS, { recursive: true });
});

test.afterAll(async () => {
  for (const close of closers.splice(0)) await close();
});

function urlOf(level: DesignLevel, target: DesignTarget): string {
  if (level === 'player') {
    const file = target.blueprint.split('/').at(-1) ?? '';
    return `${servers.player}${target.entry}?src=./${file}`;
  }
  return servers.generated[target.kind] ?? '';
}

/** Console errors, uncaught exceptions and failed requests while the test runs. */
function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`page error: ${String(error)}`));
  page.on('requestfailed', (request) => {
    // A reload or navigation cancels requests still in flight; that is not a failure.
    if (/ERR_ABORTED/.test(request.failure()?.errorText ?? '')) return;
    problems.push(`request failed: ${request.url()} (${request.failure()?.errorText})`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  return problems;
}

/** Opens a view and waits until its content (lazy blocks included) has rendered. */
async function open(page: Page, level: DesignLevel, target: DesignTarget): Promise<void> {
  await page.goto(urlOf(level, target));
  await expect(page.locator('html'), 'the view never reported ready').toHaveAttribute(
    'data-py-ready',
    'true',
    { timeout: 60_000 }
  );
  if (target.kind === 'page') {
    await expect(page.locator('[data-py-page-section="hero"] h1')).toBeVisible();
    await expect(page.locator('form[data-py-form]')).toBeVisible({ timeout: 20_000 });
  } else {
    await expect(page.locator('[data-py-doc-title]')).toBeVisible();
    await expect(page.locator('[data-py-timeline-event]').first()).toBeVisible({ timeout: 20_000 });
  }
}

/** The kind runtime's `formResponses` row count. */
function formResponses(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const runtime = (
      window as Window & {
        __protoyard?: { data: { counts(): Promise<Record<string, number>> } };
      }
    ).__protoyard;
    if (!runtime) return -1;
    return (await runtime.data.counts()).formResponses ?? 0;
  });
}

/** The top of `#id` relative to the viewport, once scrolling settles. */
async function topOf(page: Page, id: string): Promise<number> {
  return page.evaluate(
    (target) => Math.round(document.getElementById(target)?.getBoundingClientRect().top ?? 1e6),
    id
  );
}

/** Clicks an in-page link and expects its target scrolled into the upper half of the view. */
async function expectScrollsTo(page: Page, link: ReturnType<Page['locator']>, id: string) {
  await link.click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(`#${id}`);
  const height = page.viewportSize()?.height ?? 800;
  await expect
    .poll(() => topOf(page, id), { message: `#${id} should scroll into view` })
    .toBeLessThan(height / 2);
  expect(await topOf(page, id)).toBeGreaterThan(-2);
}

for (const level of ['player', 'generated'] as const) {
  for (const target of PAGE_DESIGN_TARGETS) {
    test.describe(`${target.kind} at level ${level === 'player' ? '1 (player)' : '2 (generated)'}`, () => {
      test('is styled by the theme, at the display scale, one TOC, no overflow, timeline clear', async ({
        page,
      }, testInfo) => {
        const problems = watch(page);
        await open(page, level, target);
        await page.screenshot({
          path: join(SHOTS, `${level}-${target.kind}-${testInfo.project.name}.png`),
          fullPage: true,
        });
        const facts = await page.evaluate(collectDesignFacts, {
          kind: target.kind,
          tokens: [...REQUIRED_THEME_TOKENS],
        });
        await writeFile(
          join(SHOTS, `${level}-${target.kind}-${testInfo.project.name}.json`),
          `${JSON.stringify(facts, null, 2)}\n`
        );
        expect(checkDesignFacts(facts)).toEqual([]);
        if (target.kind === 'doc') expect(facts.timeline.length).toBeGreaterThan(0);
        expect(problems).toEqual([]);
      });

      if (target.kind === 'page') {
        test('the form accepts input and its response survives a reload', async ({ page }) => {
          const problems = watch(page);
          await open(page, level, target);
          expect(await formResponses(page)).toBe(0);
          const form = page.locator('form[data-py-form]');
          const email = form.getByLabel('Email');
          await expect(email).toBeEnabled();
          await email.fill('reader@example.com');
          await form.getByRole('button', { name: 'Join the waitlist' }).click();
          await expect(page.locator('[data-py-form-success]')).toBeVisible();
          await expect.poll(() => formResponses(page)).toBe(1);

          await page.reload();
          await open(page, level, target);
          await expect
            .poll(() => formResponses(page), { message: 'the response is persisted' })
            .toBe(1);
          expect(problems).toEqual([]);
        });

        test('nav and CTA links scroll to their sections', async ({ page }) => {
          const problems = watch(page);
          await open(page, level, target);
          await expectScrollsTo(
            page,
            page.locator('[data-py-page-nav-link]', { hasText: 'How it works' }),
            'how-it-works'
          );
          await expectScrollsTo(
            page,
            page.locator('[data-py-page-section="hero"] a', { hasText: 'See the plans' }),
            'plans'
          );
          await expectScrollsTo(
            page,
            page.locator('[data-py-page-section="hero"] a', { hasText: 'Join the waitlist' }),
            'waitlist'
          );
          expect(problems).toEqual([]);
        });
      } else {
        test('table-of-contents links scroll to their sections', async ({ page }) => {
          const problems = watch(page);
          await open(page, level, target);
          const toc = page.locator('[data-py-doc-toc]').filter({ visible: true });
          await expect(toc).toHaveCount(1);
          const summary = toc.locator('summary');
          if ((await summary.count()) > 0 && (await summary.isVisible())) await summary.click();
          const link = toc.locator('[data-py-doc-toc-link]').filter({ hasText: 'Milestones' });
          const id = ((await link.getAttribute('href')) ?? '').replace(/^#/, '');
          expect(id).not.toBe('');
          await expectScrollsTo(page, link, id);
          expect(problems).toEqual([]);
        });
      }
    });
  }
}

test.describe('the gate catches the defects it exists for (R4)', () => {
  const doc = PAGE_DESIGN_TARGETS.find((target) => target.kind === 'doc') as DesignTarget;
  const page_ = PAGE_DESIGN_TARGETS.find((target) => target.kind === 'page') as DesignTarget;
  const issuesAfter = async (page: Page, target: DesignTarget, breakIt: () => void) => {
    await open(page, 'generated', target);
    await page.evaluate(breakIt);
    const facts = await page.evaluate(collectDesignFacts, {
      kind: target.kind,
      tokens: [...REQUIRED_THEME_TOKENS],
    });
    return checkDesignFacts(facts).map((issue) => issue.check);
  };

  test('an unstyled page (no stylesheet, tokens still set)', async ({ page }, testInfo) => {
    const checks = await issuesAfter(page, page_, () => {
      for (const sheet of document.querySelectorAll('link[rel="stylesheet"], style'))
        sheet.remove();
    });
    expect(checks).toContain('theme');
    // A default h1 is 32px: below the desktop display floor, above the phone one.
    if (testInfo.project.name === 'chromium') expect(checks).toContain('display-scale');
  });

  test('a doubled title, a second table of contents, a marker on its label, an overflow', async ({
    page,
  }) => {
    const checks = await issuesAfter(page, doc, () => {
      const title = document.querySelector('[data-py-doc-title]');
      title?.after(title.cloneNode(true));
      const toc = document.querySelector('[data-py-doc-toc]');
      toc?.after(toc.cloneNode(true));
      const marker = document.querySelector<HTMLElement>('[data-py-timeline-marker]');
      if (marker) marker.style.transform = 'translateX(24px)';
      const wide = document.createElement('div');
      wide.style.width = '3000px';
      wide.style.height = '10px';
      document.querySelector('[data-py-doc-flow]')?.append(wide);
    });
    for (const check of ['title-copies', 'toc', 'timeline-overlap', 'overflow']) {
      expect(checks, check).toContain(check);
    }
  });
});
