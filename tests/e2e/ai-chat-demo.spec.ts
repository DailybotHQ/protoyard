import { expect, test } from '@playwright/test';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * Relay (ai-chat-demo) against its static build: a streamed agent reply renders
 * the safe Markdown subset as elements while markup in a message stays text, and
 * the simulated agent-outage scenario gives visible feedback and a working Retry.
 */
const SLUG = 'ai-chat-demo';
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

type Runtime = {
  overrides: { set(patch: { environment?: Record<string, unknown> }): Promise<void> };
};
declare global {
  interface Window {
    __protoyard?: Runtime;
  }
}

// Desktop layout: the Home pane with "Ask Atlas" is hidden at #/ on phones.
test.describe('Relay (static build)', { tag: '@desktop' }, () => {
  test('a streamed reply renders safe Markdown and markup in a message stays text', async ({
    page,
  }) => {
    await page.goto(prototypeUrl(SLUG));
    await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', {
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Ask Atlas' }).first().click();
    await expect(page).toHaveURL(/#\/c\/[^/]+$/);
    const probe = '<img src="x" data-e2e-probe onerror="alert(1)">';
    await page.getByRole('textbox', { name: 'Message' }).fill(`Draft the release notes ${probe}`);
    await page.getByRole('button', { name: 'Send message' }).click();

    // The agent reply streams in, then settles as sent.
    const reply = page.locator('[data-message-id][data-status]').last();
    await expect(reply).toHaveAttribute('data-status', 'sent', { timeout: 20_000 });
    await expect(reply.locator('strong')).toHaveText('Draft announcement');
    await expect(reply.locator('em').first()).toHaveText('playful');
    // Untrusted text is never parsed as HTML: the markup shows as text, no element exists.
    await expect(page.getByText(probe)).toBeVisible();
    await expect(page.locator('img[data-e2e-probe]')).toHaveCount(0);
  });

  test('flow 12: an agent outage shows a failed reply with Retry, which recovers', async ({
    page,
  }) => {
    await page.goto(`${prototypeUrl(SLUG)}?scenario=agent-outage`);
    await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', {
      timeout: 15_000,
    });
    await expect(
      page.getByRole('status').filter({ hasText: 'Agents are having trouble' })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Ask Atlas' }).first().click();
    await expect(page).toHaveURL(/#\/c\/[^/]+$/);
    await page
      .getByRole('textbox', { name: 'Message' })
      .fill('Summarize where the launch plan stands');
    await page.getByRole('button', { name: 'Send message' }).click();

    const failed = page.locator('[data-status="failed"]').last();
    await expect(failed).toContainText('Reply failed.', { timeout: 15_000 });
    await expect(failed).toContainText('simulated 500');

    // End the outage, then Retry the same reply.
    await page.evaluate(() =>
      window.__protoyard?.overrides.set({ environment: { failureMode: 'none' } })
    );
    const failedId = await failed.getAttribute('data-message-id');
    await failed.getByRole('button', { name: 'Retry' }).click();
    // Retry replaces the failed reply, so "no failed message" alone proves nothing:
    // wait for a NEW agent reply to finish streaming as sent.
    const replies = page.locator('[data-message-id][data-status]');
    await expect(replies.last()).toHaveAttribute('data-status', 'sent', { timeout: 20_000 });
    expect(await replies.last().getAttribute('data-message-id')).not.toBe(failedId);
    await expect(page.getByText('Reply failed.')).toHaveCount(0);
  });
});
