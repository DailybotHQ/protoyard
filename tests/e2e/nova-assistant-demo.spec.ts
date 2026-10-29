import { expect, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

const SLUG = 'nova-assistant-demo';
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

declare global {
  interface Window {
    __novaLongTasks?: number[];
  }
}

test.describe('Nova Assistant flagship', () => {
  test('saved-memory checkbox persists its disabled state', async ({ page }) => {
    await page.goto(`${prototypeUrl(SLUG)}#/settings`);
    await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', {
      timeout: 20_000,
    });
    const memory = page.getByRole('checkbox', { name: 'Use saved memory in simulated replies' });
    await expect(memory).toBeChecked();
    await memory.uncheck();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByRole('status')).toContainText(/saved|updated/i);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', {
      timeout: 20_000,
    });
    await expect(
      page.getByRole('checkbox', { name: 'Use saved memory in simulated replies' })
    ).not.toBeChecked();
  });

  test('streams, stops, and regenerates an assistant reply', async ({ page }, testInfo) => {
    await page.goto(`${prototypeUrl(SLUG)}?scenario=slow-model`);
    await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', {
      timeout: 20_000,
    });
    const thread = page.getByRole('log', { name: 'Conversation messages' });
    await expect(thread).toBeVisible();
    await expectAccessible(page, testInfo, { label: 'nova-assistant-workspace' });

    const prompt = 'Map a thoughtful launch plan for the research team.';
    await page.getByLabel('Message the simulated assistant').fill(prompt);
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(thread.getByText(prompt)).toBeVisible();
    await expect(thread.getByText('Writing…')).toBeVisible();
    await page.getByRole('button', { name: 'Stop response' }).click();
    await expect(thread.getByText('Writing…')).toHaveCount(0, { timeout: 15_000 });

    await page.getByRole('button', { name: 'Regenerate response' }).click();
    await expect(thread.getByText('Writing…')).toBeVisible();
    await expect(thread.getByText(/practical|starting point|manageable/i)).toBeVisible({
      timeout: 20_000,
    });
  });

  test('approves a local agent, uses voice captions, and expands the widget', async ({
    page,
  }, testInfo) => {
    await page.goto(`${prototypeUrl(SLUG)}?scenario=agent-approval`);
    await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', {
      timeout: 20_000,
    });
    const thread = page.getByRole('log', { name: 'Conversation messages' });
    // The model picker is a Texuli select: open the trigger, then choose the option.
    await page.getByRole('combobox', { name: 'Simulated model' }).click();
    await page.getByRole('option', { name: 'Orbit Agent · Simulated' }).click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByLabel('Message the simulated assistant').fill('Search the launch checklist.');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(thread.getByText(/simulated local search/i)).toBeVisible({ timeout: 20_000 });
    await expectAccessible(page, testInfo, { label: 'nova-agent-workspace' });

    await page.getByRole('button', { name: 'Voice' }).click();
    const voice = page.getByRole('region', { name: 'Simulated voice chat' });
    await expect(voice).toBeVisible();
    await expect(voice.getByText('Assistant · simulated caption')).toBeVisible();
    await page.getByRole('button', { name: 'Start push to talk' }).click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Finish and transcribe' }).click();
    await expect(voice.getByText('You said · simulated caption')).toBeVisible({ timeout: 10_000 });
    await expectAccessible(page, testInfo, { label: 'nova-voice-captions' });

    await page.getByRole('button', { name: 'Widget demo' }).click();
    const host = page.getByRole('region', { name: 'Nova widget demo' });
    await expect(host).toBeVisible();
    await host.getByRole('button', { name: 'Open simulated assistant' }).click();
    const widget = page.getByRole('dialog', { name: 'Simulated assistant' });
    await expect(widget).toBeVisible();
    // Audit the settled panel, not its 300 ms opacity/slide transition.
    const settled = () =>
      page.waitForFunction(() => {
        const panel = document.getElementById('ai-widget-panel');
        return (
          !!panel && getComputedStyle(panel).opacity === '1' && panel.getAnimations().length === 0
        );
      });
    await settled();
    await expectAccessible(page, testInfo, { label: 'nova-widget-sidebar' });
    await widget.getByRole('button', { name: 'Expand assistant to full screen' }).click();
    await expect(widget).toHaveAttribute('data-widget-fullscreen', 'true');
    await settled();
    await expectAccessible(page, testInfo, { label: 'nova-widget-fullscreen' });
  });

  test('keeps the 5,000-message conversation virtualized without long tasks', async ({ page }) => {
    await page.addInitScript(() => {
      window.__novaLongTasks = [];
      if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
        new PerformanceObserver((list) => {
          window.__novaLongTasks?.push(...list.getEntries().map((entry) => entry.duration));
        }).observe({ entryTypes: ['longtask'] });
      }
    });
    await page.goto(`${prototypeUrl(SLUG)}?scenario=long-history`);
    await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', {
      timeout: 30_000,
    });
    const thread = page.getByRole('log', { name: 'Conversation messages' });
    await expect(thread).toBeVisible();
    const renderedMessages = await thread.locator('article').count();
    expect(renderedMessages).toBeGreaterThan(0);
    expect(renderedMessages).toBeLessThan(30);
    await page.waitForTimeout(100);
    const longTasks = await page.evaluate(() => window.__novaLongTasks ?? []);
    expect(longTasks.filter((duration) => duration >= 50)).toEqual([]);
  });
});
