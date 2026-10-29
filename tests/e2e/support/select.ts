import type { Locator, Page } from '@playwright/test';

/** Select an accessible option from either a native select or a Texuli listbox. */
export async function chooseOption(
  page: Page,
  control: Locator,
  label: string | RegExp
): Promise<void> {
  const tagName = await control.evaluate((element) => element.tagName);
  if (tagName === 'SELECT') {
    if (typeof label === 'string') await control.selectOption({ label });
    else {
      const value = await control
        .locator('option')
        .evaluateAll(
          (options, source) =>
            options
              .find((option) => new RegExp(source).test(option.textContent ?? ''))
              ?.getAttribute('value') ?? '',
          label.source
        );
      await control.selectOption(value);
    }
    return;
  }

  await control.click();
  await page
    .getByRole('option', typeof label === 'string' ? { name: label, exact: true } : { name: label })
    .click();
}
