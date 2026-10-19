# Testing Guide

Protoyard tests **behavior**: does a deal persist across a reload, is a viewer
blocked in the service layer, does the same seed rebuild the same world? The
suite favors fast unit and integration tests on the real engine (with an
in-memory IndexedDB), plus a small set of browser end-to-end flows on real
static builds.

## Tools (verified versions)

| Tool | Version | Used for |
| --- | --- | --- |
| Vitest | 5.0.4 | Unit and integration tests in happy-dom, with `fake-indexeddb/auto` ([vitest.config.ts](../vitest.config.ts), [tests/setup/vitest.setup.ts](../tests/setup/vitest.setup.ts)) |
| @testing-library/svelte | 5.4 | Svelte component tests (`packages/ui`, `devtools`, `renderer-svelte`, prototypes) |
| Playwright | 1.64.0 | E2E on built artifacts ([playwright.config.ts](../playwright.config.ts), `tests/e2e/`) |
| Biome | 2.5.15 | Lint and format |
| tsc / svelte-check / astro check | TS 6.0.3 | Type checks per package |

## Commands

All commands run from the repository root. Labels: **full** runs everything;
**scoped** runs a subset.

| Purpose | Command | Kind |
| --- | --- | --- |
| Lint + format check | `pnpm lint` | full |
| Lint one area | `npx biome check packages/runtime` | scoped |
| Type check everything | `pnpm typecheck` | full |
| Type check one package | `pnpm --filter @protoyard/runtime typecheck` | scoped |
| Type check one prototype | `pnpm --filter @prototype/crm-demo typecheck` | scoped |
| All unit + integration tests | `pnpm test` | full |
| One package or prototype | `pnpm vitest run packages/runtime` | scoped |
| One file | `pnpm vitest run packages/core/tests/core.test.ts` | scoped |
| By test name | `pnpm vitest run -t "idempotent"` | scoped |
| Tests affected by changes | `pnpm vitest run --changed HEAD~1` | scoped (see blind spots) |
| E2E (gallery) | `pnpm test:e2e` | full |
| E2E incl. prototypes | `PROTOYARD_E2E_PROTOTYPES=crm-demo,mobile-banking-demo pnpm test:e2e` | full |
| One prototype end to end | `pnpm protoyard validate crm-demo --build` | scoped |
| Bundle size budgets (after build) | `pnpm protoyard budget --all --skip-build` | full |
| Index scale budget (1,000 manifests) | `pnpm bench:index --runs 3 --check` | full |
| Scenario generation budget | `pnpm protoyard scenario bench <slug> --check` | scoped |
| Cold-start bench (report; optional `--check`) | `pnpm exec tsx scripts/bench-cold-start.ts <slug…> --runs 3` | scoped |
| Publish batch | `pnpm vitest run packages/cli/tests/publish-batch.test.ts` | scoped |
| Publish ledger | `pnpm vitest run packages/cli/tests/publish-ledger.test.ts` | scoped |
| Review index | `pnpm vitest run packages/cli/tests/review-index.test.ts` | scoped |
| CI workflow init/check | `pnpm vitest run packages/cli/tests/ci-init.test.ts` | scoped |
| Affected-prototype selection | `pnpm vitest run packages/cli/tests/affected.test.ts` | scoped |
| Bundle budget command | `pnpm vitest run packages/cli/tests/budget-command.test.ts` | scoped |
| Scenario benchmark command | `pnpm vitest run packages/cli/tests/scenario-bench.test.ts` | scoped |
| Blueprint package | `pnpm vitest run packages/blueprint` | scoped |
| Blueprint schema / validation | `pnpm vitest run packages/blueprint/tests/schema.test.ts packages/blueprint/tests/validation.test.ts` | scoped |
| Generate, regenerate and `blueprint validate` | `pnpm vitest run packages/cli/tests/generate.test.ts packages/cli/tests/blueprint-validate.test.ts` | scoped |
| Spec command and extraction | `pnpm vitest run packages/cli/tests/spec-command.test.ts packages/cli/tests/spec-extract.test.ts` | scoped |
| Safe AI markdown | `pnpm vitest run packages/ai/tests/markdown.test.ts` | scoped |
| Generator flagship | `pnpm vitest run prototypes/helpdesk-demo` · `PROTOYARD_E2E_PROTOTYPES=helpdesk-demo pnpm test:e2e` | scoped |
| Pending feedback (runtime signal, global bar, Button loading, DevTools busy state) | `pnpm vitest run packages/runtime/tests/pending.test.ts packages/renderer-svelte/tests/pending.test.ts packages/ui/tests/button.test.ts packages/devtools/tests/panel.test.ts` · `PROTOYARD_E2E_PROTOTYPES=mobile-banking-demo,crm-demo,helpdesk-demo PROTOYARD_E2E_DEVTOOLS_PROTOTYPES=mobile-banking-demo pnpm test:e2e tests/e2e/pending-feedback.spec.ts` | scoped |
| Shell matrix (every shell framed on desktop with axe, full-bleed on Pixel 7) | `PROTOYARD_E2E_PROTOTYPES=mobile-banking-demo pnpm test:e2e tests/e2e/shell-layout.spec.ts` | scoped |
| Marketplace (unit + E2E) | `pnpm vitest run apps/gallery` · `pnpm test:e2e tests/e2e/marketplace.spec.ts` (`PROTOYARD_E2E_SHOWCASE=1` adds the bundled-demo Try it test) | scoped |
| Marketplace performance | `pnpm bench:index --marketplace --check` (needs `pnpm test:e2e:install`) | full |
| All current CLI tests (includes the rows above) | `pnpm vitest run packages/cli` | scoped |
| CI performance job (local mirror) | `pnpm protoyard build --all && pnpm protoyard budget --all --skip-build && pnpm bench:index --runs 3 --check` | full |
| Visual QA sweep (contact sheet, see below) | `pnpm visual:sweep --only crm-demo,mobile-banking-demo` | scoped |
| Visual sweep logic (matrix, flags, PNG decode, contact sheet) | `pnpm vitest run tests/scripts/visual-sweep.test.ts` | scoped |
| Thumbnails stay deterministic | `pnpm exec tsx scripts/generate-thumbnails.ts crm-demo --check` | scoped |

`protoyard spec <slug> --check` (or `spec --all --check`) is the drift check
for generated spec regions, and `validate` fails while a region is stale
([SPECS.md](SPECS.md)).

E2E specs wait for the app with `waitForPrototypeReady({ slug })` from
`tests/e2e/support/ready.ts`, not by polling `data-py-ready`;
`tests/e2e/viewport-fit.spec.ts` guards full-viewport layouts and the bottom
nav. `tests/e2e/layout-fit.spec.ts` runs over every prototype target at
1920×1080 and 390×844 on its densest scenario: a full-viewport app never
scrolls the document, every primary input (`[data-py-composer]` or a chat
`textarea`) is fully on screen, and the main scroll region really scrolls;
page-scrolling apps (AppShell dashboards) must scroll the document. Specs that
type with `fill()` cannot catch a composer below the fold, because Playwright
scrolls `overflow: hidden` ancestors for you. `tests/e2e/devtools-panel.spec.ts`
(with `PROTOYARD_E2E_SHOWCASE=1`, whose builds ship DevTools) opens and closes
the DevTools panel by its X, Escape and the Ctrl/⌘ + . shortcut, then reloads
and expects the launcher, at 2000×1030, 1440×900 and 390×844.

### CI performance job (`.github/workflows/ci.yml` → `perf`)

On every pull request and push to `main`, the **performance budgets** job
(timeout 20 minutes, same Node and SHA-pinned actions as the other jobs):

1. Builds every prototype (`pnpm protoyard build --all`).
2. Enforces bundle budgets from `protoyard.budgets.json`
   (`pnpm protoyard budget --all --skip-build`).
3. Enforces the 1,000-manifest index budget
   (`pnpm bench:index --runs 3 --check`, with the default `--ci-factor 3`).
4. Enforces scenario generation budgets for each indexed prototype’s default
   scenarios (`pnpm protoyard scenario bench <slug> --check`).
5. Runs the cold-start bench for every prototype and **reports** the numbers.
   Cold-start is **not a gate** yet (runner variance is unknown; gate after a
   calibration run).
6. Uploads JSON/text reports under `artifacts/perf/` and `tmp/bench-*.json` as
   the `perf-reports-<run_id>` artifact (14-day retention).

Repository settings are not changed by this workflow. Locally, run the mirror
row in the table above before opening a PR that touches budgets, the index, or
scenario generators.

Run `pnpm test:e2e:install` once on a new machine to install Chromium. E2E
targets are opt-in through environment variables:

| Variable | Effect | Ports |
| --- | --- | --- |
| `PROTOYARD_E2E_PROTOTYPES=crm-demo,mobile-banking-demo` | Build and serve the listed prototypes for prototype and viewport tests | One server per slug from `4401`, in list order |
| `PROTOYARD_E2E_SHOWCASE=1` | Include the combined gallery + prototype showcase | `4501`; `PROTOYARD_E2E_SHOWCASE_BASE=/path/` sets its public base |
| `PROTOYARD_E2E_DEVTOOLS_PROTOTYPES=mobile-banking-demo` | Also build the listed prototypes WITH DevTools into `tmp/e2e-devtools/<slug>` and serve them, for `tests/e2e/pending-feedback.spec.ts` (the standard builds stay DevTools-free) | One server per slug from `4451` (`PROTOYARD_E2E_DEVTOOLS_PORT_BASE` overrides it) |
| `PROTOYARD_E2E_REVIEW=1` | Run the review-index page against the checked-in fixture ledger, with no deploy | `4502`; `PROTOYARD_E2E_REVIEW_PORT` overrides the port |

The gallery uses port `4329`. The standalone CLI `review-index --serve`
defaults to `4520` (or the next free port); `--strict-port` makes a collision
an error. Example E2E invocations, including the review-index target, are in
[tests/e2e/README.md](../tests/e2e/README.md). Run **one E2E session per
machine at a time** because these web servers use fixed ports.

### Verified scoped runs (evidence, re-measured at the end of the foundation build, 2026-10-17)

| Command | Selected → result |
| --- | --- |
| `pnpm test` (full) | 63 files, 546 passed + 1 skipped (the opt-in benchmark) |
| `pnpm vitest run packages/runtime` | 2 files, 34 tests, all pass |
| `pnpm vitest run prototypes/crm-demo` | 3 files, 15 passed + 1 skipped (the benchmark) |
| `pnpm vitest run packages/core/tests/core.test.ts` | 1 file, 11 tests, all pass |
| `pnpm vitest run -t "idempotent"` | 2 tests selected (545 skipped), both pass |
| `pnpm vitest run packages/cli/tests/publish-batch.test.ts` | 1 file, 9 passed |
| `pnpm vitest run packages/cli/tests/publish-ledger.test.ts` | 1 file, 12 passed |
| `pnpm vitest run packages/cli/tests/review-index.test.ts` | 1 file, 14 passed |
| `pnpm vitest run packages/cli/tests/ci-init.test.ts` | 1 file, 15 passed |
| `pnpm vitest run packages/cli/tests/affected.test.ts` | 1 file, 14 passed |
| `pnpm vitest run packages/cli/tests/budget-command.test.ts` | 1 file, 3 passed |
| `pnpm vitest run packages/cli/tests/scenario-bench.test.ts` | 1 file, 2 passed |
| `pnpm vitest run packages/cli` | 20 files, 170 passed |

Counts grow with the suite. Re-run the command and check the selection rather
than trusting these numbers.

A command that exits 0 after selecting nothing is not evidence. Check the
`Tests` line.

## Where tests live (source → test mapping)

| Source | Tests | Layer |
| --- | --- | --- |
| `packages/<pkg>/src/**` | `packages/<pkg>/tests/*.test.ts` | unit / integration |
| `packages/runtime/src/**` | `packages/runtime/tests/runtime.test.ts`, which uses the fixture `tests/fixtures/tasks-prototype.ts` | integration on fake IndexedDB |
| `packages/cli/src/**` | `packages/cli/tests/*.test.ts` (temporary workspaces) | integration |
| `packages/cli/src/commands/publish.ts`, publish batch helpers | `publish.test.ts`, `publish-batch.test.ts` | integration; batch command row above |
| `packages/cli/src/lib/publish-ledger.ts` | `publish-ledger.test.ts`; ledger consumers in `publish-batch.test.ts` and `review-index.test.ts` | ledger persistence and consumers |
| `packages/cli/src/commands/review-index.ts` | `review-index.test.ts` + `tests/e2e/review-index.spec.ts` | CLI integration + opt-in browser E2E |
| `packages/cli/src/commands/ci.ts` | `ci-init.test.ts` | workflow init, drift and integrity checks |
| `packages/cli/src/commands/affected.ts`, `packages/cli/src/lib/affected.ts` | `affected.test.ts` | CLI integration |
| `packages/cli/src/commands/generate.ts`, `blueprint` command | `generate.test.ts`, `blueprint-validate.test.ts` | CLI integration (temporary workspaces) |
| `packages/blueprint/src/services.ts` | `packages/blueprint/tests/services.test.ts` (real runtime, fixture `tests/fixtures/blueprint-prototype.ts`); CSV paths in `csv-services.test.ts` | integration on fake IndexedDB |
| `packages/cli/src/commands/budget.ts` | `budget-command.test.ts` + `budgets.test.ts` | CLI integration; build budgets are also gated in CI |
| `packages/cli/src/commands/scenario.ts` (benchmark path) | `scenario-bench.test.ts` | CLI integration; CI checks each prototype's default scenarios |
| `packages/cli/src/commands/spec.ts`, spec extraction | `spec-command.test.ts`, `spec-extract.test.ts`; `pnpm protoyard spec --all --check` for the committed specs | CLI integration + drift check |
| `apps/gallery/src/**` | `apps/gallery/tests/*.test.ts` + `tests/e2e/gallery.spec.ts` | unit + E2E |
| `apps/gallery/src/components/marketplace/**`, `apps/gallery/src/pages/marketplace/**` | `pnpm vitest run apps/gallery` + `tests/e2e/marketplace.spec.ts` (`PROTOYARD_E2E_SHOWCASE=1` adds the bundled-demo Try it test); perf: `pnpm bench:index --marketplace --check` | unit + E2E + perf |
| `packages/renderer-svelte/src/shell/**`, viewport presets | `tests/e2e/shell-layout.spec.ts`, `tests/e2e/viewport-fit.spec.ts` | E2E (layout + axe) |
| `packages/charts/src/**` | `pnpm vitest run packages/charts` (scales, shapes, downsample, layouts, palette; `PROTOYARD_BENCH=1` adds the LTTB and min-max timings) | unit (Node) |
| `packages/charts-ui/src/**` | `pnpm vitest run packages/charts-ui` (happy-dom) + `pnpm vitest run packages/cli/tests/charts-bundle.test.ts` (real Vite build: no chart code in initial JS, size ceilings) + `tests/e2e/charts.spec.ts` (`PROTOYARD_E2E_PROTOTYPES=ui-kit`: axe, keyboard, table, dark, reduced motion, 10k Canvas, touch, resize) | unit + bundle guard + E2E |
| `packages/analytics/src/**` | `pnpm vitest run packages/analytics` (`PROTOYARD_BENCH=1` asserts the funnel and generation budgets) | unit (Node) |
| `packages/analytics-ui/src/**` | `pnpm vitest run packages/analytics-ui`; consumers `templates/analytics` and `prototypes/pebblestat-analytics-demo` | component (happy-dom) |
| Chart performance (any of the four packages above, or the ui-kit chart demos) | `pnpm protoyard build ui-kit && pnpm exec tsx scripts/bench-charts.ts --runs 3 --check` (Node LTTB, Chromium 10k render, hover p95, long tasks, subpath sizes; writes `tmp/bench-charts.json`) | perf gate |
| `prototypes/pebblestat-analytics-demo/**`, `templates/analytics/**` | their `tests/` + `pnpm protoyard scenario bench <slug> --check` (prototype only) + `pnpm protoyard budget <slug>` + `tests/e2e/pebblestat-analytics-demo.spec.ts` and `tests/e2e/layout-fit.spec.ts` (`PROTOYARD_E2E_PROTOTYPES=pebblestat-analytics-demo,analytics`) | unit + integration + bench + E2E |
| `prototypes/<slug>/src/scenarios/**` | `prototypes/<slug>/tests/generators.test.ts` (via `tests/support/generate-context.ts`) | unit |
| `prototypes/<slug>/src/domain/**` | `prototypes/<slug>/tests/services.test.ts` (via `tests/support/runtime.ts`, the **real runtime**) | integration |
| `prototypes/<slug>/src/**/*.svelte` | component tests in `prototypes/<slug>/tests/` where present + `tests/e2e/prototypes.spec.ts` | component + E2E |
| `templates/<name>/**` | `templates/<name>/tests/*.test.ts` | unit / integration |

**Rule of thumb:** a change in `X/src/...` runs `pnpm vitest run X`.

### Consumers and escalation

- **Core contracts** (`packages/core`) are consumed by every package,
  prototype and template. Changing them runs the full suite (`pnpm test`)
  and `pnpm typecheck`.
- **Engine packages** (`database`, `scenarios`, `runtime`) are consumed by
  `renderer-svelte`, `devtools` and every prototype's `services.test.ts`. Run
  `pnpm vitest run packages prototypes templates`.
- **UI, renderer and DevTools** are consumed by every prototype UI. Run their
  tests, then `svelte-check` on at least one prototype, then E2E.
- **Always run the full suite** after changes to `vitest.config.ts`,
  `tsconfig.base.json`, `biome.json`, `pnpm-workspace.yaml`,
  `package.json`/`pnpm-lock.yaml`, or `tests/setup/`/`tests/support/`.

### Blind spots

- `--changed` follows the import graph. It misses dynamic imports (DevTools
  are loaded with `import()`), JSON manifests (`protoyard.json`), CSS and
  Tailwind `@source` scanning, and template copies made by `protoyard new`.
- Unit tests run in happy-dom. Layout, real drag-and-drop, focus traps and
  media queries need E2E.
- Charts in happy-dom have no layout: tests stub `ResizeObserver` with a fixed
  width. Some behavior was only caught in the browser (`tests/e2e/charts.spec.ts`):
  a chart that did not shrink with its container, taps that did not select,
  and Canvas sizing.
- Generated worlds can change silently when Faker or the SDK upgrades. That is
  what the determinism tests and `generatorVersion` exist for.
- Provider deployments are not exercised by local tests or CI. Review-index
  E2E reads a fixture ledger; validate real Cloudflare, Netlify or Vercel
  behavior manually with authorized credentials and a dry run first.
- GitHub-hosted runner timing varies. Cold-start numbers are uploaded as
  reports, not a CI threshold, until a calibration run establishes a stable
  baseline.

**Fallback:** when unsure, run `pnpm lint && pnpm typecheck && pnpm test`.

## Testing posture

- **Unit-first, behavioral.** Test observable outcomes: rows written, errors
  thrown, worlds generated. Never test internal call sequences. Keep tests
  fast and deterministic: fixed seeds, the simulation clock, and instant
  `sleep` for the environment.
- **Real seams over mocks.** Services are tested on `createPrototypeRuntime`
  with a fresh in-memory IndexedDB per test. "Reload" means
  `harness.reload()`: close, then reopen on the same storage. Persistence,
  migrations, snapshot I/O, permissions and transactions are seams; a change
  to one adds an integration test.
- **Few, valuable E2E flows** on built static artifacts, in fresh browser
  contexts so no IndexedDB leaks between tests: gallery listing and search;
  CRM create/edit/delete/reload; persona switch; scenario load; theme;
  snapshot restore; banking transfer; standalone build isolation.
- **What every prototype must test:** generator determinism and integrity for
  every scenario; services for persistence across reload, permission denial,
  and offline failures that write nothing.

No coverage quotas or test-count targets. A behavior change comes with a test
that would have failed before it.

## Visual QA sweep

`scripts/visual-sweep.ts` screenshots prototypes in every applicable
combination and writes a contact sheet for a human to review. It complements
the E2E checks; it is not a gate.

```bash
pnpm visual:sweep --only crm-demo,mobile-banking-demo   # build, capture, write the sheet
pnpm visual:sweep --skip-build --out tmp/visual-sweep-after --compare tmp/visual-sweep
open tmp/visual-sweep/index.html
```

| Dimension | Values |
| --- | --- |
| Viewport | desktop 1440×900; phone 390×844 (mobile context) |
| Shell (desktop) | the manifest's `preview.shell`, then the platform's shells (`mobile`: auto, phone, tablet, none; `desktop`: auto, none, desktop-window, browser; `responsive`: auto, none, phone, desktop-window, browser), one per resolved picture (`auto` that resolves to `none` is not captured twice). `--shells a,b` replaces the list. |
| Shell (phone) | only the manifest's own shell: every frame is full-bleed at 390 px ([SHELLS.md](SHELLS.md)) |
| Layout | the manifest's `preview.layout` id and its `supported` list; `custom` (no `?layout=`) when it has none |
| Mode | light and dark (`?mode=` and the browser color scheme) |
| Theme | off by default; `--themes a,b` multiplies the matrix by `?theme=` per id; `--themes all` or a library collection switches to the theme review (below) |
| Scenario | the densest by name (`massive`, `scale`, `long-`, `multi-`, `power`, `busy`, `mature`, in that order), else the manifest default: the scenarios `layout-fit.spec.ts` uses |

Every shot opens `?devtools=0&scenario=…&shell=…&mode=…` in a fresh browser
context with the thumbnails' readiness wait (`scripts/lib/capture.ts`:
`data-py-ready`, fonts, network idle, a quiet DOM, reduced motion, UTC,
`en-US`). It then records:

- the axe violation count (WCAG 2.1 A and AA; `--no-axe` skips it);
- layout flags from the `layout-fit` rules that hold for every app:
  `input-off-screen` (a primary input outside the viewport that the page
  cannot scroll to), `region-does-not-scroll`, `page-overflow-stuck`;
- with `--compare <earlier sweep>`, the changed pixels per shot (both PNGs
  are decoded by `scripts/lib/png.ts`, no image dependency), `new` or
  `resized`.

**Theme review.** `--themes all` (every library theme) or a collection
(`industry`, `brand-like`, `high-contrast`, `colorblind-safe`, `seasonal`,
`mono`; entries combine with explicit ids, `--themes high-contrast,violet`)
captures one representative screen per target instead of the full matrix:
desktop, the first `--shells` entry or the manifest's shell, the manifest
layout, the densest scenario and `--route /path` (a hash route; the home
route otherwise), in every selected theme × light and dark, through
`?theme=<id>`. That is 2 × the number of library themes per target. A shot
whose page applied a different theme (the runtime's visible fallback for an
unknown id) is flagged `theme-fallback (<applied id>)`. The contact sheet's
theme filter narrows the review.

```bash
pnpm visual:sweep --only ui-kit --themes all --shells none              # 2 × 64 shots
pnpm visual:sweep --only crm-demo --themes high-contrast --route /settings --no-axe
```

The output goes to `tmp/visual-sweep/` (`--out` must be inside `tmp/`):
`index.html` (static, no external assets, light and dark, filters for every
dimension plus "problems only" and "changed only", lazy images), `sweep.json`
and `shots/`. A shot that fails to boot is listed with its error and the run
exits 1; flags and axe findings never fail it. `--templates` adds every
template demo, served from the showcase build (`pnpm build:showcase`, run
unless `--skip-build`). `--concurrency N` (default 2) sets parallel shots.

Measured 2026-10-19 on the lane-D machine (Apple M1 Max) under heavy
parallel load (load average about 150):

| Run | Shots | Time |
| --- | ---: | ---: |
| `--only mobile-banking-demo,crm-demo` (2 builds, axe on) | 18 | 51.4 s |
| `--only crm-demo --skip-build --no-axe --concurrency 3 --compare …` | 10 | 17.0 s, 0 changed pixels against the first run |

Without `--only`, today's 9 prototypes make 90 shots and `--templates` adds
166 for the 17 templates (counted from the manifests on 2026-10-19; layouts
and themes multiply these). A full run has not been timed yet.

## Proposed (not yet verified)

- Visual regression gating of the demos. The visual sweep above produces and diffs screenshots for review, but no baseline is committed and nothing fails on a pixel change.
- Per-package coverage thresholds. `pnpm test:coverage` runs (v8) but no
  floor is enforced.
