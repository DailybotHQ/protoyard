import { expect, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import {
  assertCaughtInert,
  assertNoUnexpectedDead,
  probeControl,
  runInteractionSweep,
  takeSnapshot,
} from './support/interaction-sweep.ts';

/**
 * Dead-control interaction sweep (SITE_QA).
 *
 * 1. Static fixture with a live toggle, a deliberately inert button, a hash
 *    link and a display-only block.
 * 2. Built catalog deck: quiz answer is live; bare advance still works after
 *    blackout dismiss (focus restore).
 *
 * Server: playwright.config starts the deck fixture when this file is named.
 * Interaction fixture is served from the deck preview root's sibling path via
 * the same Vite preview host when PROTOYARD_E2E_INTERACTION=1, or inline via
 * page.setContent for the static half.
 */

const deckPort = Number(process.env.PROTOYARD_E2E_DECK_PORT ?? 4891);
const deckUrl = `http://127.0.0.1:${deckPort}/`;

test.describe('interaction sweep fixture', () => {
  test('catches an inert button and accepts live controls', async ({ page }, testInfo) => {
    const html = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./fixtures/interaction-sweep/index.html', import.meta.url), 'utf8')
    );
    await page.setContent(html, { waitUntil: 'domcontentloaded' });

    const report = await runInteractionSweep(page, {
      probes: [
        {
          name: 'live-control',
          selector: '[data-testid="live-control"]',
          expectLive: true,
        },
        {
          name: 'dead-control',
          selector: '[data-testid="dead-control"]',
          expectDead: true,
        },
        {
          name: 'hash-link',
          selector: '#hash-link',
          expectLive: true,
        },
      ],
    });

    assertCaughtInert(report, 'dead-control');
    const live = report.findings.find((f) => f.name === 'live-control');
    expect(live?.outcome, JSON.stringify(report.findings)).toBe('changed');
    const link = report.findings.find((f) => f.name === 'hash-link');
    expect(link?.outcome, JSON.stringify(report.findings)).toBe('changed');
    assertNoUnexpectedDead(report);

    // Display-only block is not a button/link — discovery would skip it.
    await expect(page.getByTestId('display-block')).toBeVisible();
    await expectAccessible(page, testInfo, { label: 'interaction-fixture' });
  });

  test('keyboard activation counts as a live change', async ({ page }) => {
    const html = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./fixtures/interaction-sweep/index.html', import.meta.url), 'utf8')
    );
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const finding = await probeControl(page, {
      name: 'live-control-keyboard',
      selector: '[data-testid="live-control"]',
      expectLive: true,
      kind: 'keyboard',
    });
    expect(finding.outcome).toBe('changed');
    await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'on');
  });
});

test.describe('deck controls and focus restore', () => {
  test('quiz control is live and blackout dismiss restores deck keyboard focus', async ({
    page,
  }, testInfo) => {
    await page.goto(`${deckUrl}#/quiz/0`);
    await expect(page.locator('[data-py-deck-app]')).toHaveAttribute('data-slide-id', 'quiz');

    const before = await takeSnapshot(page);
    const answer = page.getByRole('button', { name: 'Placeholder series for layout' });
    await answer.click();
    await expect(answer).toHaveAttribute('aria-pressed', 'true');
    const after = await takeSnapshot(page);
    expect(after.markers !== before.markers || after.bodyText !== before.bodyText).toBe(true);

    // Blackout click must return focus so arrows keep working (presenter follow-up).
    await page.locator('[data-py-deck-app]').focus();
    await page.keyboard.press('b');
    await expect(page.locator('[data-py-deck-blackout]')).toBeVisible();
    await page.locator('[data-py-deck-blackout]').click();
    await expect(page.locator('[data-py-deck-blackout]')).toHaveCount(0);

    await expect
      .poll(async () =>
        page.locator('[data-py-deck-app]').evaluate((el) => document.activeElement === el)
      )
      .toBe(true);

    const slideBefore = await page.locator('[data-py-deck-app]').getAttribute('data-slide-id');
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => page.locator('[data-py-deck-app]').getAttribute('data-slide-id'))
      .not.toBe(slideBefore);

    // Laser toggle should leave the root focusable for the next key.
    await page.keyboard.press('l');
    await expect(page.locator('[data-py-deck-app]')).toHaveAttribute('data-laser', 'true');
    await page.locator('[data-py-deck-app]').click({ position: { x: 20, y: 20 } });
    await expect
      .poll(async () =>
        page
          .locator('[data-py-deck-app]')
          .evaluate((el) => document.activeElement === el || el.contains(document.activeElement))
      )
      .toBe(true);
    await page.keyboard.press('l');
    await expect(page.locator('[data-py-deck-app]')).not.toHaveAttribute('data-laser', 'true');

    await expectAccessible(page, testInfo, {
      include: '[data-py-deck-app]',
      label: 'deck-after-blackout',
    });
  });

  test('presenter split shows fallback reason and timer pause/reset', async ({ page }) => {
    await page.addInitScript(() => {
      window.open = () => null;
    });
    await page.goto(`${deckUrl}#/cover/0`);
    await page.locator('[data-py-deck-app]').focus();
    await page.keyboard.press('s');
    await expect(page.getByRole('dialog', { name: 'Presenter view' })).toBeVisible();
    await expect(page.locator('[data-py-presenter-fallback-reason]')).toBeVisible();
    await expect(page.locator('[data-py-presenter-fallback-reason]')).toContainText(
      /popup was blocked/i
    );

    const elapsed = page.locator('[data-py-presenter-elapsed]');
    const first = await elapsed.textContent();
    await page.locator('[data-py-presenter-timer-pause]').click();
    await expect(page.locator('[data-py-presenter-timer-pause]')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await page.waitForTimeout(400);
    const paused = await elapsed.textContent();
    expect(paused).toBe(first);
    await page.locator('[data-py-presenter-timer-reset]').click();
    await expect(elapsed).toHaveText('00:00');
  });
});
