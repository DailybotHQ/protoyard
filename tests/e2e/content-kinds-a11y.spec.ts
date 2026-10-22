import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';

/**
 * Accessibility of every content-kind example (blueprints/decks, pages, docs)
 * on the built player's kind pages (deck.html, page.html, doc.html), in light
 * and dark color schemes with reduced motion, on the desktop and Pixel 7
 * projects. Each example runs axe (WCAG 2.1 A/AA, serious and critical fail;
 * every deck slide is checked) and asserts accessible navigation, form labels,
 * image alternatives, a visible keyboard focus and no horizontal overflow.
 *
 * Needs the built player (PROTOYARD_E2E_PLAYER=1; the player server on
 * PROTOYARD_E2E_PLAYER_PORT, default 4861). Each blueprint is served to the
 * player's `?src=` by request interception, so no file is copied and large
 * decks need no share link. Automated checks do not establish visual quality:
 * the visual sweep screenshots remain the review for that (docs/ACCESSIBILITY.md).
 */

test.skip(
  process.env.PROTOYARD_E2E_PLAYER !== '1',
  'set PROTOYARD_E2E_PLAYER=1 (needs the built player server)'
);

const PLAYER = `http://127.0.0.1:${Number(process.env.PROTOYARD_E2E_PLAYER_PORT ?? 4861)}/`;
const ROOT = { deck: '[data-py-deck-app]', page: '[data-py-page-app]', doc: '[data-py-doc-app]' };
type Kind = keyof typeof ROOT;

/** Every example in blueprints/{decks,pages,docs}/ (README files aside). */
const EXAMPLES = (['deck', 'page', 'doc'] as const).flatMap((kind) => {
  const dir = join(process.cwd(), 'blueprints', `${kind}s`);
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ kind, name: file.replace(/\.json$/, ''), path: join(dir, file) }));
});

async function openExample(page: Page, example: (typeof EXAMPLES)[number]): Promise<void> {
  const fixture = `${PLAYER}kind-fixtures/${example.name}.json`;
  await page.route(fixture, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: readFileSync(example.path, 'utf8'),
    })
  );
  // DevTools off: this checks the document a viewer sees, not the authoring panel.
  await page.goto(
    `${PLAYER}${example.kind}.html?devtools=0&src=./kind-fixtures/${example.name}.json`
  );
  await expect(page.locator(ROOT[example.kind])).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', { timeout: 30_000 });
}

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(0);
}

/** Every visible form control has an accessible name (a label, aria-label or labelledby). */
async function expectLabelledControls(page: Page, label: string): Promise<void> {
  const controls = page.locator(
    'input:not([type="hidden"]):visible, select:visible, textarea:visible'
  );
  for (let i = 0; i < (await controls.count()); i++) {
    await expect(controls.nth(i), `${label}: form control ${i} needs a label`).toHaveAccessibleName(
      /\S/
    );
  }
}

/** Every image has an alternative: alt text, or alt="" / aria-hidden when decorative. */
async function expectImageAlternatives(page: Page, label: string): Promise<void> {
  const missing = await page.evaluate(() =>
    [...document.querySelectorAll('img, [role="img"]')]
      .filter((node) => {
        const element = node as HTMLElement;
        if (element.closest('[aria-hidden="true"]')) return false;
        if (element.tagName === 'IMG') return !element.hasAttribute('alt');
        return !(element.getAttribute('aria-label') || element.getAttribute('aria-labelledby'));
      })
      .map((node) => (node as HTMLElement).outerHTML.slice(0, 120))
  );
  expect(missing, `${label}: images without an alternative`).toEqual([]);
}

/** Tab moves focus to something inside the document, and the focus is drawn. */
async function expectVisibleFocus(page: Page, label: string, scope: string): Promise<void> {
  await page.locator('body').focus();
  let found = false;
  for (let i = 0; i < 15 && !found; i++) {
    await page.keyboard.press('Tab');
    found = await page.evaluate(
      (selector) => document.activeElement?.closest(selector) !== null,
      scope
    );
  }
  expect(found, `${label}: Tab reaches the document`).toBe(true);
  const ring = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement;
    const style = getComputedStyle(element);
    const outline = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
    const shadow = style.boxShadow !== 'none' && style.boxShadow !== '';
    return {
      drawn: outline || shadow,
      what: `${element.tagName.toLowerCase()}${element.getAttribute('aria-label') ? ` "${element.getAttribute('aria-label')}"` : ''}`,
    };
  });
  expect(ring.drawn, `${label}: focus on ${ring.what} has no visible outline or ring`).toBe(true);
}

/** Runs the shared checks on what is on screen now. */
async function checkScreen(page: Page, testInfo: TestInfo, label: string): Promise<void> {
  await expectAccessible(page, testInfo, { label });
  await expectNoHorizontalOverflow(page, label);
  await expectImageAlternatives(page, label);
  await expectLabelledControls(page, label);
}

async function checkDeck(page: Page, testInfo: TestInfo, label: string): Promise<void> {
  const deck = page.locator(ROOT.deck);
  // The deck is a labelled keyboard application, and every slide is announced.
  await expect(deck).toHaveAttribute('role', 'application');
  await expect(deck).toHaveAccessibleName(/\S/);
  await expectVisibleFocus(page, label, ROOT.deck);
  await deck.focus();
  const seen = new Set<string>();
  for (let guard = 0; guard < 400; guard++) {
    const at = `${await deck.getAttribute('data-slide-id')}/${await deck.getAttribute('data-slide-step')}`;
    if (seen.has(at)) break;
    seen.add(at);
    // Every slide (its first step) is checked; later steps reveal more of the same slide.
    if (at.endsWith('/0')) await checkScreen(page, testInfo, `${label} ${at}`);
    await page.keyboard.press('ArrowRight');
    // The last step of the last slide stays put; the loop ends when nothing changes.
    await page.waitForTimeout(50);
  }
  expect(seen.size, `${label}: keyboard navigation moves through the deck`).toBeGreaterThan(1);
  await expect(
    page
      .locator('[aria-live]')
      .filter({ hasText: /Slide \d+ of \d+/ })
      .first()
  ).toBeAttached();
}

async function checkPage(page: Page, testInfo: TestInfo, label: string, kind: Kind): Promise<void> {
  await checkScreen(page, testInfo, label);
  const root = page.locator(ROOT[kind]);
  // A document has one top-level heading and named landmarks to move between.
  await expect(root.getByRole('heading', { level: 1 })).toHaveCount(1);
  const navigation = page.getByRole('navigation');
  if (kind === 'doc') {
    // On narrow screens the table of contents folds into a disclosure: its
    // summary is reachable, and opening it shows the named navigation.
    const shown = await expect(navigation.first())
      .toBeVisible({ timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    if (!shown) {
      const summary = page.locator(`${ROOT.doc} details:has(nav) > summary`).first();
      await expect(summary, `${label}: table of contents disclosure`).toBeVisible();
      await summary.click();
    }
    await expect(navigation.first(), `${label}: table of contents`).toBeVisible();
  }
  for (let i = 0; i < (await navigation.count()); i++) {
    if (!(await navigation.nth(i).isVisible())) continue;
    await expect(navigation.nth(i), `${label}: navigation ${i} needs a name`).toHaveAccessibleName(
      /\S/
    );
    const links = navigation.nth(i).getByRole('link');
    for (let j = 0; j < (await links.count()); j++) {
      await expect(links.nth(j)).toHaveAccessibleName(/\S/);
    }
  }
  await expectVisibleFocus(page, label, ROOT[kind]);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`content kinds in ${colorScheme} mode with reduced motion`, () => {
    test.use({ colorScheme, reducedMotion: 'reduce' });

    for (const example of EXAMPLES) {
      test(`${example.kind} ${example.name}`, async ({ page }, testInfo) => {
        test.setTimeout(example.kind === 'deck' ? 180_000 : 90_000);
        const failures: string[] = [];
        page.on('pageerror', (error) => failures.push(error.message));
        await openExample(page, example);
        // The player follows the system scheme and the reduced-motion preference.
        await expect(page.locator('html')).toHaveAttribute('data-py-mode', colorScheme);
        expect(
          await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
        ).toBe(true);
        const label = `${example.kind} ${example.name} (${colorScheme}, ${testInfo.project.name})`;
        if (example.kind === 'deck') await checkDeck(page, testInfo, label);
        else await checkPage(page, testInfo, label, example.kind);
        expect(failures, `${label}: page errors`).toEqual([]);
      });
    }
  });
}

// Two catalog block examples rendered wrong in the everything deck before
// T-a11y-mobile: the quiz showed `**tone**` literally and a card dropped its
// image. The player ships the avatar library, so the card's portrait loads here.
test('the everything deck formats the quiz prompt and shows the card image', async ({ page }) => {
  const everything = EXAMPLES.find((example) => example.name === 'everything');
  expect(everything).toBeDefined();
  if (!everything) return;
  await openExample(page, everything);
  const deck = page.locator(ROOT.deck);
  const show = async (id: string) => {
    await page.evaluate((slide) => {
      window.location.hash = `#/${slide}/0`;
    }, id);
    await expect(deck).toHaveAttribute('data-slide-id', id);
  };

  await show('poll-quiz');
  const legend = page.locator('[data-py-deck-slide="poll-quiz"] legend', { hasText: 'tone' });
  await expect(legend).toHaveText('What does a tone replace?', { timeout: 15_000 });
  await expect(legend.locator('strong')).toHaveText('tone');

  await show('structure-b');
  const image = page
    .locator('[data-py-deck-slide="structure-b"]')
    .getByRole('img', { name: 'A face' });
  await expect(image).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
});
