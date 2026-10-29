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
  test.skip(
    process.env.PROTOYARD_E2E_DECK !== '1',
    'Opt-in: PROTOYARD_E2E_DECK=1 (or name a deck spec) starts the built deck server.'
  );
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

    // Blackout (the @texuli/slides stage's tool): a click dismisses it and returns focus to
    // the slide, so the arrows keep working (presenter follow-up).
    const stage = page.locator('[data-py-deck-app] > .tx-deck-stage');
    const blackout = page.locator('[data-tx-deck-blackout]');
    await stage.focus();
    await page.keyboard.press('b');
    await expect(blackout).toBeVisible();
    await blackout.click();
    await expect(blackout).toHaveCount(0);

    await expect
      .poll(async () => stage.evaluate((el) => el.contains(document.activeElement)))
      .toBe(true);

    const slideBefore = await page.locator('[data-py-deck-app]').getAttribute('data-slide-id');
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => page.locator('[data-py-deck-app]').getAttribute('data-slide-id'))
      .not.toBe(slideBefore);

    // Laser toggle should leave the deck focused for the next key.
    const laser = page.locator('[data-tx-deck-tool="laser"]');
    await page.keyboard.press('l');
    await expect(laser).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-py-deck-app]').click({ position: { x: 20, y: 20 } });
    await expect
      .poll(async () => stage.evaluate((el) => el.contains(document.activeElement)))
      .toBe(true);
    await page.keyboard.press('l');
    await expect(laser).toHaveAttribute('aria-pressed', 'false');

    await expectAccessible(page, testInfo, {
      include: '[data-py-deck-app]',
      label: 'deck-after-blackout',
    });
  });

  test('presenter split shows fallback reason and timer pause/reset', async ({ page }) => {
    // The stage's presenter view sits beside the slides: a desktop-sized window.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addInitScript(() => {
      window.open = () => null;
    });
    await page.goto(`${deckUrl}#/cover/0`);
    await page.locator('[data-py-deck-app] > .tx-deck-stage').focus();
    await page.keyboard.press('s');
    const view = page.getByRole('group', { name: 'Presenter view' });
    await expect(view).toBeVisible();
    await expect(page.locator('[data-py-deck-app]')).toHaveAttribute('data-presenter', 'true');
    await view.getByRole('button', { name: 'Open presenter window', exact: true }).click();
    const reason = view.locator('[data-tx-deck-presenter-reason="popup-blocked"]');
    await expect(reason).toBeVisible();
    await expect(reason).toContainText(/blocked the presenter window/i);

    const elapsed = view.locator('[data-tx-deck-timer="elapsed"]');
    await view.getByRole('button', { name: 'Pause timers', exact: true }).click();
    await expect(view.getByRole('button', { name: 'Start timers', exact: true })).toBeVisible();
    const paused = await elapsed.textContent();
    await page.waitForTimeout(1_200);
    expect(await elapsed.textContent()).toBe(paused);
    await view.getByRole('button', { name: 'Reset timers', exact: true }).click();
    await expect(elapsed).toHaveText('0:00');
  });
});
