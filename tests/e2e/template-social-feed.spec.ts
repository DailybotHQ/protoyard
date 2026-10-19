import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * The social-feed template against its STATIC production build (served by
 * `protoyard preview`, DevTools excluded). Each test gets a fresh browser
 * context, so a fresh IndexedDB. Everything is asserted through the UI.
 */
const SLUG = 'social-feed';
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

async function openApp(page: Page, hash = '#/', scenario = 'active') {
  await page.goto(`${prototypeUrl(SLUG)}?scenario=${scenario}${hash}`);
  await waitForPrototypeReady(page, { slug: SLUG });
}
const feed = (page: Page) => page.getByRole('feed');

test.describe('Social feed template (static build)', () => {
  test('a post appears at the top, renders as plain text and survives a reload', async ({
    page,
  }, testInfo) => {
    await openApp(page);
    await expect(feed(page)).toBeVisible();
    const text = `E2E post <b>not bold</b> ${testInfo.project.name}`;
    await page.locator('[data-py-composer]').fill(text);
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    const first = feed(page).locator('article[data-post]').first();
    await expect(first).toContainText(text);
    // Markup in text stays text: no <b> element is created.
    await expect(first.locator('b')).toHaveCount(0);
    await expect(page.locator('[data-py-composer]')).toHaveValue('');
    await expectAccessible(page, testInfo, { include: '#main-content', label: 'feed' });

    await page.reload();
    await waitForPrototypeReady(page, { slug: SLUG });
    await expect(feed(page).locator('article[data-post]').first()).toContainText(text);
  });

  test('reactions toggle with counts and a comment raises the comment count', async ({ page }) => {
    await openApp(page);
    const post = feed(page).locator('article[data-post]').first();
    const like = post.getByRole('button', { name: /Like/ });
    const before = Number((await like.textContent())?.match(/\d+/)?.[0] ?? 0);
    const wasPressed = (await like.getAttribute('aria-pressed')) === 'true';
    await like.click();
    await expect(like).toHaveAttribute('aria-pressed', wasPressed ? 'false' : 'true');
    await expect(like).toContainText(String(before + (wasPressed ? -1 : 1)));

    const comments = post.getByRole('button', { name: /comments/ });
    const count = Number((await comments.textContent())?.match(/\d+/)?.[0] ?? 0);
    await comments.click();
    await post.getByLabel('Write a comment').fill('Lovely, from E2E');
    await post.getByRole('button', { name: 'Reply' }).click();
    await expect(post.getByRole('region', { name: 'Comments' })).toContainText('Lovely, from E2E');
    await expect(comments).toContainText(String(count + 1));
  });

  test('the massive feed renders only the rows on screen', async ({ page }) => {
    await openApp(page, '#/', 'massive');
    await page
      .getByRole('group', { name: 'Timeline' })
      .getByRole('button', { name: 'Everyone' })
      .click();
    const list = feed(page);
    await expect(list).toHaveAttribute('data-feed-count', /^\d{4,}$/);
    expect(Number(await list.getAttribute('data-feed-count'))).toBeGreaterThanOrEqual(5000);
    const rendered = () => list.locator('article[data-post]').count();
    expect(await rendered()).toBeLessThan(60);
    const firstId = await list.locator('article[data-post]').first().getAttribute('data-post');
    await list.evaluate((el) => el.scrollBy(0, 40_000));
    await expect
      .poll(async () => list.locator('article[data-post]').first().getAttribute('data-post'))
      .not.toBe(firstId);
    expect(await rendered()).toBeLessThan(60);
  });

  test('a viewer reads without a composer or reactions', async ({ page }, testInfo) => {
    await openApp(page, '#/', 'viewer');
    await expect(feed(page)).toBeVisible();
    await expect(page.locator('[data-py-composer]')).toHaveCount(0);
    await expect(page.getByRole('note').filter({ hasText: 'reading as a viewer' })).toBeVisible();
    await expect(
      feed(page).locator('article[data-post]').first().getByRole('button', { name: /Like/ })
    ).toBeDisabled();
    await expectAccessible(page, testInfo, { include: '#main-content', label: 'viewer-feed' });
  });

  test('notifications can be marked read', async ({ page }, testInfo) => {
    await openApp(page, '#/notifications');
    const markAll = page.getByRole('button', { name: 'Mark all read' });
    await expect(markAll).toBeVisible();
    await markAll.click();
    await expect(markAll).toHaveCount(0);
    await expect(page.getByText('(unread)')).toHaveCount(0);
    await expectAccessible(page, testInfo, { include: '#main-content', label: 'notifications' });
  });
});
