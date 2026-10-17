import { defineConfig, devices } from '@playwright/test';

/**
 * E2E harness. Every target is a REAL static build served the way users serve
 * it: the gallery via `astro preview`, prototypes via `protoyard preview`
 * (artifacts/<slug>/dist). Each test gets a fresh browser context, so
 * IndexedDB and localStorage never leak between tests.
 *
 * Showcase: PROTOYARD_E2E_SHOWCASE=1 also builds and serves the one-site
 * showcase on port 4501 (gallery + bundled prototype builds).
 *
 * Prototype targets: PROTOYARD_E2E_PROTOTYPES=crm-demo,mobile-banking-demo
 * (each gets its own port from 4401 and is reachable in specs through
 * `prototypeUrl(slug)` in tests/e2e/targets.ts).
 */

const GALLERY_PORT = 4329;
const prototypes = (process.env.PROTOYARD_E2E_PROTOTYPES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const ci = Boolean(process.env.CI);
/** PROTOYARD_E2E_SHOWCASE=1 builds `protoyard showcase` and runs tests/e2e/showcase.spec.ts. */
const showcase = process.env.PROTOYARD_E2E_SHOWCASE === '1';
/** Public base of the showcase site, e.g. `/protoyard/` for a GitHub Pages project path. */
const showcaseBase = process.env.PROTOYARD_E2E_SHOWCASE_BASE ?? '/';
export const SHOWCASE_PORT = 4501;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  workers: ci ? 2 : undefined,
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: `http://127.0.0.1:${GALLERY_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Chromium with a phone viewport + touch: CI only installs Chromium.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: `pnpm protoyard index --quiet && pnpm --filter @protoyard/gallery exec astro build && pnpm --filter @protoyard/gallery exec astro preview --ignore-lock --host 127.0.0.1 --port ${GALLERY_PORT}`,
      url: `http://127.0.0.1:${GALLERY_PORT}/`,
      reuseExistingServer: !ci,
      timeout: 180_000,
    },
    ...(showcase
      ? [
          {
            command: `pnpm protoyard showcase --base ${showcaseBase} --serve --port ${SHOWCASE_PORT} --strict-port`,
            url: `http://127.0.0.1:${SHOWCASE_PORT}${showcaseBase}`,
            reuseExistingServer: !ci,
            timeout: 600_000,
          },
        ]
      : []),
    ...prototypes.map((slug, i) => ({
      command: `pnpm protoyard build ${slug} && pnpm protoyard preview ${slug} --port ${4401 + i} --strict-port`,
      url: `http://127.0.0.1:${4401 + i}/`,
      reuseExistingServer: !ci,
      timeout: 180_000,
    })),
  ],
});
