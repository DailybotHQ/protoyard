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
| All tests, fewer workers (a loaded machine; same tests) | `PROTOYARD_TEST_WORKERS=4 pnpm test` | full |
| Wall-clock budgets, serialized (run on a quiet machine) | `pnpm test:perf` (`PROTOYARD_PERF=1`; today the code tokenizer's 50 ms per 20 KB pathological input) | perf |
| One package or prototype | `pnpm vitest run packages/runtime` | scoped |
| One file | `pnpm vitest run packages/core/tests/core.test.ts` | scoped |
| By test name | `pnpm vitest run -t "idempotent"` | scoped |
| Tests affected by changes | `pnpm vitest run --changed HEAD~1` | scoped (see blind spots) |
| E2E (gallery) | `pnpm test:e2e` | full |
| E2E incl. prototypes | `PROTOYARD_E2E_PROTOTYPES=crm-demo,mobile-banking-demo pnpm test:e2e` | full |
| Player sources, share links, embed, reload persistence and namespace isolation (desktop + Pixel 7) | `PROTOYARD_E2E_PLAYER=1 pnpm exec playwright test tests/e2e/player.spec.ts` | scoped |
| Hosted player: app/deck/page/doc share links, kind-specific ready state, deck navigation and reload at root and base path; paste/share, scenario and persona switch, mutation, axe | `PROTOYARD_E2E_SHOWCASE=1 pnpm exec playwright test tests/e2e/showcase.spec.ts` (run with `PROTOYARD_E2E_SHOWCASE_BASE=/` and `/protoyard/`) | scoped |
| Deck navigation on the built catalog fixture (hash/steps, keyboard, guarded clicks, overview, fullscreen, swipe, reduced motion; desktop + Pixel 7) | `PROTOYARD_E2E_DECK=1 pnpm exec playwright test tests/e2e/deck-navigation.spec.ts` (port `PROTOYARD_E2E_DECK_PORT`, default 4891) | scoped |
| Deck presenter, presenting tools and print (popup sync, blocked-popup and no-BroadcastChannel fallback, notes, clock-driven timers, blackout, laser, `?print=1`, PDF one page per slide; desktop + Pixel 7) | `PROTOYARD_E2E_DECK=1 pnpm exec playwright test tests/e2e/deck-presenter.spec.ts` (same deck port) | scoped |
| Deck chrome controls (full screen enter and leave, print, visible feedback, Debug for agents under `?debug=1`, tooltips and the registry toolbar; desktop + Pixel 7) | `PROTOYARD_E2E_DECK=1 pnpm exec playwright test tests/e2e/deck-controls.spec.ts` (same deck port; the flag is required, naming the spec does not start the server) | scoped |
| The everything reference deck: every slide of `blueprints/decks/everything.json` under axe, light and dark, desktop + Pixel 7, every step walked, no console error | `PROTOYARD_E2E_DECK=1 pnpm exec playwright test tests/e2e/deck-everything.spec.ts` (same deck port; the flag is required) | scoped |
| Claude artifact harness: packed app (`artifact-pack.spec.ts`) and packed deck (`deck-artifact.spec.ts`) in an isolated iframe viewer | `pnpm exec playwright test tests/e2e/artifact-pack.spec.ts tests/e2e/deck-artifact.spec.ts` (self-started harness; packs `relay-chat-demo` and `create-anything-deck`) | scoped |
| Quick loop: brief → quick → serve → ready (axe), per-variant persistence and isolation, compare.html namespaces, a review comment → review/comments.json and REVIEW.md, quick iterate live reload with rows kept, a validation task → quick report, quick shot or its recorded skip (desktop + Pixel 7) | `PROTOYARD_E2E_QUICK=1 pnpm exec playwright test tests/e2e/quick.spec.ts` (ports `PROTOYARD_E2E_QUICK_PORT`, 4878, and the next; rebuilds the player once, `PROTOYARD_E2E_QUICK_PLAYER=prebuilt` skips it) | scoped |
| Public guides: every allowlisted guide has a source, every link and anchor resolves; with `--built`, every /docs/ route and the search index; with `--sitemap`, every sitemap `<loc>` is a built page | `pnpm exec tsx scripts/check-public-docs.ts [--built apps/gallery/dist] [--sitemap artifacts/showcase]` (after `pnpm build:showcase`: `--built artifacts/showcase --sitemap artifacts/showcase`, which also refuses a noindex page in the sitemap) | scoped |
| /docs/ on the served gallery: search combobox (index fetched on first use, arrow keys, Enter, Escape) and axe on /docs/ and every guide page | `pnpm test:e2e tests/e2e/docs.spec.ts` | scoped |
| One prototype end to end | `pnpm protoyard validate crm-demo --build` | scoped |
| Bundle size budgets (after build) | `pnpm protoyard budget --all --skip-build` | full |
| Player app entry budget (dist suite; skipped without a build) | `pnpm --filter @protoyard/player build && pnpm vitest run packages/player/tests/budget.test.ts` | scoped |
| Player per-kind entry budgets (`index`/`deck`/`page`/`doc.html`; content-kind graph exclusions; skipped without a build) | `pnpm --filter @protoyard/player build && pnpm vitest run packages/player/tests/kind-budget.test.ts` | scoped |
| Player ready-time bench by kind (report-only; no threshold) | `pnpm --filter @protoyard/player build && pnpm exec tsx scripts/bench-player.ts --runs 3 --kinds app,deck,page,doc` (writes `tmp/bench-player-*.json`) | scoped |
| Player bench helpers (unit) | `pnpm vitest run scripts/tests/bench-player.test.ts` | scoped |
| Texuli pin guard (unit + repository) | `pnpm vitest run scripts/tests/texuli-latest.test.ts` | scoped |
| Brief synthesis by kind (report-only) | `pnpm exec tsx scripts/bench-brief-kinds.ts --runs 3` (writes `tmp/bench-brief-kinds-*.json`) | scoped |
| Brief-kinds bench helpers (unit) | `pnpm vitest run tests/scripts/bench-brief-kinds.test.ts` | scoped |
| Block family chunk bench | `pnpm exec tsx scripts/bench-blocks.ts --check` + `pnpm vitest run tests/scripts/bench-blocks.test.ts` | scoped |
| Package tarball consumer loop (pnpm) | `pnpm build:packages && pnpm verify:packages` | full |
| Package tarball consumer loop (npm) | `pnpm build:packages && pnpm verify:packages --pm npm` | full |
| Package tarball lint (every publishable package must pass) | `pnpm build:packages && pnpm check:packages --require-all` | full |
| Distributable skill (frontmatter, commands against the CLI, links, checksums) | `pnpm check:skill` | full |
| Integration surface, static (see below) | `pnpm check:integrations` | full |
| Integration surface with its test files | `pnpm check:integrations -- --run-tests` | full |
| Index scale budget (1,000 manifests) | `pnpm bench:index --runs 3 --check` | full |
| Scenario generation budget | `pnpm protoyard scenario bench <slug> --check` | scoped |
| Cold-start bench (report; optional `--check`) | `pnpm exec tsx scripts/bench-cold-start.ts <slug…> --runs 3` | scoped |
| Publish batch | `pnpm vitest run packages/cli/tests/publish-batch.test.ts` | scoped |
| Publish ledger | `pnpm vitest run packages/cli/tests/publish-ledger.test.ts` | scoped |
| Review index | `pnpm vitest run packages/cli/tests/review-index.test.ts` | scoped |
| Review comments (engine + UI) | `pnpm vitest run packages/review packages/review-ui` | scoped |
| Review comments CLI and Cloudflare worker | `pnpm vitest run packages/cli/tests/comments-command.test.ts packages/cli/tests/publish-comments.test.ts` | scoped |
| Review comments in the browser | `PROTOYARD_E2E_COMMENTS_PROTOTYPES=crm-demo,mobile-banking-demo pnpm test:e2e tests/e2e/review-comments.spec.ts` | scoped |
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
| Deck visual QA sweep (unit) | `pnpm vitest run scripts/tests/deck-sweep.test.ts` | scoped |
| Deck visual QA sweep (browser fixture; private loopback port) | `pnpm exec tsx scripts/sweep-deck.ts --blueprint blueprints/decks/example.json` (writes `tmp/deck-sweep/`; optional `--port`) | scoped |
| Interaction / dead-control sweep | `PROTOYARD_E2E_DECK=1 pnpm exec playwright test tests/e2e/interaction-sweep.spec.ts` | scoped |
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

### Integration surface

```bash
pnpm check:integrations                  # static: commands and flags in INTERFACE, MCP, DWP and integrations/**; MCP tools; addon packet files and JSON; descriptor against the vendored DWP schema; links; no absolute local paths
pnpm check:integrations -- --run-tests   # plus every integration test file (interface*, version-interface*, mcp*, dwp*, integration*, tests/integration/*) in one Vitest run; each must select and pass at least one test
```

Test files join the `--run-tests` selection by name prefix, so an
integration test with another prefix is not picked up. These files also run
in `pnpm test`.

### Wall-clock budgets and timeouts

- **Millisecond budgets are perf-only.** An assertion against a millisecond
  budget depends on machine load, not on code. Guard it with
  `process.env.PROTOYARD_PERF === '1'` and keep everything else running in
  the default suite: the code tokenizer still tokenizes every pathological
  input and checks the output on every run.
- **The perf run.** `pnpm test:perf` runs those budgets serialized
  (`--no-file-parallelism`). Run it on a quiet machine, and add a new
  budgeted file to its script.
- **Per-test timeouts.** Tests that are slow by nature, but not timed, get a
  realistic per-test timeout instead of the 5 s default. The block security
  property test and the `setup.sh --verify` spawn tests use 30 s.

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
| `PROTOYARD_E2E_PROTOTYPES=crm-demo,mobile-banking-demo` | Build and serve the listed prototypes for prototype and viewport tests | One server per slug from `4401`, in list order (`PROTOYARD_E2E_PROTOTYPE_PORT_BASE` overrides it) |
| `PROTOYARD_E2E_SHOWCASE=1` | Include the combined gallery + prototype showcase (hosted `/play/` for app, deck, page and doc share links) | `4501` (`PROTOYARD_E2E_SHOWCASE_PORT` overrides it); `PROTOYARD_E2E_SHOWCASE_BASE=/path/` sets its public base |
| `PROTOYARD_E2E_DECK=1` | Build and serve the catalog deck fixture for `deck-navigation.spec.ts`, `deck-presenter.spec.ts`, `deck-controls.spec.ts` and `deck-everything.spec.ts` (it also starts when `deck-navigation`, `deck-presenter`, `deck-design`, `deck-fragments` or `interaction-sweep` is named on the Playwright argv; `deck-controls` and `deck-everything` need the flag) | `4891`; `PROTOYARD_E2E_DECK_PORT` overrides the port |
| `PROTOYARD_E2E_DEVTOOLS_PROTOTYPES=mobile-banking-demo` | Also build the listed prototypes WITH DevTools into `tmp/e2e-devtools/<slug>` and serve them, for `tests/e2e/pending-feedback.spec.ts` (the standard builds stay DevTools-free) | One server per slug from `4451` (`PROTOYARD_E2E_DEVTOOLS_PORT_BASE` overrides it) |
| `PROTOYARD_E2E_REVIEW=1` | Run the review-index page against the checked-in fixture ledger, with no deploy | `4502`; `PROTOYARD_E2E_REVIEW_PORT` overrides the port |
| `PROTOYARD_E2E_PLAYER=1` | Build the player into `tmp/e2e-player` and serve it, plus the embedder fixture, for the player, marketplace, content-kinds and deck-design specs (also starts when one of those is named on the argv) | `4861` and `4862` (`PROTOYARD_E2E_PLAYER_PORT`, `PROTOYARD_E2E_PLAYER_EMBEDDER_PORT`); the deck-design level-2 prototype on `4892` (`PROTOYARD_E2E_DECK_PROTOTYPE_PORT`) |
| `PROTOYARD_E2E_COMMENTS_PROTOTYPES=crm-demo,mobile-banking-demo` | Build the listed prototypes with `PROTOYARD_REVIEW=1` into `tmp/e2e-comments/<slug>` for `tests/e2e/review-comments.spec.ts`; the first one is also built with the `http` adapter and served with the comments handler on an in-memory store (two reviewers) | One server per slug from `4601` (`PROTOYARD_E2E_COMMENTS_PORT_BASE`); the shared server on `4651` (`PROTOYARD_E2E_COMMENTS_SHARED_PORT`) |
| `PROTOYARD_E2E_TEMPLATES_A11Y=1` | Render every `templates/*` home screen and run axe in light and dark; serious and critical violations fail | Template Vite server is started and stopped per template on `5551` (`PROTOYARD_E2E_TEMPLATE_PORT` overrides it) |

The gallery uses port `4329` (`PROTOYARD_E2E_GALLERY_PORT` overrides it). The
standalone CLI `review-index --serve` defaults to `4520` (or the next free
port); `--strict-port` makes a collision an error. Example E2E invocations,
including the review-index target, are in
[tests/e2e/README.md](../tests/e2e/README.md).

Every web-server port has a `PROTOYARD_E2E_*_PORT` (or `*_PORT_BASE`) override
with the defaults above; `playwright.config.ts` accepts only a whole number
from 1024 to 65535. Outside CI, Playwright **reuses a server already listening
on a port**, so two checkouts on the same defaults test each other's builds.
To run beside another checkout (another agent or worktree), move every port and
turn reuse off with `CI=1`:

The opt-in all-template accessibility sweep is intentionally separate from the
normal prototype audit because it starts a development server for every
template. Run it with the lane's private gallery port and Chromium project:

```bash
PROTOYARD_E2E_TEMPLATES_A11Y=1 PROTOYARD_E2E_GALLERY_PORT=5529 \
  PROTOYARD_E2E_TEMPLATE_PORT=5551 \
  pnpm exec playwright test tests/e2e/template-a11y.spec.ts --project=chromium
```

```bash
CI=1 PROTOYARD_E2E_GALLERY_PORT=5329 PROTOYARD_E2E_SHOWCASE_PORT=5501 \
  PROTOYARD_E2E_PROTOTYPE_PORT_BASE=5401 PROTOYARD_E2E_DEVTOOLS_PORT_BASE=5451 \
  PROTOYARD_E2E_REVIEW_PORT=5502 PROTOYARD_E2E_COMMENTS_PORT_BASE=5601 \
  PROTOYARD_E2E_COMMENTS_SHARED_PORT=5651 PROTOYARD_E2E_PLAYER_PORT=5861 \
  PROTOYARD_E2E_PLAYER_EMBEDDER_PORT=5862 PROTOYARD_E2E_DECK_PORT=5891 \
  PROTOYARD_E2E_DECK_PROTOTYPE_PORT=5892 PROTOYARD_E2E_QUICK_PORT=5878 \
  pnpm test:e2e
```

`CI=1` also turns on one retry, two workers and the HTML report. Without the
overrides, run **one E2E session per machine at a time**.

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
| `packages/blocks/src/**`, `packages/blocks-ui/src/**` | `pnpm vitest run packages/blocks packages/blocks-ui` (`interactive-data.test.ts`, `chart-paths.test.ts`, `timeline-layout.test.ts`, `security.test.ts`, `a11y-themes.test.ts`) + `npx tsx scripts/blocks-reference.ts --check` + `pnpm vitest run tests/scripts/blocks-reference.test.ts` | unit + render + generated reference |
| `packages/blocks-ui/src/data/**` (interactive table sort, filter and highlight; explorable chart) | `pnpm vitest run packages/blocks-ui/tests/interactive-data.test.ts` + `pnpm exec tsx scripts/bench-blocks.ts --check` (data family ≤ 5 KB gzip) | render + family chunk ceiling |
| `packages/decks/src/**`, `packages/decks-ui/src/**` | `pnpm vitest run packages/decks packages/decks-ui` (`style-apply.test.ts`, `layout-design.test.ts`, `budget.test.ts`, `presenter.test.ts`) + `PROTOYARD_E2E_DECK=1 pnpm exec playwright test deck-navigation deck-presenter deck-controls deck-everything interaction-sweep` | unit + render + opt-in browser |
| `packages/decks/src/agent/**` (Debug for agents: describe, format and parse a slide reference) | `pnpm vitest run packages/decks/tests/agent-debug.test.ts` | unit |
| `packages/decks/src/text/safe.ts` (invisible code points, `inertJson`, safe deck paths and share ids) | `pnpm vitest run packages/decks/tests/safe-text.test.ts packages/decks/tests/agent-debug.test.ts packages/player/tests/debug-source.test.ts packages/cli/tests/deck-command.test.ts` | unit + consumers (debug source, `deck inspect`) |
| `packages/decks/src/input/{controls,decide}.ts` (`DECK_CONTROLS` registry, key decisions, Escape order) | `pnpm vitest run packages/decks/tests/controls.test.ts packages/decks/tests/input.test.ts packages/decks/tests/readme-sync.test.ts` + `pnpm vitest run packages/decks-ui/tests/help.test.ts packages/decks-ui/tests/toolbar.test.ts` | unit + generated README table + consumers |
| `packages/decks/src/layouts/steppable.ts`, `packages/decks-ui/src/layouts/**` (steps on every catalog prop) | `pnpm vitest run packages/decks/tests/steps-everywhere.test.ts packages/decks-ui/tests/steps-everywhere.test.ts` | unit + render |
| `packages/decks/src/backgrounds/**`, `packages/decks-ui/src/canvas/DeckMediaBackground.svelte` (image and video slide backgrounds) | `pnpm vitest run packages/decks/tests/media-backgrounds.test.ts packages/decks-ui/tests/media-backgrounds.test.ts` | unit + render |
| `packages/decks/src/schema` (custom slides), `packages/decks-ui/src/layouts/{CustomSlideHost.svelte,custom-slides.ts}` | `pnpm vitest run packages/decks/tests/custom-slides.test.ts packages/decks-ui/tests/custom-slides.test.ts` + `pnpm protoyard validate create-anything-deck --build` (the flagship's pricing configurator) | unit + render + level-2 build |
| `prototypes/create-anything-deck/src/slides/**` (the flagship's custom slides) | `pnpm vitest run prototypes/create-anything-deck` + `PROTOYARD_E2E_DECK=1 PROTOYARD_E2E_PROTOTYPES=create-anything-deck pnpm exec playwright test tests/e2e/deck-design.spec.ts` | unit + level-2 E2E |
| `packages/decks-ui/src/chrome/**` (registry toolbar, More menu, slide jump list, tooltip, full screen, help and first-visit hint, toast, blackout, laser) | `pnpm vitest run packages/decks-ui/tests/toolbar.test.ts packages/decks-ui/tests/chrome.test.ts packages/decks-ui/tests/tooltip.test.ts packages/decks-ui/tests/tooltip-budget.test.ts packages/decks-ui/tests/fullscreen.test.ts packages/decks-ui/tests/help.test.ts packages/decks-ui/tests/feedback.test.ts packages/decks-ui/tests/lazy-chrome.test.ts` + `PROTOYARD_E2E_DECK=1 pnpm exec playwright test tests/e2e/deck-controls.spec.ts tests/e2e/deck-presenter.spec.ts` | component + bundle guards + browser E2E |
| `packages/decks-ui/src/debug/**` (Debug for agents panel, lazy chunk ≤ 12 KB gzip) | `pnpm vitest run packages/decks-ui/tests/debug-panel.test.ts` + `PROTOYARD_E2E_DECK=1 pnpm exec playwright test tests/e2e/deck-controls.spec.ts` | component + bundle + browser E2E |
| `packages/decks-ui/src/{app,chrome,layouts}/**` (first-paint size, idle prefetch) | `pnpm vitest run packages/decks-ui/tests/lazy-chrome.test.ts packages/decks-ui/tests/bundle-size.test.ts packages/decks-ui/tests/large-deck.perf.test.ts` | real-build initial graph + 200-slide timings |
| `packages/cli/src/commands/deck.ts` (`protoyard deck`) | `pnpm vitest run packages/cli/tests/deck-command.test.ts packages/cli/tests/interface.test.ts packages/cli/tests/skill-cli-reference.test.ts` (a capability-id change also runs `packages/cli/tests/doctor-kinds.test.ts`) | CLI integration |
| `docs/DECKS.md`, `skills/protoyard/references/decks.md` (agent loop and recipes) | `pnpm vitest run packages/decks/tests/docs-snippets.test.ts packages/cli/tests/decks-docs.test.ts` + `pnpm check:skill` | every recipe parses; skill integrity |
| `blueprints/decks/everything.json` (the reference deck) | `pnpm vitest run packages/decks/tests/everything-deck.test.ts` + `pnpm protoyard deck lint blueprints/decks/everything.json` + `PROTOYARD_E2E_DECK=1 pnpm exec playwright test tests/e2e/deck-everything.spec.ts` (it is also in `tests/e2e/content-kinds-a11y.spec.ts` on the player) | coverage of every layout, block, chart kind and steppable prop + browser walk |
| `packages/pages/src/**`, `packages/pages-ui/src/**` | `pnpm vitest run packages/pages packages/pages-ui` (`page-design.test.ts`, `doc-design.test.ts`, `budget.test.ts`) | unit + render + bundle |
| `packages/flows/src/**`, `packages/flows-ui/src/**`, `packages/gamification/src/**`, `packages/gamification-ui/src/**` | `pnpm vitest run packages/flows packages/flows-ui packages/gamification packages/gamification-ui` | unit + render |
| `packages/blueprint/src/kinds/**` (kind union, untrusted loader, share links, `kinds/parse`) | `pnpm vitest run packages/blueprint/tests/kinds packages/blueprint/tests/identity-golden.test.ts packages/player/tests/kinds-parity.test.ts` | unit + both-level parity |
| `packages/cli/src/lib/codegen/{emit,regenerate}.ts` (content kinds), `templates/{deck,page,doc,design-kit}/**` | `pnpm vitest run packages/cli/tests/generate-kinds.test.ts packages/cli/tests/embed-level2.test.ts packages/cli/tests/content-templates.test.ts templates/deck templates/page templates/doc templates/design-kit` | CLI integration (generation, drift, lint-clean output, embedded apps) |
| `packages/player/src/**` (kind routing and entries) | `pnpm --filter @protoyard/player build && pnpm vitest run packages/player` (`kind-entries`, `kind-budget`, `kinds-security`, `budget`) | integration + bundle + security |
| `packages/cli/src/lib/quick/**` (kinds, single file) | `pnpm vitest run packages/cli/tests/quick packages/cli/tests/quick.test.ts` | CLI integration |
| `blueprints/{decks,pages,docs}/**` | `pnpm vitest run packages/blueprint/tests/deck-catalog.test.ts packages/blueprint/tests/page-doc-catalog.test.ts packages/blueprint/tests/catalog-docs.test.ts packages/blueprint/tests/kinds/share-kinds.test.ts` | catalog validation, docs and share-link fit |
| `skills/protoyard/**` (deck path) | `pnpm check:skill` + `pnpm vitest run packages/cli/tests/skill-deck-path.test.ts` | skill integrity and routing |
| `packages/{decks-ui,pages-ui,blocks-ui}/src/**`, `packages/player/src/{app.css,entries/**}` (accessibility) | `pnpm exec playwright test tests/e2e/content-kinds-a11y.spec.ts tests/e2e/deck-presenter.spec.ts` (every deck slide, the page and the doc under axe in light and dark, desktop and phone) | browser a11y E2E |
| `tests/e2e/{showcase,marketplace,deck-artifact,artifact-pack}.spec.ts` | `PROTOYARD_E2E_SHOWCASE=1 pnpm exec playwright test tests/e2e/showcase.spec.ts`; `pnpm exec playwright test tests/e2e/marketplace.spec.ts tests/e2e/deck-artifact.spec.ts tests/e2e/artifact-pack.spec.ts` | browser E2E (hosted player kinds, marketplace kinds, artifact harness) |
| `packages/runtime/src/**` | `packages/runtime/tests/runtime.test.ts`, which uses the fixture `packages/runtime/tests/fixtures/tasks-prototype.ts` | integration on fake IndexedDB |
| `packages/cli/src/**` | `packages/cli/tests/*.test.ts` (temporary workspaces) | integration |
| `scripts/verify-packages.ts` | `packages/cli/tests/verify-packages.test.ts` + `pnpm verify:packages` (pnpm and npm) | packed consumer integration |
| `packages/cli/src/commands/publish.ts`, publish batch helpers | `publish.test.ts`, `publish-batch.test.ts` | integration; batch command row above |
| `packages/cli/src/lib/publish-ledger.ts` | `publish-ledger.test.ts`; ledger consumers in `publish-batch.test.ts` and `review-index.test.ts` | ledger persistence and consumers |
| `packages/cli/src/commands/review-index.ts` | `review-index.test.ts` + `tests/e2e/review-index.spec.ts` | CLI integration + opt-in browser E2E |
| `packages/review/src/**` | `packages/review/tests/*.test.ts` (every adapter runs `packages/review/tests/conformance.ts`; `server-validate.test.ts` keeps the worker validator in parity with the zod schema) | unit / integration |
| `packages/review-ui/src/**` | `packages/review-ui/tests/*.test.ts` + `tests/e2e/review-comments.spec.ts` | happy-dom unit + browser E2E (anchoring, frames, focus, capture) |
| `packages/cli/src/commands/comments.ts`, `publish --comments` | `comments-command.test.ts`, `publish-comments.test.ts` | CLI integration; worker bundle size, routes and a KV round trip in Node |
| `packages/cli/src/commands/ci.ts` | `ci-init.test.ts` | workflow init, drift and integrity checks |
| `packages/cli/src/commands/affected.ts`, `packages/cli/src/lib/affected.ts` | `affected.test.ts` | CLI integration |
| `packages/cli/src/commands/generate.ts`, `blueprint` command | `generate.test.ts`, `blueprint-validate.test.ts` | CLI integration (temporary workspaces) |
| `packages/blueprint/src/services.ts` | `packages/blueprint/tests/services.test.ts` (real runtime, fixture `tests/fixtures/blueprint-prototype.ts`); CSV paths in `csv-services.test.ts` | integration on fake IndexedDB |
| `packages/blueprint/src/schema.ts` screen contracts and `screenPath()` | `pnpm vitest run packages/blueprint/tests/screens.test.ts packages/blueprint/tests/schema.test.ts` | schema, cross-reference and default-route contract |
| `packages/blueprint/src/generator.ts` distributions and geo generation | `pnpm vitest run packages/blueprint/tests/generator.test.ts packages/blueprint/tests/geo.test.ts` | deterministic world and fictional geo contract |
| `packages/crud/src/screens/**`, geo field and detail tabs | `pnpm vitest run packages/crud` | component and service-backed behavior for board, calendar, map, dashboard, analytics, timeline, settings, geo picker and detail tabs |
| `packages/cli/src/lib/codegen/emit.ts` generated screen wrappers and layout routes | `pnpm vitest run packages/cli/tests/generate-screens.test.ts packages/cli/tests/generate-layout.test.ts packages/cli/tests/generate.test.ts` | generated files, lazy route mapping and runtime blueprint config |
| `packages/cli/src/commands/budget.ts` | `budget-command.test.ts` + `budgets.test.ts` | CLI integration; build budgets are also gated in CI |
| `packages/cli/src/commands/scenario.ts` (benchmark path) | `scenario-bench.test.ts` | CLI integration; CI checks each prototype's default scenarios |
| `packages/cli/src/commands/spec.ts`, spec extraction | `spec-command.test.ts`, `spec-extract.test.ts`; `pnpm protoyard spec --all --check` for the committed specs | CLI integration + drift check |
| `apps/gallery/src/**` | `apps/gallery/tests/*.test.ts` + `tests/e2e/gallery.spec.ts` | unit + E2E |
| `apps/gallery/src/components/marketplace/**`, `apps/gallery/src/pages/marketplace/**` | `pnpm vitest run apps/gallery` + `tests/e2e/marketplace.spec.ts` (`PROTOYARD_E2E_SHOWCASE=1` adds the bundled-demo Try it test); perf: `pnpm bench:index --marketplace --check` | unit + E2E + perf |
| `packages/renderer-svelte/src/shell/**`, viewport presets | `tests/e2e/shell-layout.spec.ts`, `tests/e2e/viewport-fit.spec.ts` | E2E (layout + axe) |
| `packages/core/src/layouts.ts`, `packages/ui/src/layouts/**` | `pnpm vitest run packages/core/tests/layouts.test.ts packages/ui/tests/layout-host.test.ts` + `pnpm --filter @protoyard/ui typecheck`; layout behavior in `tests/e2e/layout-fit.spec.ts` | contract + component + typecheck + browser fit |
| `packages/charts/src/**` | `pnpm vitest run packages/charts` (scales, shapes, downsample, layouts, palette; `PROTOYARD_BENCH=1` adds the LTTB and min-max timings) | unit (Node) |
| `packages/charts-ui/src/**` | `pnpm vitest run packages/charts-ui` (happy-dom) + `pnpm vitest run packages/cli/tests/charts-bundle.test.ts` (real Vite build: no chart code in initial JS, size ceilings) + `tests/e2e/charts.spec.ts` (`PROTOYARD_E2E_PROTOTYPES=ui-kit`: axe, keyboard, table, dark, reduced motion, 10k Canvas, touch, resize) | unit + bundle guard + E2E |
| `packages/analytics/src/**` | `pnpm vitest run packages/analytics` (`PROTOYARD_BENCH=1` asserts the funnel and generation budgets) | unit (Node) |
| `packages/analytics-ui/src/**` | `pnpm vitest run packages/analytics-ui`; consumers `templates/analytics` and `prototypes/pebblestat-analytics-demo` | component (happy-dom) |
| `packages/views/src/**` | `pnpm vitest run packages/views` | unit (pure engines and deterministic scenario fragments) |
| `packages/views-ui/src/**` | `pnpm vitest run packages/views-ui` + `pnpm vitest run packages/cli/tests/views-bundle.test.ts` | component + real-build chunk ceilings and lazy overlay guard |
| `prototypes/ui-kit/src/demos/views/**` or views UI behavior | `PROTOYARD_E2E_PROTOTYPES=ui-kit pnpm test:e2e tests/e2e/views.spec.ts` | E2E on desktop and Pixel 7: keyboard, pointer, phone layout, axe, and large-data cases |
| 100k-row DataGrid performance | `pnpm exec tsx scripts/bench-grid.ts --rows 100000 --runs 3 --check` | browser performance gate (in-memory rows, not an IndexedDB world) |
| Chart performance (any of the four packages above, or the ui-kit chart demos) | `pnpm protoyard build ui-kit && pnpm exec tsx scripts/bench-charts.ts --runs 3 --check` (Node LTTB, Chromium 10k render, hover p95, long tasks, subpath sizes; writes `tmp/bench-charts.json`) | perf gate |
| `prototypes/pebblestat-analytics-demo/**`, `templates/analytics/**` | their `tests/` + `pnpm protoyard scenario bench <slug> --check` (prototype only) + `pnpm protoyard budget <slug>` + `tests/e2e/pebblestat-analytics-demo.spec.ts` and `tests/e2e/layout-fit.spec.ts` (`PROTOYARD_E2E_PROTOTYPES=pebblestat-analytics-demo,analytics`) | unit + integration + bench + E2E |
| `prototypes/<slug>/src/scenarios/**` | `prototypes/<slug>/tests/generators.test.ts` (via `tests/support/generate-context.ts`) | unit |
| `prototypes/<slug>/src/domain/**` | `prototypes/<slug>/tests/services.test.ts` (via `tests/support/runtime.ts`, the **real runtime**) | integration |
| `prototypes/<slug>/src/**/*.svelte` | component tests in `prototypes/<slug>/tests/` where present + `tests/e2e/prototypes.spec.ts` | component + E2E |
| `templates/<name>/**` | `templates/<name>/tests/*.test.ts` | unit / integration |
| `packages/cli/src/lib/output-guard.ts`, `isInside` callers (write and delete guards) | `pnpm vitest run packages/cli/tests/comments-command.test.ts packages/cli/tests/generate.test.ts packages/cli/tests/blueprint-new.test.ts packages/cli/tests/security.test.ts` | refused targets, symlinks on the path, nothing written outside |
| `packages/blueprint/src/csv-guard.ts`, `csv.ts` | `pnpm vitest run packages/blueprint/tests/csv.test.ts packages/crud` | formula guard round trip, crud analytics export |
| `packages/review/src/report/**`, `safe-text.ts` | `pnpm vitest run packages/review/tests/report.test.ts packages/review/tests/server-validate.test.ts` | untrusted-text report and schema parity |
| `packages/avatars/**`, `scripts/import-avatars.ts` | `pnpm vitest run packages/avatars`; `--check` needs `--src` or `PROTOYARD_AVATARS_SRC` (owner only) | manifest and deterministic picks |
| `packages/blueprint/src/app-model.ts`, `packages/cli/src/lib/codegen/emit.ts` (routes, layout) | `pnpm vitest run packages/blueprint/tests/app-model.test.ts packages/cli/tests/codegen-model.test.ts` | app model and the codegen that renders it |
| `packages/blueprint/src/runtime-definition.ts` | `pnpm vitest run packages/blueprint/tests/runtime-definition.test.ts` | runtime prototype definition from a blueprint |
| `runtime-definition.ts`, `app-model.ts`, codegen `emit.ts`, `templates/crud-app/src/**` | `pnpm vitest run packages/blueprint/tests/runtime-parity.test.ts`: the 40 catalog blueprints generated with the CLI and compared with `definePrototypeFromBlueprint`, including byte-identical worlds (about 1-3 s per blueprint) | level 1 / level 2 parity |
| `packages/blueprint/src/identity.ts`, `share.ts` | `pnpm vitest run packages/blueprint/tests/identity.test.ts packages/blueprint/tests/share.test.ts` | content hash, storage identity, share-link codec |
| `packages/blueprint/src/untrusted.ts` | `pnpm vitest run packages/blueprint/tests/untrusted.test.ts packages/blueprint/tests/untrusted-fuzz.test.ts` | untrusted loader and deterministic fuzzing |
| `packages/blueprint/src/variants.ts`, `patch.ts` | `pnpm vitest run packages/blueprint/tests/variants.test.ts packages/blueprint/tests/patch.test.ts` | deterministic variants, RFC 6902 patches |
| `packages/blueprint/src/import/**` (CSV, JSON and SQLite shape import) | `pnpm vitest run packages/blueprint/tests/import` | authoring parsers, hostile input |
| `packages/crud/src/app/**` | `pnpm vitest run packages/crud/tests/blueprint-app.test.ts` | lazy `@protoyard/crud/app` blueprint app shell |
| `packages/renderer-svelte/src/mount.ts` (build options) | `pnpm vitest run packages/renderer-svelte/tests/mount-build-options.test.ts` | runtime build options |
| `packages/renderer-svelte/src/avatars-plugin.ts` | `pnpm vitest run packages/renderer-svelte/tests/avatars-resolution.test.ts packages/renderer-svelte/tests/avatars-build.test.ts` | avatar assets through package resolution |
| `packages/player/src/**` | `pnpm vitest run packages/player` (`boot.test.ts` first), plus `pnpm --filter @protoyard/player build` | player unit and integration |
| `packages/player/**`, `packages/player/vite.config.ts` (size) | `pnpm --filter @protoyard/player build && pnpm vitest run packages/player/tests/budget.test.ts packages/player/tests/kind-budget.test.ts` (dist suites are skipped without a build) | app and per-kind initial JS/CSS budgets; content-kind static graphs exclude Faker, world worker, CRUD and DevTools |
| `scripts/bench-player.ts` (ready time by kind) | `pnpm vitest run scripts/tests/bench-player.test.ts`; browser sample: `pnpm --filter @protoyard/player build && pnpm exec tsx scripts/bench-player.ts --runs 3 --kinds app,deck,page,doc` | unit helpers + report-only browser bench (JSON under `tmp/`) |
| `scripts/check-texuli-latest.ts` | `pnpm vitest run scripts/tests/texuli-latest.test.ts`; registry: `pnpm exec tsx scripts/check-texuli-latest.ts --registry` | unit + offline repository check; registry check needs the network |
| `scripts/sweep-deck.ts`, `scripts/lib/deck-sweep.ts` | `pnpm vitest run scripts/tests/deck-sweep.test.ts`; browser: `pnpm exec tsx scripts/sweep-deck.ts --blueprint blueprints/decks/example.json` | unit classification + opt-in browser fixture sweep |
| `packages/decks-ui/src/**` (DeckApp, navigation, input) | `pnpm vitest run packages/decks-ui` + `PROTOYARD_E2E_DECK=1 pnpm exec playwright test tests/e2e/deck-navigation.spec.ts` | component + built-catalog browser E2E |
| `packages/decks-ui/src/{presenter,print,chrome}/**` | `pnpm vitest run packages/decks-ui` (including `tests/toolbar.test.ts`) + `PROTOYARD_E2E_DECK=1 pnpm exec playwright test tests/e2e/deck-controls.spec.ts tests/e2e/deck-presenter.spec.ts` | registry controls, presenter, tools and print browser E2E |
| `packages/cli` artifact export, packed `page.html` | `pnpm exec playwright test tests/e2e/artifact-pack.spec.ts tests/e2e/deck-artifact.spec.ts` (harness in `tests/e2e/support/artifact-harness.ts`) | opt-in artifact viewer harness (app + deck) |
| Hosted `/play/` kind share links | `PROTOYARD_E2E_SHOWCASE=1 pnpm exec playwright test tests/e2e/showcase.spec.ts` (fixtures in `tests/e2e/targets.ts` `SHOWCASE_KIND_TARGETS`) | opt-in static showcase E2E for app, deck, page and doc |
| `packages/cli/src/commands/quick/**`, `packages/cli/src/lib/quick/**` | `pnpm vitest run packages/cli/tests/quick` (every `quick*.test.ts`); focused: `quick-serve.test.ts`, `quick-variants.test.ts` + `quick.test.ts`, `quick-player-assets.test.ts` (its real-build case needs `pnpm --filter @protoyard/player build`) | CLI integration (temporary workspaces) |
| `packages/cli/src/lib/capture/**` (shared with `scripts/visual-sweep.ts` and the thumbnails) | `pnpm vitest run packages/cli/tests/capture.test.ts tests/scripts/visual-sweep.test.ts` | readiness wait, PNG decode |
| `packages/cli/src/lib/workspace.ts` (package lookup), `packages/cli/src/runners/inspect-prototype.ts`, `packages/cli/src/commands/blueprint.ts` (`$schema`) | `pnpm vitest run packages/cli/tests/package-resolution.test.ts` | packages found by Node resolution |
| `packages/create-protoyard/**`, `packages/cli/src/lib/paths.ts` (layout) | `pnpm vitest run packages/create-protoyard packages/cli/tests/workspace-layouts.test.ts` (1-3 min) | scaffolder and consumer workspaces |
| `packages/templates/**`, `templates/*` (packability) | `pnpm vitest run packages/templates` (real `pnpm pack`, about 15-30 s) | packed templates |
| `packages/protoyard/**` | `pnpm vitest run packages/protoyard/tests/wrapper.test.ts` (about 30-90 s) | unscoped wrapper bin |
| `packages/*/src`, `packages/*/bin` (cross-package imports), `packages/*/src/**/*.css` (`@source`, `@import`) | `pnpm vitest run packages/cli/tests/package-boundaries.test.ts` | no sibling `src/` imports |
| `scripts/build-packages.ts`, `scripts/lib/package-graph.ts`, `packages/*/tsconfig.build.json`, `protoyard.build` | `pnpm vitest run packages/cli/tests/build-packages.test.ts packages/cli/tests/package-dist-imports.test.ts`; Svelte packages: `pnpm build:packages --filter svelte && pnpm vitest run packages/cli/tests/package-dist-parity.test.ts` (minutes) | dist build, plain-Node imports from `dist/`, dist parity |
| `scripts/check-packages.ts` | `pnpm vitest run packages/cli/tests/check-packages.test.ts` (real `pnpm pack`, publint and attw, about 10-20 s), then `pnpm build:packages && pnpm check:packages --require-all` | tarball lint |
| `scripts/lib/tarball-hygiene.ts`, `packages/cli/src/lib/hygiene.ts` | `pnpm vitest run packages/cli/tests/tarball-hygiene.test.ts` | secrets, key files, home paths and real emails in packed files |
| `.changeset/config.json`, `scripts/version-packages.ts` | `pnpm vitest run packages/cli/tests/release-config.test.ts -t changesets` | lockstep versioning |
| `.github/workflows/release.yml`; `.github/workflows/ci.yml` (packages job) | `pnpm vitest run packages/cli/tests/release-config.test.ts -t "release workflow"` (its pack test needs `jq`); `-t "ci workflow"` | workflow structure |
| `packages/cli/src/commands/doctor.ts`, `packages/cli/src/lib/command.ts` (envelope), `packages/cli/src/program.ts` (`--version`), `packages/cli/src/lib/workspace.ts` (`INTERFACE_MAJOR`) | `pnpm vitest run packages/cli/tests/interface.test.ts packages/cli/tests/interface-compat.test.ts packages/cli/tests/version-interface.test.ts packages/cli/tests/envelope.test.ts` | machine interface |
| `packages/cli/src/commands/mcp.ts` | `pnpm vitest run packages/cli/tests/mcp` (transport, tools, security, a process-level exchange) | MCP server |
| `integrations/deepworkplan/protoyard/**`, `tests/integration/**` | `pnpm vitest run packages/cli/tests/dwp tests/integration/` (`python3` for the vendored-runtime checks in `dwp-addon.test.ts`) | addon packet and the disposable exploration loop |
| `scripts/validate-integrations.ts` | `pnpm vitest run packages/cli/tests/integration-surface.test.ts packages/cli/tests/integration-command-drift.test.ts` | integration surface gate |
| `packages/cli/src/program.ts`, `packages/cli/src/commands/**`, `skills/protoyard/references/cli.md` | `pnpm vitest run packages/cli/tests/skill-cli-reference.test.ts packages/cli/tests/check-skill-cli.test.ts` | skill command reference against the CLI |
| `skills/protoyard/setup.sh`, `skills/protoyard/references/hosts.md` | `pnpm vitest run packages/cli/tests/skill-setup.test.ts` | host installation |
| `skills/protoyard/**` | `pnpm check:skill` + `pnpm vitest run packages/cli/tests/skill packages/cli/tests/check-skill-cli tests/scripts/skill tests/scripts/upgrade-skill tests/scripts/validate-skill` | frontmatter, links, checksums, flows |
| `apps/gallery/src/lib/docs/**`, `apps/gallery/src/components/docs/**`, `apps/gallery/src/pages/docs/**`, `docs/*.md` (public guide links), `scripts/check-public-docs.ts` | `pnpm vitest run apps/gallery/tests/docs-search.test.ts apps/gallery/tests/docs-pages.test.ts` and `pnpm exec tsx scripts/check-public-docs.ts`; after a gallery build, `--built apps/gallery/dist`; in a browser, `tests/e2e/docs.spec.ts` | static guide pages, links and search |
| `apps/gallery/src/pages/sitemap.xml.ts`, `robots.txt.ts` | `pnpm vitest run apps/gallery/tests/sitemap.test.ts` | sitemap and indexing |
| `templates/crud-app/src/app.css` view-based CRUD consumers | `pnpm protoyard validate <slug> --strict-spec --build` on a generated prototype that declares those screens | build verifies Tailwind styles and generated routes |

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
- Review comments: real Cloudflare deploys, D1 and KV bindings and
  `REVIEW_KEY` secrets are not exercised. Only dry runs, the bundled worker in
  Node and the handler with an in-memory store are tested. KV's eventual
  consistency cannot be reproduced locally.
- The dist-parity and prebuilt-player suites (`package-dist-parity.test.ts`,
  `packages/player/tests/budget.test.ts`, `packages/player/tests/kind-budget.test.ts`)
  are skipped when `dist/` is missing, so a local `pnpm test` without a package
  build does not run them. The CI `packages` job builds first, so they always
  run there.
- The MCP tests drive the real `protoyard mcp` process with JSON-RPC written
  by the test helper. No round trip with an MCP SDK client has been run.
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

- **Level 1 / level 2 parity.** A change to codegen, the crud-app template's
  prototype or scenarios, or the runtime definition keeps
  `runtime-parity.test.ts` green.

Agents using the distributable skill follow
[`skills/protoyard/review/SKILL.md`](../skills/protoyard/review/SKILL.md):
`validate --build`, the scoped suites from this guide, `spec --check`,
`scenario validate`, `budget`, then `preview` and variant checks. A run that
selects zero tests is reported as a failure, not a pass.

No coverage quotas or test-count targets. A behavior change comes with a test
that would have failed before it.

## Blueprint kinds (deck, page, doc): default suite vs opt-in

PLAN_005 adds content kinds beside apps. Their checks split into three tiers.
Use the matching tier; do not promote a report-only bench into a gate without
calibrated thresholds in [PERFORMANCE.md](PERFORMANCE.md).

### Default unit and integration suite (`pnpm test`)

These run in the ordinary Vitest job. Dist-dependent rows skip cleanly when
`packages/player/dist/` is missing.

| Check | Command | Notes |
| --- | --- | --- |
| Deck sweep classification | `pnpm vitest run scripts/tests/deck-sweep.test.ts` | Report parsing, severity policy, noise classifiers |
| Player bench helpers | `pnpm vitest run scripts/tests/bench-player.test.ts` | Arg and sample shaping for the browser bench |
| Deck / page / doc package unit tests | `pnpm vitest run packages/decks packages/decks-ui packages/pages packages/pages-ui packages/blocks packages/blocks-ui` | Schema, hosts, blocks |
| Player unit tests | `pnpm vitest run packages/player` | Boot and kind routing without a production build |
| Kind entry budgets (when `dist/` exists) | `pnpm vitest run packages/player/tests/kind-budget.test.ts` | Enforced 150 KB JS / 30 KB CSS for deck, page, doc; 250 KB / 30 KB for the app entry |

### Opt-in browser and static-host checks

These need the root Playwright config with the env flags below, or a private
copy of it with moved ports. They are **not** part of a bare
`pnpm test`. CI's E2E job turns showcase on; deck and artifact specs are
selected by path or by their own harness.

| Check | Setup | Command |
| --- | --- | --- |
| Hosted kind showcase | `PROTOYARD_E2E_SHOWCASE=1`; also run with `PROTOYARD_E2E_SHOWCASE_BASE=/protoyard/` | `pnpm exec playwright test tests/e2e/showcase.spec.ts` |
| Deck navigation | `PROTOYARD_E2E_DECK=1` (or name the spec on argv so the fixture server starts) | `pnpm exec playwright test tests/e2e/deck-navigation.spec.ts` |
| Deck presenter and print | Same deck server as navigation | `pnpm exec playwright test tests/e2e/deck-presenter.spec.ts` |
| Deck chrome controls and Debug for agents | `PROTOYARD_E2E_DECK=1` (required) | `pnpm exec playwright test tests/e2e/deck-controls.spec.ts` |
| The everything reference deck (42 slides, axe, every step) | `PROTOYARD_E2E_DECK=1` (required) | `pnpm exec playwright test tests/e2e/deck-everything.spec.ts` |
| Artifact harness (app) | Self-started; exports `relay-chat-demo` once under `artifacts/` | `pnpm exec playwright test tests/e2e/artifact-pack.spec.ts` |
| Artifact harness (deck) | Self-started; exports `create-anything-deck` | `pnpm exec playwright test tests/e2e/deck-artifact.spec.ts` |
| Deck visual QA sweep | Private loopback port (ephemeral or `--port`); never gallery 4321 / 4500 / 4501 | `pnpm exec tsx scripts/sweep-deck.ts --blueprint blueprints/decks/example.json` |
| Prototype visual sweep | Review contact sheet; not a pixel gate | `pnpm visual:sweep --only <slug…>` |

Parallel runs copy `playwright.config.ts` to a private file and move ports.
Never kill shared gallery ports.

### Report-only performance samples

No threshold is set from uncalibrated samples. Numbers live under `tmp/` and
are documented in [PERFORMANCE.md](PERFORMANCE.md) when a measured run is
recorded. Setup is always: build the player first, exclude build time from
the sample, use a fresh Chromium context per visit.

```bash
pnpm --filter @protoyard/player build
pnpm exec tsx scripts/bench-player.ts --runs 3 --kinds app,deck,page,doc
ls tmp/bench-player-*.json

pnpm exec tsx scripts/bench-brief-kinds.ts --runs 3
ls tmp/bench-brief-kinds-*.json
```

### Enforced per-kind bundle gates

After a player production build:

```bash
pnpm --filter @protoyard/player build
pnpm vitest run packages/player/tests/budget.test.ts packages/player/tests/kind-budget.test.ts
```

`kind-budget.test.ts` walks each of `index.html`, `deck.html`, `page.html` and
`doc.html` as the sole Vite entry, asserts the configured gzip caps (see
`protoyard.budgets.json` `kinds.*` and [PERFORMANCE.md](PERFORMANCE.md#player-bundle-budget-measured-2026-10-20)),
and proves content-kind static graphs omit Faker, the world-generation worker,
CRUD screens/app and DevTools. Host-only package budgets for PageApp and DocApp
live in `packages/pages-ui/tests/budget.test.ts`; the DeckApp entry budget lives
in `packages/decks-ui/tests/bundle-size.test.ts`.

## Visual QA sweep

For shared layouts, combine `tests/e2e/layout-fit.spec.ts` with the core
contract tests and `packages/ui/tests/layout-host.test.ts`. Layouts use the
host container width, not only the browser viewport, so exercise them inside
the shells or panels they support. The sweep varies each target's manifest
layout and supported layouts; review its screenshots and flags rather than
treating the contact sheet as an automated pixel gate. See
[LAYOUTS.md](LAYOUTS.md) for the catalog and layout-specific authoring rules.

`scripts/visual-sweep.ts` screenshots prototypes in every applicable
combination and writes a contact sheet for a human to review. It complements
the E2E checks; it is not a gate.

```bash
pnpm visual:sweep --only crm-demo,mobile-banking-demo   # build, capture, write the sheet
pnpm visual:sweep --skip-build --out tmp/visual-sweep-after --compare tmp/visual-sweep
open tmp/visual-sweep/index.html
```

#### Deck fixture sweep

`scripts/sweep-deck.ts` visits every slide and step of a **kind:deck** blueprint
in a private Vite harness (`DeckApp`). It checks overflow, text minima, images,
fragment order, navigation and browser noise, then writes `tmp/deck-sweep/`
(`sweep.json`, contact sheet, shots). Deterministic errors fail the process;
font/contrast heuristics are warnings until calibrated. See [DECKS.md](DECKS.md).

```bash
pnpm vitest run scripts/tests/deck-sweep.test.ts
pnpm exec tsx scripts/sweep-deck.ts --blueprint blueprints/decks/example.json
open tmp/deck-sweep/index.html
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
context with the thumbnails' readiness wait (`packages/cli/src/lib/capture/page.ts`:
`data-py-ready`, fonts, network idle, a quiet DOM, reduced motion, UTC,
`en-US`). It then records:

- the axe violation count (WCAG 2.1 A and AA; `--no-axe` skips it);
- layout flags from the `layout-fit` rules that hold for every app:
  `input-off-screen` (a primary input outside the viewport that the page
  cannot scroll to), `region-does-not-scroll`, `page-overflow-stuck`;
- with `--compare <earlier sweep>`, the changed pixels per shot (both PNGs
  are decoded by `packages/cli/src/lib/capture/png.ts`, no image dependency), `new` or
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

**Player.** `--only player` (opt-in, never part of the default sweep) builds
the player and opens it with `blueprints/quick/assistant.json`, capturing
desktop and phone in light and dark: 4 shots.

The output goes to `tmp/visual-sweep/` (`--out` must be inside `tmp/`):
`index.html` (static, no external assets, light and dark, filters for every
dimension plus "problems only" and "changed only", lazy images), `sweep.json`
and `shots/`. A shot that fails to boot is listed with its error and the run
exits 1; flags and axe findings never fail it. `--templates` adds every
template demo, served from the showcase build (`pnpm build:showcase`, run
unless `--skip-build`). `--concurrency N` (default 2) sets parallel shots.

Measured 2026-10-19 on one Apple M1 Max under heavy
parallel load (load average about 150):

| Run | Shots | Time |
| --- | ---: | ---: |
| `--only mobile-banking-demo,crm-demo` (2 builds, axe on) | 18 | 51.4 s |
| `--only crm-demo --skip-build --no-axe --concurrency 3 --compare …` | 10 | 17.0 s, 0 changed pixels against the first run |

Without `--only`, on 2026-10-20 (15 prototypes, 27 templates; there are now
16 and 31), the prototypes made 310 shots and `--templates` added 534 (the
sweep's own `buildMatrix` over the manifests: every applicable shell × the manifest layouts ×
light/dark on desktop, plus the manifest shell × layouts × light/dark on the
phone; `--themes a,b` multiplies these). A full run has not been timed yet.

## Proposed (not yet verified)

- Visual regression gating of the demos. The visual sweep above produces and diffs screenshots for review, but no baseline is committed and nothing fails on a pixel change.
- Per-package coverage thresholds. `pnpm test:coverage` runs (v8) but no
  floor is enforced.
