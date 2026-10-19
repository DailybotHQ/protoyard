import { expect, type Page, test } from '@playwright/test';
import { waitForPrototypeReady } from './support/ready.ts';
import {
  DEVTOOLS_TARGETS,
  devtoolsPrototypeUrl,
  HELPDESK_DEMO,
  PROTOTYPE_TARGETS,
  prototypeUrl,
} from './targets.ts';

/**
 * Pending feedback: DevTools switches react at once and show progress, and the
 * renderer's global bar + Button spinners cover slow simulated operations.
 *
 * DevTools tests need a DevTools build (PROTOYARD_E2E_DEVTOOLS_PROTOTYPES, see
 * playwright.config.ts); the global-bar tests run on the standard builds.
 * Timings are measured IN the page, from the pointerdown to the first
 * animation frame where the expected DOM is present, so Playwright's own
 * overhead is excluded. Bounds are generous for loaded CI machines; measured
 * values are in docs/PERFORMANCE.md.
 */

const BANK = 'mobile-banking-demo';
/** Persona switch, click → visible (target 100 ms; measured ~14 ms). */
const PERSONA_VISIBLE_BOUND_MS = 250;
/** Any DevTools action, click → first feedback (target 50 ms; measured ~13 ms). */
const FIRST_FEEDBACK_BOUND_MS = 100;

interface Probe {
  feedback: number;
  done: number;
}

/**
 * Starts timing at the next pointerdown. `feedback` is the first frame where
 * `feedbackSelector` matches (or `done`, whichever comes first); `done` is the
 * first frame where `doneSelector` contains `doneText`.
 */
async function armProbe(
  page: Page,
  options: { feedbackSelector: string; doneSelector: string; doneText: string }
) {
  await page.evaluate(({ feedbackSelector, doneSelector, doneText }) => {
    const probe = { start: 0, feedback: 0, done: 0 };
    (window as unknown as { __pendingProbe: typeof probe }).__pendingProbe = probe;
    document.addEventListener(
      'pointerdown',
      () => {
        probe.start = performance.now();
        const tick = (now: number) => {
          const elapsed = Math.max(1, now - probe.start);
          if (!probe.feedback && document.querySelector(feedbackSelector)) probe.feedback = elapsed;
          if (document.querySelector(doneSelector)?.textContent?.includes(doneText)) {
            probe.done = elapsed;
            if (!probe.feedback) probe.feedback = elapsed;
            return;
          }
          if (now - probe.start < 15_000) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { capture: true, once: true }
    );
  }, options);
}

async function readProbe(page: Page): Promise<Probe> {
  await page.waitForFunction(
    () => (window as unknown as { __pendingProbe?: Probe }).__pendingProbe?.done
  );
  return page.evaluate(() => (window as unknown as { __pendingProbe: Probe }).__pendingProbe);
}

const panel = (page: Page) => page.locator('[data-protoyard-devtools]');

async function openDevtools(page: Page, hash = '') {
  await page.goto(`${devtoolsPrototypeUrl(BANK)}?scenario=active-customer${hash}`);
  await waitForPrototypeReady(page, { slug: BANK });
  await page.getByRole('button', { name: /Open Protoyard DevTools/ }).click();
  await expect(
    panel(page).getByRole('complementary', { name: 'Protoyard DevTools' })
  ).toBeVisible();
}

test.describe('DevTools switching feedback (Lumen Bank, DevTools build)', () => {
  test.skip(
    !DEVTOOLS_TARGETS.includes(BANK),
    `set PROTOYARD_E2E_DEVTOOLS_PROTOTYPES to include ${BANK}`
  );

  test('a persona switch from the row text is visible in the app almost at once', async ({
    page,
  }) => {
    await openDevtools(page);
    await panel(page).getByRole('tab', { name: 'Personas' }).click();
    await armProbe(page, {
      feedbackSelector: '[data-protoyard-devtools] [aria-busy="true"]',
      doneSelector: '#app',
      doneText: ', Sam',
    });
    // Click the persona's NAME (a child of the row button): it must reach the handler.
    await panel(page)
      .getByRole('button', { name: /Sam Rivera/ })
      .getByText('Sam Rivera', { exact: true })
      .click();
    const probe = await readProbe(page);
    expect(probe.feedback).toBeLessThan(FIRST_FEEDBACK_BOUND_MS);
    expect(probe.done).toBeLessThan(PERSONA_VISIBLE_BOUND_MS);
    await expect(panel(page).locator('header')).toContainText('Sam Rivera');
    await expect(panel(page).getByRole('button', { name: /Sam Rivera/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  test('a scenario switch shows progress immediately, then the new world', async ({ page }) => {
    await openDevtools(page);
    await panel(page).getByRole('tab', { name: 'Scenario' }).click();
    await panel(page)
      .getByRole('radio', { name: /Insufficient balance/ })
      .check();
    await panel(page)
      .getByRole('button', { name: /^Load “/ })
      .click();
    await armProbe(page, {
      feedbackSelector:
        '[data-protoyard-devtools] [data-dt-working], [data-protoyard-devtools] button[aria-busy="true"]',
      doneSelector: '[data-protoyard-devtools] header',
      doneText: 'Insufficient balance',
    });
    await panel(page).getByRole('button', { name: 'Replace data' }).click();
    const probe = await readProbe(page);
    expect(probe.feedback).toBeLessThan(FIRST_FEEDBACK_BOUND_MS);
    expect(probe.done).toBeLessThan(5_000);
    await expect(panel(page).getByRole('status')).toContainText('Loaded “Insufficient balance”');
    await expect(panel(page).locator('[data-dt-working]')).toHaveCount(0);
  });

  test('with simulated latency, a mutating button and the global bar show progress', async ({
    page,
  }) => {
    await openDevtools(page);
    await panel(page).getByRole('tab', { name: 'Env' }).click();
    const latency = panel(page).getByRole('spinbutton');
    await latency.fill('1500');
    await latency.press('Tab');
    await expect(panel(page).getByRole('status')).toContainText('Latency set to 1500 ms.');
    await panel(page).getByRole('button', { name: 'Close DevTools' }).click();

    await page
      .getByRole('navigation', { name: 'Quick actions' })
      .getByRole('link', { name: 'Payees' })
      .click();
    await page.getByRole('button', { name: 'Add payee' }).click();
    await page.getByLabel(/Full name/).fill('Robin Vale');
    await page.getByLabel(/Bank/).fill('Seabright Mutual');
    await page.getByLabel(/Last 4/).fill('4242');
    const save = page.getByRole('button', { name: 'Save payee' });
    await save.click();
    await expect(save).toHaveAttribute('aria-busy', 'true', { timeout: 500 });
    await expect(page.locator('[data-py-pending-bar]')).toBeVisible({ timeout: 1_000 });
    await expect(page.locator('[data-py-scroll-root]')).toHaveAttribute('aria-busy', 'true');
    // Settles: the payee exists, and every pending signal clears.
    await expect(page.getByText('Robin', { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-py-pending-bar]')).toHaveCount(0);
    await expect(page.locator('[data-py-scroll-root]')).not.toHaveAttribute('aria-busy', 'true');
  });
});

/** Turns on simulated latency through the runtime handle (standard builds have no DevTools). */
async function setLatency(page: Page, latencyMs: number) {
  await page.evaluate(
    (ms) =>
      (
        window as unknown as {
          __protoyard: { environment: { set(p: { latencyMs: number }): void } };
        }
      ).__protoyard.environment.set({ latencyMs: ms }),
    latencyMs
  );
}

test.describe('global pending bar on standard builds', () => {
  test('crm-demo: a slow create shows the bar inside the app and clears it', async ({ page }) => {
    test.skip(!PROTOTYPE_TARGETS.includes('crm-demo'), 'set PROTOYARD_E2E_PROTOTYPES');
    await page.goto(`${prototypeUrl('crm-demo')}?scenario=growing-team#/companies`);
    await waitForPrototypeReady(page, { slug: 'crm-demo' });
    await setLatency(page, 1500);
    await page.getByRole('button', { name: 'New company' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('Pending Probe Co');
    await dialog.getByLabel('Website domain').fill('probe.example');
    await dialog.getByLabel('Employees').fill('12');
    await dialog.getByRole('button', { name: 'Create company' }).click();
    await expect(page.locator('[data-py-pending-bar]')).toBeVisible({ timeout: 1_000 });
    await expect(page.locator('[data-py-scroll-root]')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('[data-py-pending-bar]')).toHaveCount(0, { timeout: 5_000 });
    await expect(page.getByText('Pending Probe Co').first()).toBeVisible();
  });

  test('helpdesk-demo: a slow create shows the bar and clears it', async ({ page }) => {
    test.skip(!PROTOTYPE_TARGETS.includes(HELPDESK_DEMO), 'set PROTOYARD_E2E_PROTOTYPES');
    await page.goto(`${prototypeUrl(HELPDESK_DEMO)}#/tickets`);
    await waitForPrototypeReady(page, { slug: HELPDESK_DEMO });
    await setLatency(page, 1500);
    await page.getByRole('button', { name: 'New' }).click();
    await page.getByRole('textbox', { name: 'Subject' }).fill('Pending probe ticket');
    await page.getByRole('textbox', { name: 'Customer', exact: true }).fill('customer_0001');
    const create = page.getByRole('button', { name: /^Create / });
    await create.click();
    await expect(page.locator('[data-py-pending-bar]')).toBeVisible({ timeout: 1_000 });
    await expect(page.locator('[data-py-pending-bar]')).toHaveCount(0, { timeout: 5_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Tickets' })).toBeVisible();
  });
});
