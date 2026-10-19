import { expect, type Locator, type Page, test } from '@playwright/test';
import { type LayoutId, layoutForWidth } from '@protoyard/core';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';
import { layoutMatrixTargets, prototypeUrl } from './targets.ts';

const targets = layoutMatrixTargets();
const modes = ['light', 'dark'] as const;
const viewports = [
  { name: 'desktop-1920x1080', size: { width: 1920, height: 1080 }, project: 'chromium' },
  { name: 'phone-390x844', size: { width: 390, height: 844 }, project: 'mobile' },
] as const;

const layoutMarkers: Partial<Record<LayoutId, string>> = {
  sidebar: '[data-py-layout="sidebar"]',
  rail: '[data-py-layout="rail"]',
  'top-nav': '[data-py-layout="top-nav"]',
  'dual-sidebar': '[data-py-layout="dual-sidebar"]',
  'master-detail': '[data-py-master-detail]',
  'dashboard-grid': '[data-py-dashboard-grid]',
  docs: '[data-py-docs-layout]',
  marketing: '[data-py-marketing-layout]',
  'mobile-tabs': '[data-py-layout="mobile-tabs"]',
  'mobile-drawer': '[data-py-layout="mobile-drawer"]',
  wizard: '[data-py-wizard-layout]',
  'auth-split': '[data-py-auth-split-layout]',
};

async function tabTo(page: Page, target: Locator): Promise<boolean> {
  await expect(target).toBeVisible();
  for (let index = 0; index < 80; index += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return true;
    await page.keyboard.press('Tab');
  }
  return false;
}

async function expectKeyboardNavigation(
  page: Page,
  navigation: 'layout-links' | 'relay-channels'
): Promise<void> {
  if (navigation === 'relay-channels') {
    const channelNav = page.getByRole('navigation', { name: 'Channels' });
    if (await channelNav.isVisible()) {
      const currentChannel = channelNav.locator('[aria-current="page"]');
      expect(await tabTo(page, currentChannel), 'channel navigation is reachable with Tab').toBe(
        true
      );
      return;
    }

    const showChannels = page.getByRole('button', { name: 'Back to channels' });
    expect(await tabTo(page, showChannels), 'channel navigation opener is reachable with Tab').toBe(
      true
    );
    await page.keyboard.press('Enter');
    await expect(channelNav).toBeVisible();
    await expect(channelNav.locator('[aria-current="page"]')).toBeFocused();
    return;
  }

  const opener = page.getByRole('button', { name: 'Open navigation' }).first();
  if (await opener.isVisible()) {
    expect(await tabTo(page, opener), 'navigation menu is reachable with Tab').toBe(true);
    await page.keyboard.press('Enter');
    const openedNavLinks = page.locator('nav:visible a:visible');
    await expect(openedNavLinks.first()).toBeVisible();
    expect(
      await tabTo(page, openedNavLinks.first()),
      'opened navigation links are reachable with Tab'
    ).toBe(true);
    return;
  }

  const navLinks = page.locator('nav:visible a:visible');
  if ((await navLinks.count()) > 0) {
    const firstNavLink = navLinks.first();
    expect(await tabTo(page, firstNavLink), 'navigation links are reachable with Tab').toBe(true);
    return;
  }

  // Content-first frames (marketing, wizard and auth split) navigate from the screen itself.
  const previewLink = page.getByRole('link', { name: 'Light preview' }).first();
  expect(await tabTo(page, previewLink), 'layout links are reachable with Tab').toBe(true);
}

async function expectNoClipping(page: Page, fit: 'document' | 'viewport') {
  const metrics = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    const before = root.scrollTop;
    window.scrollBy(0, 200);
    const documentScrolls = root.scrollTop !== before;
    root.scrollTop = before;
    return {
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      verticalOverflow: root.scrollHeight - window.innerHeight,
      documentScrolls,
    };
  });
  expect(metrics.horizontalOverflow, 'document has no horizontal overflow').toBeLessThanOrEqual(1);
  if (fit === 'viewport') {
    expect(
      metrics.verticalOverflow,
      'viewport layout keeps document height within the viewport'
    ).toBeLessThanOrEqual(1);
  } else if (metrics.verticalOverflow > 1) {
    expect(metrics.documentScrolls, 'overflowing document remains scrollable').toBe(true);
  }
}

test.describe('layout × viewport × color-mode matrix', () => {
  test.skip(
    targets.length === 0,
    'set PROTOYARD_E2E_PROTOTYPES to include atlas-workspace-demo and relay-chat-demo'
  );

  for (const viewport of viewports) {
    test.describe(viewport.name, () => {
      test.use({ viewport: viewport.size });

      for (const target of targets) {
        for (const layout of target.layouts) {
          for (const mode of modes) {
            test(`${target.slug} · ${layout} · ${mode}`, async ({ page }, testInfo) => {
              test.skip(
                testInfo.project.name !== viewport.project,
                `${viewport.name} project only`
              );

              const urlFor = (route: string) =>
                `${prototypeUrl(target.slug)}?scenario=${target.scenario}&layout=${layout}&mode=${mode}${route}`;
              await page.goto(urlFor(target.navigationRoute));
              await waitForPrototypeReady(page, { slug: target.slug });
              await expect(page.locator('html')).toHaveAttribute('data-py-mode', mode);
              await expectKeyboardNavigation(page, target.navigation);

              await page.goto(urlFor(target.primaryRoute));
              await waitForPrototypeReady(page, { slug: target.slug });
              const primaryInput = page.locator(target.primaryInput).first();
              await expect(primaryInput, 'primary input is visible').toBeVisible();
              const inputBox = await primaryInput.boundingBox();
              const viewportSize = page.viewportSize();
              expect(inputBox, 'primary input has a layout box').not.toBeNull();
              expect(viewportSize).not.toBeNull();
              if (inputBox && viewportSize) {
                expect(inputBox.x, 'input is inside the left viewport edge').toBeGreaterThanOrEqual(
                  -1
                );
                expect(inputBox.y, 'input is inside the top viewport edge').toBeGreaterThanOrEqual(
                  -1
                );
                expect(
                  inputBox.x + inputBox.width,
                  'input is inside the right viewport edge'
                ).toBeLessThanOrEqual(viewportSize.width + 1);
                expect(
                  inputBox.y + inputBox.height,
                  'input is inside the bottom viewport edge'
                ).toBeLessThanOrEqual(viewportSize.height + 1);
              }

              await expectNoClipping(page, target.fit);
              if (target.slug === 'atlas-workspace-demo') {
                const expected = layoutForWidth(layout as LayoutId, viewport.size.width);
                await expect(page.locator('[data-py-layout-host]')).toHaveAttribute(
                  'data-layout',
                  expected
                );
                const marker = layoutMarkers[expected];
                if (!marker) throw new Error(`Missing rendered marker for layout "${expected}"`);
                await expect(page.locator(marker)).toBeVisible();
              }

              await expectAccessible(page, testInfo, {
                label: `${target.slug}-${layout}-${viewport.name}-${mode}`,
              });
            });
          }
        }
      }
    });
  }
});
