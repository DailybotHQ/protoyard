import { expect, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

const SLUG = 'relay-chat-demo';
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

test.describe('Relay Chat flagship', () => {
  test('posts, reacts, threads, asks Relay, summarizes, and opens a huddle', async ({
    page,
    isMobile,
  }, testInfo) => {
    test.skip(isMobile, 'desktop layout: sidebar + composer journey');
    await page.goto(`${prototypeUrl(SLUG)}?scenario=busy-day`);
    await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', {
      timeout: 20_000,
    });

    const messages = page.getByRole('log', { name: 'Messages' });
    await expect(messages).toBeVisible();
    await expectAccessible(page, testInfo, { label: 'relay-chat-main' });

    // Post
    const prompt = 'Ship the demo path this week.';
    await page.getByLabel('Message composer').fill(prompt);
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(messages.getByText(prompt)).toBeVisible();

    // React on the message we just posted
    const article = messages.locator('[data-message-id]').filter({ hasText: prompt }).last();
    await article.getByRole('button', { name: 'React with thumbs up' }).click();

    // Thread reply
    await article.getByRole('button', { name: 'Reply in thread' }).click();
    await expect(page.getByRole('status', { name: 'Thread open' })).toBeVisible();
    await page.getByLabel('Message composer').fill('Thread: keep the checklist tight.');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(messages.getByText('Thread: keep the checklist tight.')).toBeVisible();
    await page.getByRole('button', { name: 'Close thread' }).click();

    // Mention AI teammate
    await page.getByLabel('Message composer').fill('@relay what should we prioritize?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(messages.locator('[data-author-id="bot_relay"]').last()).toBeVisible({
      timeout: 15_000,
    });
    await expect(messages.locator('[data-author-id="bot_relay"]').last()).toContainText(/simulated|priorit|launch|demo/i);

    // /summarize
    await page.getByLabel('Message composer').fill('/summarize');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(messages.getByText(/Relay summary \(simulated\)/i)).toBeVisible({
      timeout: 15_000,
    });
    await expectAccessible(page, testInfo, { label: 'relay-chat-after-ai' });

    // Huddle
    await page.getByRole('button', { name: 'Start huddle' }).click();
    const huddle = page.getByRole('region', { name: 'Simulated huddle' });
    await expect(huddle).toBeVisible();
    await expect(huddle.getByText(/captions|simulated/i)).toBeVisible();
    await expectAccessible(page, testInfo, { label: 'relay-chat-huddle' });
    await page.getByRole('button', { name: 'Leave huddle' }).click();
  });
});
