import { expect, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';
import { prototypeUrl } from './targets.ts';

const layouts = [
  'sidebar',
  'rail',
  'top-nav',
  'dual-sidebar',
  'master-detail',
  'dashboard-grid',
  'docs',
  'marketing',
  'wizard',
  'auth-split',
] as const;
const modes = ['light', 'dark'] as const;

test.describe('Atlas layout and theme gallery', () => {
  test.skip(!process.env.PROTOYARD_E2E_PROTOTYPES?.split(',').includes('atlas-workspace-demo'));
  test.use({ viewport: { width: 1920, height: 1080 } });

  for (const mode of modes) {
    for (const layout of layouts) {
      test(`${layout} fits and is accessible in ${mode} mode`, async ({ page }, testInfo) => {
        const route =
          layout === 'auth-split' ? '/access' : layout === 'wizard' ? '/onboarding' : '/playbook';
        await page.goto(
          `${prototypeUrl('atlas-workspace-demo')}?layout=${layout}&mode=${mode}&theme=aurora-analytics&scenario=active#${route}`
        );
        await waitForPrototypeReady(page, { slug: 'atlas-workspace-demo' });
        if (layout === 'auth-split')
          await expect(page.getByRole('heading', { name: 'Welcome to Atlas' })).toBeVisible();
        if (layout === 'wizard')
          await expect(page.getByRole('heading', { name: 'Workspace tour' })).toBeVisible();

        const host = page.locator('[data-py-layout-host]');
        await expect(host).toHaveAttribute('data-layout', layout);
        const fit = await page.evaluate(() => {
          const frame = document.querySelector<HTMLElement>('[data-py-layout-host]');
          const rect = frame?.getBoundingClientRect();
          return {
            horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
            frameLeft: rect?.left ?? -1,
            frameRight: rect?.right ?? window.innerWidth + 1,
          };
        });
        expect(
          fit.horizontalOverflow,
          `${layout} has horizontal page overflow`
        ).toBeLessThanOrEqual(1);
        expect(fit.frameLeft, `${layout} starts outside the viewport`).toBeGreaterThanOrEqual(-1);
        expect(fit.frameRight, `${layout} ends outside the viewport`).toBeLessThanOrEqual(1921);
        await expectAccessible(page, testInfo, { label: `atlas-${layout}-${mode}` });
      });
    }
  }
});
