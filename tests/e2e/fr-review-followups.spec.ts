import { expect, test } from '@playwright/test';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

const SLUG = 'ui-kit';
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

test('Theme Lab mode choices remain quiet until selected and expose their pressed state', async ({
  page,
}) => {
  await page.goto(`${prototypeUrl(SLUG)}#/themes`);
  await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', {
    timeout: 15_000,
  });

  const modeGroup = page.getByRole('group', { name: 'Token mode' });
  const light = modeGroup.getByRole('button', { name: 'light' });
  const dark = modeGroup.getByRole('button', { name: 'dark' });
  await expect(light).toHaveAttribute('aria-pressed', 'true');
  await expect(dark).toHaveAttribute('aria-pressed', 'false');

  const idleBackground = await dark.evaluate((button) => getComputedStyle(button).backgroundColor);
  expect(idleBackground).toBe('rgba(0, 0, 0, 0)');

  await dark.click();
  await expect(dark).toHaveAttribute('aria-pressed', 'true');
  await expect(light).toHaveAttribute('aria-pressed', 'false');
  await expect(dark).not.toHaveCSS('background-color', idleBackground);
});
