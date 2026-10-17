import { expect, test } from '@playwright/test';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * Relay (ai-chat-demo) against its static build: the simulated agent-outage
 * scenario gives visible feedback and a working Retry once the outage ends.
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

test.describe('Relay (static build)', () => {
  test('flow 12: an agent outage shows a failed reply with Retry, which recovers', async ({
    page,
    isMobile,
  }) => {
    // The Home pane with "Ask Atlas" is hidden at #/ on narrow layouts.
    test.skip(isMobile, 'desktop layout: the Home pane is hidden on phones at #/');
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
