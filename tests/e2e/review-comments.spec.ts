import { type Browser, expect, type Locator, type Page, test } from '@playwright/test';
import { waitForPrototypeReady } from './support/ready.ts';
import { COMMENTS_TARGETS, commentsSharedUrl, commentsUrl } from './targets.ts';

/**
 * Review comments on real production builds made with PROTOYARD_REVIEW=1
 * (local adapter, no DevTools), served on their own ports
 * (PROTOYARD_E2E_COMMENTS_PROTOTYPES). Anchoring, frames, focus and capture
 * layers are what happy-dom cannot check. Every test gets a fresh browser
 * context and uses real mouse and keyboard input. Comment text is collected
 * with the review UI's prompts (name once per browser, then the comment).
 *
 * The "shared adapter" tests use the first target built with
 * PROTOYARD_REVIEW_ADAPTER=http and served with handleCommentsRequest
 * (tests/e2e/support/serve-comments.ts): two browser contexts are two reviewers.
 */
const CRM = 'crm-demo';
const BANK = 'mobile-banking-demo';
test.skip(
  !COMMENTS_TARGETS.includes(CRM) || !COMMENTS_TARGETS.includes(BANK),
  `set PROTOYARD_E2E_COMMENTS_PROTOTYPES=${CRM},${BANK}`
);

type Runtime = {
  scenarios: { load(id: string): Promise<unknown> };
  data: { rows(table: string, o?: { limit?: number }): Promise<Record<string, unknown>[]> };
};
declare global {
  interface Window {
    __protoyard?: Runtime;
  }
}

const SCENARIO: Record<string, string> = { [CRM]: 'growing-team', [BANK]: 'active-customer' };

async function open(page: Page, slug: string, path = '/', query = '', base = commentsUrl(slug)) {
  await page.goto(`${base}?scenario=${SCENARIO[slug]}${query ? `&${query}` : ''}#${path}`);
  await waitForPrototypeReady(page, { slug });
  await expect(launcher(page)).toBeVisible();
}

const launcher = (page: Page) =>
  page.getByRole('button', { name: /^Review: \d+ comment threads?/ });
const toolbar = (page: Page) => page.getByRole('navigation', { name: 'Prototype review toolbar' });
const pins = (page: Page) => page.locator('[data-py-review-pin][data-thread-id]');

/** Answers the review prompts: the reviewer's name (once per browser), then each comment. */
function reviewer(page: Page, name: string) {
  const state = { body: '' };
  page.on('dialog', (dialog) => {
    if (dialog.type() !== 'prompt') return void dialog.dismiss();
    if (dialog.message().startsWith('Name shown')) return void dialog.accept(name);
    if (state.body) return void dialog.accept(state.body);
    return void dialog.dismiss();
  });
  return state;
}

/** Opens the toolbar's actions (the launcher toggles, so only click it when collapsed). */
async function openToolbar(page: Page) {
  if ((await launcher(page).getAttribute('aria-expanded')) !== 'true') await launcher(page).click();
  await expect(launcher(page)).toHaveAttribute('aria-expanded', 'true');
}

async function startCommenting(page: Page) {
  await openToolbar(page);
  await toolbar(page).getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(page.locator('[data-py-review-capture]')).toBeVisible();
}

/** Clicks `target` at a fraction of its box in comment mode and returns that fraction. */
/** The thread count the launcher announces ("Review: 3 comment threads"). */
async function threadCount(page: Page): Promise<number> {
  const name = (await launcher(page).getAttribute('aria-label')) ?? '';
  return Number(/Review: (\d+)/.exec(name)?.[1] ?? Number.NaN);
}

/** Clicks `target` at a fraction of its box in comment mode and returns that fraction. */
async function placePin(
  page: Page,
  target: Locator,
  body: string,
  state: { body: string },
  fx = 0.3,
  fy = 0.5
) {
  const before = await threadCount(page);
  state.body = body;
  await startCommenting(page);
  const box = await target.boundingBox();
  if (!box) throw new Error('the target is visible');
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  // Counted by the toolbar: nearby pins may cluster into one count button.
  await expect.poll(() => threadCount(page)).toBe(before + 1);
  state.body = '';
  return { fx, fy };
}

/** The pin for `body` is centred on `target` at the stored fraction, within 4 px, inside its box. */
async function expectPinOn(
  page: Page,
  body: string,
  target: Locator,
  at: { fx: number; fy: number }
) {
  const handle = page.locator(`[data-py-review-pin][aria-label*="${body}"]`);
  await expect(handle).toHaveCount(1);
  await expect
    .poll(async () => {
      const [p, t] = await Promise.all([handle.boundingBox(), target.boundingBox()]);
      if (!p || !t) return 'missing';
      const cx = p.x + p.width / 2;
      const cy = p.y + p.height / 2;
      const ex = t.x + t.width * at.fx;
      const ey = t.y + t.height * at.fy;
      const insideBox =
        cx >= t.x - 1 && cx <= t.x + t.width + 1 && cy >= t.y - 1 && cy <= t.y + t.height + 1;
      return Math.abs(cx - ex) <= 4 && Math.abs(cy - ey) <= 4 && insideBox
        ? 'on element'
        : `off by ${Math.round(cx - ex)},${Math.round(cy - ey)}`;
    })
    .toBe('on element');
}

/** Waits one animation frame in the page. */
const frame = (page: Page) =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

test.describe('Review comments on PROTOYARD_REVIEW=1 builds', { tag: '@desktop' }, () => {
  test('comment mode blocks app clicks and Escape leaves it', async ({ page }) => {
    reviewer(page, 'Robin Reviewer');
    await open(page, CRM, '/');
    const link = page.locator('main a[href^="#/"]').first();
    await expect(link).toBeVisible();
    const before = page.url();
    await startCommenting(page);
    // The click lands on the capture layer: the app does not navigate (the prompt is dismissed).
    await link.click({ force: true });
    await frame(page);
    expect(page.url()).toBe(before);
    await expect(pins(page)).toHaveCount(0);

    await startCommenting(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-py-review-capture]')).toHaveCount(0);
    await expect(
      toolbar(page).getByRole('button', { name: 'Comment', exact: true })
    ).toHaveAttribute('aria-pressed', 'false');
    // Out of comment mode, the same link works.
    await link.click();
    await expect.poll(() => page.url()).not.toBe(before);
  });

  test('a full-bleed pin stays on its element after a resize, and persists across a reload', async ({
    page,
  }) => {
    const state = reviewer(page, 'Robin Reviewer');
    await open(page, CRM, '/companies');
    const heading = page.getByRole('heading', { name: 'Companies', level: 1 });
    const at = await placePin(page, heading, 'Rename to Accounts', state, 0.25, 0.5);
    await expectPinOn(page, 'Rename to Accounts', heading, at);

    const size = page.viewportSize() ?? { width: 1280, height: 720 };
    await page.setViewportSize({ width: Math.round(size.width * 0.8), height: size.height });
    await frame(page);
    // Re-resolved within one animation frame of the resize.
    await expectPinOn(page, 'Rename to Accounts', heading, at);

    await page.reload();
    await waitForPrototypeReady(page, { slug: CRM });
    await expect(launcher(page)).toHaveAccessibleName(/^Review: 1 comment thread/);
    await expectPinOn(page, 'Rename to Accounts', heading, at);
  });

  test('resolving hides the pin and reopening brings it back', async ({ page }) => {
    const state = reviewer(page, 'Robin Reviewer');
    await open(page, CRM, '/companies');
    const heading = page.getByRole('heading', { name: 'Companies', level: 1 });
    await placePin(page, heading, 'Tighten the copy', state);
    await page.locator('[data-py-review-pin][aria-label*="Tighten the copy"]').click();
    const thread = page.getByRole('region', { name: 'Comment thread' });
    await thread.getByRole('button', { name: 'Resolve thread' }).click();
    await expect(pins(page)).toHaveCount(0);
    await thread.getByRole('button', { name: 'Reopen thread' }).click();
    await expect(pins(page)).toHaveCount(1);
  });

  test('two reviewers share comments through the comments API', async ({ browser }) => {
    const slug = COMMENTS_TARGETS[0] as string;
    test.skip(slug !== CRM, 'the shared server builds the first target (crm-demo)');
    const body = `Shared note ${test.info().project.name} ${Date.now()}`;
    const a = await reviewerPage(browser, 'Alex A.');
    const b = await reviewerPage(browser, 'Blair B.');
    try {
      await open(a.page, CRM, '/companies', '', commentsSharedUrl());
      const heading = a.page.getByRole('heading', { name: 'Companies', level: 1 });
      // Each project comments at its own spot, so pins on the shared server never cluster.
      const fx = test.info().project.name === 'mobile' ? 0.8 : 0.2;
      await placePin(a.page, heading, body, a.state, fx, 0.5);
      await expect(launcher(a.page)).toHaveAccessibleName(/^Review: \d+ comment/);

      await open(b.page, CRM, '/companies', '', commentsSharedUrl());
      const pin = b.page.locator(`[data-py-review-pin][aria-label*="${body}"]`);
      await expect(pin).toHaveCount(1);
      await expect(pin).toHaveAttribute(
        'aria-label',
        new RegExp(`by Alex A\\.: ${body}, 0 replies`)
      );
      await pin.click();
      const thread = b.page.getByRole('region', { name: 'Comment thread' });
      await thread.getByLabel('Reply').fill('Agreed, from Blair');
      await thread.getByRole('button', { name: 'Send reply' }).click();
      await expect(thread.getByText('Agreed, from Blair')).toBeVisible();

      await a.page.reload();
      await waitForPrototypeReady(a.page, { slug: CRM });
      await expect(
        a.page.locator(`[data-py-review-pin][aria-label*="${body}, 1 reply"]`)
      ).toHaveCount(1);
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });
});

async function reviewerPage(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { context, page, state: reviewer(page, name) };
}
