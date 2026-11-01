import { expect, type Page, test } from '@playwright/test';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * Saved doc edits (PLAN_008 decision D3) in a built doc prototype (the `doc`
 * template): an edit applied in the editor is saved to the kind runtime's
 * docEdits store, survives a reload, and "Reset to the original" clears it.
 */
const SLUG = 'doc';
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

const MARK = 'Edited in the browser test.';

async function open(page: Page) {
  await page.goto(prototypeUrl(SLUG));
  await waitForPrototypeReady(page, { slug: SLUG });
  await expect(page.locator('[data-py-doc-app]')).toBeVisible();
  await expect(page.locator('[data-py-doc-edit]')).toBeVisible();
}

test('an applied doc edit survives a reload, and Reset clears it', { tag: '@desktop' }, async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  const article = page.getByRole('main', { name: 'Document content' });
  await expect(article.getByText(MARK)).toHaveCount(0);

  await page.locator('[data-py-doc-edit]').click();
  const editor = page.locator('[data-py-doc-editor]');
  await expect(editor).toBeVisible({ timeout: 15_000 });
  // The summary callout's body (the report's first paragraph): replace its text.
  const paragraph = editor.getByRole('textbox', { name: 'Paragraph' }).first();
  await paragraph.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(MARK);
  await expect(paragraph).toHaveText(MARK);
  await editor.locator('[data-py-doc-editor-apply]').click();
  await expect(editor).toHaveCount(0);
  await expect(article.getByText(MARK, { exact: false })).toBeVisible();

  await page.reload();
  await waitForPrototypeReady(page, { slug: SLUG });
  await expect(article.getByText(MARK, { exact: false })).toBeVisible();

  await page.locator('[data-py-doc-reset]').click();
  await expect(article.getByText(MARK, { exact: false })).toHaveCount(0);
  await page.reload();
  await waitForPrototypeReady(page, { slug: SLUG });
  await expect(page.locator('[data-py-doc-app]')).toBeVisible();
  await expect(article.getByText(MARK, { exact: false })).toHaveCount(0);
  await expect(page.locator('[data-py-doc-reset]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
