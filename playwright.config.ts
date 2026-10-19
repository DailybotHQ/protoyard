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
 * Review index: PROTOYARD_E2E_REVIEW=1 renders `protoyard review-index` from
 * the fixture ledger tests/e2e/fixtures/publish-ledger.jsonl (no network, no
 * deploy) and serves it on port 4502 (PROTOYARD_E2E_REVIEW_PORT overrides it).
 *
 * Prototype targets: PROTOYARD_E2E_PROTOTYPES=crm-demo,mobile-banking-demo
 * (each gets its own port from 4401 and is reachable in specs through
 * `prototypeUrl(slug)` in tests/e2e/targets.ts).
 *
 * DevTools targets: PROTOYARD_E2E_DEVTOOLS_PROTOTYPES=mobile-banking-demo builds
 * each slug WITH the DevTools panel into tmp/e2e-devtools/<slug> (the standard
 * build stays DevTools-free) and serves it from port 4451
 * (PROTOYARD_E2E_DEVTOOLS_PORT_BASE overrides it); specs use
 * `devtoolsPrototypeUrl(slug)`.
 */

const GALLERY_PORT = 4329;
// Both values end up in shell webServer commands: accept only safe shapes.
const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const prototypes = (process.env.PROTOYARD_E2E_PROTOTYPES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
for (const slug of prototypes) {
  if (!SLUG.test(slug)) throw new Error(`PROTOYARD_E2E_PROTOTYPES: invalid slug "${slug}"`);
}
const devtoolsPrototypes = (process.env.PROTOYARD_E2E_DEVTOOLS_PROTOTYPES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
for (const slug of devtoolsPrototypes) {
  if (!SLUG.test(slug)) {
    throw new Error(`PROTOYARD_E2E_DEVTOOLS_PROTOTYPES: invalid slug "${slug}"`);
  }
}
const DEVTOOLS_PORT_BASE = Number(process.env.PROTOYARD_E2E_DEVTOOLS_PORT_BASE ?? 4451);
if (!Number.isInteger(DEVTOOLS_PORT_BASE) || DEVTOOLS_PORT_BASE < 1024) {
  throw new Error('PROTOYARD_E2E_DEVTOOLS_PORT_BASE must be a port number');
}
const ci = Boolean(process.env.CI);
/** PROTOYARD_E2E_SHOWCASE=1 builds `protoyard showcase` and runs tests/e2e/showcase.spec.ts. */
const showcase = process.env.PROTOYARD_E2E_SHOWCASE === '1';
/** Public base of the showcase site, e.g. `/protoyard/` for a GitHub Pages project path. */
const showcaseBase = process.env.PROTOYARD_E2E_SHOWCASE_BASE ?? '/';
if (!/^\/(?:[a-z0-9._-]+\/)*$/i.test(showcaseBase)) {
  throw new Error(`PROTOYARD_E2E_SHOWCASE_BASE must look like /path/ (got "${showcaseBase}")`);
}
export const SHOWCASE_PORT = 4501;
/** PROTOYARD_E2E_REVIEW=1 serves the review index built from the fixture ledger. */
const review = process.env.PROTOYARD_E2E_REVIEW === '1';
const REVIEW_PORT = Number(process.env.PROTOYARD_E2E_REVIEW_PORT ?? 4502);
if (!Number.isInteger(REVIEW_PORT) || REVIEW_PORT < 1024 || REVIEW_PORT > 65535) {
  throw new Error(
    `PROTOYARD_E2E_REVIEW_PORT must be a port number (got "${process.env.PROTOYARD_E2E_REVIEW_PORT}")`
  );
}

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
    ...(review
      ? [
          {
            command: `pnpm protoyard review-index --ledger tests/e2e/fixtures/publish-ledger.jsonl --out artifacts/e2e-review --serve --port ${REVIEW_PORT} --strict-port`,
            url: `http://127.0.0.1:${REVIEW_PORT}/`,
            reuseExistingServer: !ci,
            timeout: 180_000,
          },
        ]
      : []),
    ...devtoolsPrototypes.map((slug, i) => ({
      command: `pnpm protoyard build ${slug} --include-devtools --out tmp/e2e-devtools/${slug} && pnpm exec tsx tests/e2e/support/serve-static.ts tmp/e2e-devtools/${slug} ${DEVTOOLS_PORT_BASE + i}`,
      url: `http://127.0.0.1:${DEVTOOLS_PORT_BASE + i}/`,
      reuseExistingServer: !ci,
      timeout: 180_000,
    })),
    ...prototypes.map((slug, i) => ({
      command: `pnpm protoyard build ${slug} && pnpm protoyard preview ${slug} --port ${4401 + i} --strict-port`,
      url: `http://127.0.0.1:${4401 + i}/`,
      reuseExistingServer: !ci,
      timeout: 180_000,
    })),
  ],
});
