import type { Locator, Page } from '@playwright/test';

/** Select an accessible option from either a native select or a Texuli listbox. */
export async function chooseOption(page: Page, control: Locator, label: string): Promise<void> {
  const tagName = await control.evaluate((element) => element.tagName);
  if (tagName === 'SELECT') {
    await control.selectOption({ label });
    return;
  }

  await control.click();
  await page.getByRole('option', { name: label, exact: true }).click();
}
