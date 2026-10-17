---
name: write-e2e
description: Write a Playwright end-to-end test for a Protoyard prototype or the gallery that runs against the real static build, in a fresh browser context, on desktop and mobile projects.
version: "1.0.0"
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Edit, Write
# === Documentation (ignored by harnesses, useful for humans) ===
tier: standard
intent: test
max-files: 2
---

# Skill: Write an E2E test

## Goal

Cover a user flow that unit tests cannot see — real layout, focus, IndexedDB
persistence across reloads, scenario links — on the production build served
the way users serve it.

## When to use

- A prototype's main flow (create → edit → reload → still there).
- Behavior that happy-dom cannot verify: drag and drop, focus traps, media
  queries, mobile viewport.

## How the harness works

- `playwright.config.ts` serves the gallery on port 4329 and, for each slug
  in `PROTOYARD_E2E_PROTOTYPES` (comma-separated), runs
  `pnpm protoyard build <slug>` then `pnpm protoyard preview <slug>` on port
  `4401 + index`.
- `tests/e2e/targets.ts` exposes `PROTOTYPE_TARGETS` and
  `prototypeUrl(slug)` with the same ordering.
- `tests/e2e/prototypes.spec.ts` already smoke-tests every target (boots,
  `html[data-py-ready="true"]`, no page errors, survives reload). Domain flows
  go in `tests/e2e/<slug>.spec.ts`.
- Two projects run every spec: `chromium` (Desktop Chrome) and `mobile`
  (Pixel 7). Each test gets a fresh context, so IndexedDB never leaks.

## Steps

1. **Create `tests/e2e/<slug>.spec.ts`.** The shape, shown with
   `crm-demo`'s real scenario and labels (from
   `prototypes/crm-demo/src/components/DealDialog.svelte`):
   ```ts
   import { expect, test } from '@playwright/test';
   import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

   const SLUG = 'crm-demo';

   test.describe(`${SLUG} flows`, () => {
     test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES=${SLUG}`);

     test('opens the new-deal form from the deals list', async ({ page }) => {
       await page.goto(`${prototypeUrl(SLUG)}?scenario=growing-team#/deals`);
       await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', { timeout: 15_000 });
       await page.getByRole('button', { name: 'New deal' }).click();
       const dialog = page.getByRole('dialog', { name: 'New deal' });
       await expect(dialog).toBeVisible();
       await dialog.getByLabel('Title').fill('Atlas expansion');
       // Fill the other required fields, submit with "Create deal", then
       // page.reload() and assert the deal is still listed.
     });
   });
   ```
   Use the target prototype's own scenario ids and accessible names.
2. **Pin the world** with a scenario link
   (`?scenario=<id>&actor=<persona-id>&seed=<n>&mode=dark`), never with
   timing assumptions.
3. **Locate by role, label and text** (`getByRole`, `getByLabel`), the same
   names a screen reader hears. Avoid CSS selectors except the
   `data-py-ready` readiness marker.
4. **Branch on viewport** only when the UI differs
   (`test.info().project.name === 'mobile'`): bottom navigation vs sidebar.
5. **Assert honesty paths** where they matter: a restricted persona cannot
   act (`?actor=<viewer-id>`), errors render as errors.

## Validation

```bash
pnpm test:e2e:install                                         # once per machine
PROTOYARD_E2E_PROTOTYPES=<slug> pnpm test:e2e tests/e2e/<slug>.spec.ts
```
Check that the run reports the expected test count for both projects;
skipped tests are not passes.

## Notes

- `tests/e2e/` is excluded from Vitest by `vitest.config.ts`.
- Specs read only the built artifact; they never import prototype source.
- `playwright.config.ts` and `tests/e2e/targets.ts` are shared; change them
  only with the owner's agreement.
