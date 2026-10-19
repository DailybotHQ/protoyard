import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

const SLUG = 'relay-chat-demo';
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

/**
 * The composer must be fully visible without scrolling. `fill()` would scroll it into
 * view for us (even inside `overflow: hidden`), so measure its box against the viewport.
 */
async function expectOnScreen(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box, 'element has a layout box').not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) return;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.5);
}

test.describe('Relay Chat flagship', () => {
  test('posts, reacts, threads, asks Relay, summarizes, and opens a huddle', async ({
    page,
    isMobile,
  }, testInfo) => {
    // Long multi-step journey (post → react → thread → AI → summarize → huddle + axe).
    test.setTimeout(90_000);
    await page.goto(`${prototypeUrl(SLUG)}?scenario=busy-day`);
    await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', {
      timeout: 20_000,
    });

    const messages = page.getByRole('log', { name: 'Messages' });
    await expect(messages).toBeVisible();
    await expectAccessible(page, testInfo, { label: 'relay-chat-main' });

    const composer = page.getByLabel('Message composer');
    await expectOnScreen(page, composer);

    if (isMobile) {
      // Phones: the channel list is its own screen, reached with the header's back button.
      await expect(page.getByRole('navigation', { name: 'Channels' })).toBeHidden();
      const channelName = (await page.getByRole('heading', { level: 1 }).textContent())?.trim();
      await page.getByRole('button', { name: 'Back to channels' }).click();
      const nav = page.getByRole('navigation', { name: 'Channels' });
      await expect(nav).toBeVisible();
      await expect(messages).toBeHidden();
      const current = nav.locator('[aria-current="page"]');
      await expect(current).toBeFocused();
      await expectAccessible(page, testInfo, { label: 'relay-chat-phone-channels' });
      await current.click();
      await expect(messages).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(channelName ?? '');
      await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
      await expectOnScreen(page, composer);
    }
    const send = async (text: string) => {
      await composer.fill(text);
      // Prefer keyboard submit: avoids flaky clicks when layout is still settling.
      await composer.press('Enter');
    };

    // Post
    const prompt = 'Ship the demo path this week.';
    await send(prompt);
    await expect(messages.getByText(prompt, { exact: true })).toBeVisible({ timeout: 15_000 });

    // React on the message we just posted
    const article = messages.locator('[data-message-id]').filter({ hasText: prompt }).last();
    await expect(article).toBeVisible();
    await article.getByRole('button', { name: 'React with thumbs up' }).click();

    // Thread reply
    await article.getByRole('button', { name: 'Reply in thread' }).click();
    await expect(page.getByRole('status', { name: 'Thread open' })).toBeVisible();
    await send('Thread: keep the checklist tight.');
    await expect(messages.getByText('Thread: keep the checklist tight.')).toBeVisible({
      timeout: 15_000,
    });
    await expectOnScreen(page, composer);
    await page.getByRole('button', { name: 'Close thread' }).click();
    // Focus returns to the message's "Reply in thread" button.
    await expect(article.getByRole('button', { name: 'Reply in thread' })).toBeFocused();

    // Mention AI teammate — assert body text so a scenario bot row + badge cannot fake a pass.
    await send('@relay what should we prioritize?');
    const relayReply = messages
      .locator('[data-author-id="bot_relay"]')
      .filter({
        has: page.locator('[data-message-body]'),
      })
      .last();
    await expect(relayReply.locator('[data-message-body]')).toBeVisible({ timeout: 15_000 });
    await expect(relayReply.locator('[data-message-body]')).toContainText(
      /simulated|priorit|launch|demo|checklist|ship/i,
      { timeout: 15_000 }
    );

    // /summarize
    await send('/summarize');
    await expect(
      messages.locator('[data-message-body]').filter({ hasText: /Relay summary \(simulated\)/i })
    ).toBeVisible({ timeout: 15_000 });
    await expectAccessible(page, testInfo, { label: 'relay-chat-after-ai' });

    // Huddle (phones reach it through "More actions")
    if (isMobile) {
      const more = page.getByRole('button', { name: 'More actions' });
      await more.click();
      await expect(more).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('group', { name: 'More actions' })).toBeVisible();
      await expectAccessible(page, testInfo, { label: 'relay-chat-phone-tools' });
    }
    await page.getByRole('button', { name: 'Start huddle' }).click();
    const huddle = page.getByRole('region', { name: 'Simulated huddle' });
    await expect(huddle).toBeVisible();
    await expect(huddle.getByText('Huddle (simulated)')).toBeVisible();
    await expect(huddle.locator('[data-huddle-captions]')).toBeVisible();
    await expectAccessible(page, testInfo, { label: 'relay-chat-huddle' });
    await page.getByRole('button', { name: 'Leave huddle' }).click();
    await expectOnScreen(page, composer);
  });
});
