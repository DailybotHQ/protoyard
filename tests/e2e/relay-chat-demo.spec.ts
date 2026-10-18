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
    // Long multi-step journey (post → react → thread → AI → summarize → huddle + axe).
    test.setTimeout(90_000);
    test.skip(isMobile, 'desktop layout: sidebar + composer journey');
    await page.goto(`${prototypeUrl(SLUG)}?scenario=busy-day`);
    await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', {
      timeout: 20_000,
    });

    const messages = page.getByRole('log', { name: 'Messages' });
    await expect(messages).toBeVisible();
    await expectAccessible(page, testInfo, { label: 'relay-chat-main' });

    const composer = page.getByLabel('Message composer');
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
    await page.getByRole('button', { name: 'Close thread' }).click();

    // Mention AI teammate — assert body text so a scenario bot row + badge cannot fake a pass.
    await send('@relay what should we prioritize?');
    const relayReply = messages.locator('[data-author-id="bot_relay"]').filter({
      has: page.locator('[data-message-body]'),
    }).last();
    await expect(relayReply.locator('[data-message-body]')).toBeVisible({ timeout: 15_000 });
    await expect(relayReply.locator('[data-message-body]')).toContainText(
      /simulated|priorit|launch|demo|checklist|ship/i,
      { timeout: 15_000 },
    );

    // /summarize
    await send('/summarize');
    await expect(
      messages.locator('[data-message-body]').filter({ hasText: /Relay summary \(simulated\)/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expectAccessible(page, testInfo, { label: 'relay-chat-after-ai' });

    // Huddle
    await page.getByRole('button', { name: 'Start huddle' }).click();
    const huddle = page.getByRole('region', { name: 'Simulated huddle' });
    await expect(huddle).toBeVisible();
    await expect(huddle.getByText('Huddle (simulated)')).toBeVisible();
    await expect(huddle.locator('[data-huddle-captions]')).toBeVisible();
    await expectAccessible(page, testInfo, { label: 'relay-chat-huddle' });
    await page.getByRole('button', { name: 'Leave huddle' }).click();
  });
});
