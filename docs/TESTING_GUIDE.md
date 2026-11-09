# Testing Guide

Protoyard tests **behavior**: does a deal persist across a reload, is a viewer
blocked in the service layer, does the same seed rebuild the same world? The
suite is kept to its **essential** cases (PLAN_009, 2026-11-01): fast unit and
integration tests on the real engine (with an in-memory IndexedDB), plus a
small set of browser end-to-end journeys on real static builds.

**Size today (measured 2026-11-01):** Vitest selects **954 tests in 190
files** (`pnpm test`; 946 pass and 8 skip without a package build), including
one self-contained smoke test per template that every new prototype inherits. PLAN_009
cut it from 8,892 tests in 829 files. The plan measured about 60 s for a full
local run on a quiet machine; a run on this machine under parallel load took
125 s. Playwright lists **89 cases in 23 spec files** with CI's prototype
targets (from 1,016).

## Tools (verified versions)

| Tool | Version | Used for |
| --- | --- | --- |
| Vitest | 5.0.x | Unit and integration tests in happy-dom, with `fake-indexeddb/auto` ([vitest.config.ts](../vitest.config.ts), [tests/setup/vitest.setup.ts](../tests/setup/vitest.setup.ts)) |
| @testing-library/svelte | 5.4 | Svelte component tests (`packages/ui`, `devtools`, `renderer-svelte`, `views-ui`, `saas-ui` and others) |
| Playwright | 1.64 | E2E on built artifacts ([playwright.config.ts](../playwright.config.ts), [tests/e2e/](../tests/e2e/README.md)) |
| Biome | 2.6.3 | Lint and format |
| tsc / svelte-check / astro check | TS 6.0.3 | Type checks per package |

## The essential-suite policy

PLAN_009 kept a test only when it guards something that would hurt if it
broke silently. Before adding a test, check that it guards one of these:

- **A mandatory rule a package implements** ([AGENTS.md](../AGENTS.md)): the
  service mutation path (`session.assert` → zod → `environment.run` →
  `db.transaction`, and a refused write leaves no row); determinism (the same
  seed gives the same world, no `Math.random` or `Date.now`); untrusted input
  (snapshots, share links, design-system documents and blueprints are
  validated, nothing reaches `{@html}`); policy (capabilities and own-row
  rules).
- **A security guard.** Every guard keeps at least one case. Cases from
  pruned CLI files live in
  [`packages/cli/tests/security-regressions.test.ts`](../packages/cli/tests/security-regressions.test.ts);
  packages keep theirs in a `security.test.ts` or `untrusted.test.ts`.
- **A public export family**: it exists and has its documented behavior.
- **A critical command or flow**: `new`, `generate` (one app, deck, page and
  doc), `validate`, `build`/`export` (the ZIP and the isolation check),
  `quick` (one single file per kind with its budget), `mcp`, `ds`,
  `spec --check`, `budget`, `doctor --json`, the package and skill checks.
- **A bundle surface**: one real-build test each for the prototype, player,
  deck, page/doc and views budgets.
- **Each prototype**: a boot smoke plus its domain service rule (one or two
  tests). Each template: one generate, integrity and boot case in
  [`tests/integration/templates.test.ts`](../tests/integration/templates.test.ts).

Not kept: exhaustive parametrized sweeps, duplicated assertions, snapshot
restatements, docs-drift tests, private helpers already covered by a public
test, and per-component tests of Texuli components (Texuli's own suite covers
them).

**Budgets** (from the plan's coverage map):

| Group | Areas | Budget | Files ≤ | Today |
| --- | --- | ---: | ---: | --- |
| G1 | `packages/cli`, `create-protoyard`, `protoyard`, `scripts/tests`, `tests/` | 190 | 40 | 229 tests, 41 files |
| G2 | `packages/blueprint`, `packages/crud` | 150 | 25 | 138 tests, 21 files |
| G3 | `ui`, `renderer-svelte`, `devtools`, `themes`, `views`, `views-ui`, `charts`, `charts-ui`, `analytics`, `analytics-ui` | 170 | 40 | 146 tests, 34 files |
| G4 | the other engine and content-kind packages (`core` … `gamification-ui`, `templates`) | 330 | 60 | 338 tests, 44 files |
| G5 | `prototypes/*`, `templates/*`, `apps/gallery` | 160 | 35 | 103 tests, 50 files (31 are the one-test template smoke files) |
| **Total** | | **1,000** (accepted 900–1,100) | **200** | **954 tests, 190 files** |

G1 and G4 sit slightly over their group budgets; the total is inside the
accepted range. E2E: about 100 cases (accepted 80–120) in the CI selection,
desktop plus mobile only where the phone layout is the point.

**Adding a test without growing the suite much:**

1. Look for the file that already guards the rule and add a case there
   (`it` inside the existing `describe`) instead of a new file. Each new file
   costs import and environment setup on every run.
2. Prefer one test that loops over representative inputs (a table of hostile
   values, every kind) to an `it.each` that multiplies cases.
3. A behavior change still ships with a test that would have failed before
   it. If it guards none of the categories above, it probably belongs in
   review, not in the suite.
4. For prototypes, call `expectBootableWorld(definition)` from
   [`tests/support/smoke.ts`](../tests/support/smoke.ts) for determinism,
   integrity and boot, then add one or two service tests through
   `createHarness` ([`tests/support/runtime.ts`](../tests/support/runtime.ts)).
   Templates ship **no** `tests/` folder, so a prototype made with
   `protoyard new --template` has none until you add one, and
   `pnpm vitest run prototypes/<slug>` fails with "No test files found".
   Blueprint-generated prototypes get `tests/generators.test.ts` and
   `tests/services.test.ts` from `generate`.
5. E2E: add a case to an existing spec, tag it `@desktop` or `@mobile` unless
   both layouts matter, and keep the CI selection inside 80–120 cases
   ([tests/e2e/README.md](../tests/e2e/README.md)).
6. Re-check the count: `pnpm vitest run <path> --reporter=dot` and
   `pnpm exec playwright test --list`.

## Commands

All commands run from the repository root. Labels: **full** runs everything;
**scoped** runs a subset. Counts are from 2026-11-01.

| Purpose | Command | Kind |
| --- | --- | --- |
| Lint + format check | `pnpm lint` | full |
| Lint one area | `npx biome check packages/runtime` | scoped |
| Type check everything | `pnpm typecheck` | full |
| Type check one package | `pnpm --filter @protoyard/runtime typecheck` | scoped |
| Type check one prototype | `pnpm --filter @prototype/crm-demo typecheck` | scoped |
| All unit + integration tests | `pnpm test` (190 files, 954 tests) | full |
| All tests, fewer workers (a loaded machine; same tests) | `PROTOYARD_TEST_WORKERS=4 pnpm test` | full |
| One CI shard | `pnpm vitest run --shard=1/2` (and `--shard=2/2`) | full, split |
| Wall-clock budgets, serialized (run on a quiet machine) | `pnpm test:perf` (`PROTOYARD_PERF=1`; today the code tokenizer's pathological-input budget) | perf |
| One package or prototype | `pnpm vitest run packages/runtime` (1 file, 14 tests) | scoped |
| One file | `pnpm vitest run packages/core/tests/core.test.ts` (14 tests) | scoped |
| By test name | `pnpm vitest run -t "refuses"` (58 files, 119 tests selected) | scoped |
| Tests affected by changes | `pnpm vitest run --changed HEAD~1` | scoped (see blind spots) |
| E2E (gallery only) | `pnpm test:e2e` (81 cases listed; prototype specs skip) | full |
| E2E, CI targets | `PROTOYARD_E2E_PROTOTYPES=crm-demo,mobile-banking-demo,ai-chat-demo PROTOYARD_E2E_SHOWCASE=1 PROTOYARD_E2E_DEVTOOLS_PROTOTYPES=mobile-banking-demo pnpm test:e2e` (89 cases listed) | full |
| One E2E CI shard | add `--shard=1/2` (or `2/2`) to the command above | full, split |
| Deck E2E (navigation, steps, presenter, controls) | `PROTOYARD_E2E_DECK=1 pnpm exec playwright test deck-navigation deck-fragments deck-presenter deck-controls` (14 cases) | scoped |
| Content kinds under axe, page form response | `PROTOYARD_E2E_PLAYER=1 pnpm exec playwright test tests/e2e/content-kinds-a11y.spec.ts` (13 cases) | scoped |
| Hosted player per kind and share links | `PROTOYARD_E2E_SHOWCASE=1 pnpm exec playwright test tests/e2e/showcase.spec.ts` (7 cases; also run with `PROTOYARD_E2E_SHOWCASE_BASE=/protoyard/`) | scoped |
| Quick loop in a browser | `PROTOYARD_E2E_QUICK=1 pnpm exec playwright test tests/e2e/quick.spec.ts` (1 case; rebuilds the player once, `PROTOYARD_E2E_QUICK_PLAYER=prebuilt` skips that) | scoped |
| Review comments in the browser | `PROTOYARD_E2E_COMMENTS_PROTOTYPES=crm-demo,mobile-banking-demo pnpm exec playwright test tests/e2e/review-comments.spec.ts` (4 cases) | scoped |
| Charts and views in the browser | `PROTOYARD_E2E_PROTOTYPES=ui-kit pnpm exec playwright test tests/e2e/charts.spec.ts tests/e2e/views.spec.ts` (5 cases) | scoped |
| One prototype end to end | `pnpm protoyard validate crm-demo --build` | scoped |
| Bundle size budgets (after build) | `pnpm protoyard budget --all --skip-build` | full |
| Player budgets (app, per-kind entries, worker graph; skipped without a build) | `pnpm --filter @protoyard/player build && pnpm vitest run packages/player/tests/budget.test.ts` | scoped |
| Player ready-time bench by kind (report-only) | `pnpm --filter @protoyard/player build && pnpm exec tsx scripts/bench-player.ts --runs 3 --kinds app,deck,page,doc` | scoped |
| Texuli pin guard | `pnpm vitest run scripts/tests/texuli-latest.test.ts` (5 tests) | scoped |
| Brief synthesis by kind (report-only) | `pnpm exec tsx scripts/bench-brief-kinds.ts --runs 3` | scoped |
| Block family chunk bench | `pnpm exec tsx scripts/bench-blocks.ts --check` | scoped |
| Chart bench (line + bar ceiling) | `pnpm exec tsx scripts/bench-charts.ts --skip-browser --check` | scoped |
| Package tarball consumer loop | `pnpm build:packages && pnpm verify:packages` (`--pm npm` for npm) | full |
| Package tarball lint | `pnpm build:packages && pnpm check:packages --require-all` | full |
| Distributable skill | `pnpm check:skill` | full |
| Integration surface, static | `pnpm check:integrations` | full |
| Integration surface with its test files | `pnpm check:integrations -- --run-tests` (6 files) | full |
| Public guides and links | `pnpm check:docs` | full |
| Index scale budget (1,000 manifests) | `pnpm bench:index --runs 3 --check` | full |
| Scenario generation budget | `pnpm protoyard scenario bench <slug> --check` | scoped |
| Cold-start bench (report; optional `--check`) | `pnpm exec tsx scripts/bench-cold-start.ts <slug…> --runs 3` | scoped |
| CI performance job (local mirror) | `pnpm protoyard build --all && pnpm protoyard budget --all --skip-build && pnpm bench:index --runs 3 --check` | full |
| Visual QA sweep (contact sheet, see below) | `pnpm visual:sweep --only crm-demo,mobile-banking-demo` | scoped |
| Deck visual QA sweep (browser fixture; private loopback port) | `pnpm exec tsx scripts/sweep-deck.ts --blueprint blueprints/decks/example.json` | scoped |
| Thumbnails stay deterministic | `pnpm exec tsx scripts/generate-thumbnails.ts crm-demo --check` | scoped |

`protoyard spec <slug> --check` (or `spec --all --check`) is the drift check
for generated spec regions, and `validate` fails while a region is stale
([SPECS.md](SPECS.md)).

A command that exits 0 after selecting nothing is not evidence. Check the
`Tests` line. Vitest exits 1 when a path matches no test file.

### CI

`.github/workflows/ci.yml` runs on every pull request and push to `main`, in
parallel jobs of about five minutes each:

| Job | What it runs |
| --- | --- |
| public hygiene | `scripts/check-public-hygiene.sh` over tracked files |
| lint and repo checks | Biome, `check:skill`, `check:integrations`, `check:docs`, `protoyard index`, `doctor`, the gallery build and the reference export |
| types (three shards) | `pnpm typecheck` filtered to packages; prototypes; templates and apps |
| unit tests (two shards) | builds the packages and the player (cached), then `pnpm vitest run --shard=<n>/2`, so the dist-dependent suites run |
| e2e (two shards) | `pnpm test:e2e --shard=<n>/2` against real static builds (see the E2E section) |
| performance budgets | the job below |
| packages | build, dist parity, tarball lint and a clean consumer install |

### Integration surface

```bash
pnpm check:integrations                  # static: commands and flags in INTERFACE, MCP, DWP and integrations/**; MCP tools; addon packet files and JSON; descriptor against the vendored DWP schema; links; no absolute local paths
pnpm check:integrations -- --run-tests   # plus every integration test file in one Vitest run; each must select and pass at least one test
```

Test files join the `--run-tests` selection by name (`interface*`,
`version-interface*`, `mcp*`, `dwp*` and `integration*` under
`packages/cli/tests/`, plus everything in `tests/integration/`). Today that is
6 files: `interface`, `mcp`, `mcp-hardening`, `mcp-security`,
`tests/integration/dwp-loop-isolation` and `tests/integration/templates`.
These files also run in `pnpm test`.

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
  realistic per-test timeout instead of the 5 s default (for example the
  `setup.sh --verify` spawn tests use 30 s).

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

Locally, run the mirror row in the table above before opening a PR that
touches budgets, the index, or scenario generators.

### E2E

Run `pnpm test:e2e:install` once on a new machine to install Chromium. The
spec list, the project tags (`@desktop`, `@mobile`) and what turns each spec on
are in [tests/e2e/README.md](../tests/e2e/README.md). Specs wait for the app
with `waitForPrototypeReady({ slug })` from `tests/e2e/support/ready.ts`, not
by polling `data-py-ready`.

`pnpm exec playwright test --list` lists 81 cases with no environment and 89
with CI's prototype targets (`crm-demo,mobile-banking-demo,ai-chat-demo`).
The other flags do not change the list, because those specs skip at run time;
each extra prototype target adds four `a11y.spec.ts` cases (light and dark,
on each project where the target applies). CI also sets
`PROTOYARD_E2E_SHOWCASE=1` and `PROTOYARD_E2E_DEVTOOLS_PROTOTYPES=mobile-banking-demo`.

E2E targets are opt-in through environment variables:

| Variable | Effect | Ports |
| --- | --- | --- |
| `PROTOYARD_E2E_PROTOTYPES=crm-demo,mobile-banking-demo` | Build and serve the listed prototypes for prototype and viewport tests | One server per slug from `4401`, in list order (`PROTOYARD_E2E_PROTOTYPE_PORT_BASE` overrides it) |
| `PROTOYARD_E2E_SHOWCASE=1` | Include the combined gallery + prototype showcase (hosted `/play/` for app, deck, page and doc share links) | `4501` (`PROTOYARD_E2E_SHOWCASE_PORT` overrides it); `PROTOYARD_E2E_SHOWCASE_BASE=/path/` sets its public base |
| `PROTOYARD_E2E_DECK=1` | Build and serve the catalog deck fixture for the deck specs (it also starts when a deck spec is named on the Playwright argv) | `4891`; `PROTOYARD_E2E_DECK_PORT` overrides the port |
| `PROTOYARD_E2E_DEVTOOLS_PROTOTYPES=mobile-banking-demo` | Also build the listed prototypes WITH DevTools into `tmp/e2e-devtools/<slug>` for `pending-feedback.spec.ts` and `design-system.spec.ts` (the standard builds stay DevTools-free) | One server per slug from `4451` (`PROTOYARD_E2E_DEVTOOLS_PORT_BASE` overrides it) |
| `PROTOYARD_E2E_PLAYER=1` | Build the player into `tmp/e2e-player` and serve it, plus the embedder fixture, for `content-kinds-a11y.spec.ts` and `marketplace.spec.ts` (also starts when one of those is named on the argv) | `4861` and `4862` (`PROTOYARD_E2E_PLAYER_PORT`, `PROTOYARD_E2E_PLAYER_EMBEDDER_PORT`) |
| `PROTOYARD_E2E_QUICK=1` | Run `quick.spec.ts`: a brief becomes a served exploration | `4878` and the next (`PROTOYARD_E2E_QUICK_PORT`) |
| `PROTOYARD_E2E_COMMENTS_PROTOTYPES=crm-demo,mobile-banking-demo` | Build the listed prototypes with `PROTOYARD_REVIEW=1` into `tmp/e2e-comments/<slug>` for `review-comments.spec.ts`; the first one is also built with the `http` adapter and served with the comments handler on an in-memory store (two reviewers) | One server per slug from `4601` (`PROTOYARD_E2E_COMMENTS_PORT_BASE`); the shared server on `4651` (`PROTOYARD_E2E_COMMENTS_SHARED_PORT`) |
| `PROTOYARD_E2E_REVIEW=1` | Serve the review-index page from the fixture ledger (no spec uses it since PLAN_009) | `4502`; `PROTOYARD_E2E_REVIEW_PORT` overrides the port |

The gallery uses port `4329` (`PROTOYARD_E2E_GALLERY_PORT` overrides it).
Every web-server port has a `PROTOYARD_E2E_*_PORT` (or `*_PORT_BASE`) override
with the defaults above; `playwright.config.ts` accepts only a whole number
from 1024 to 65535. Outside CI, Playwright **reuses a server already listening
on a port**, so two checkouts on the same defaults test each other's builds.
To run beside another checkout (another agent or worktree), move every port and
turn reuse off with `CI=1`:

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

### Verified scoped runs (2026-11-01)

| Command | Selected → result |
| --- | --- |
| `pnpm test` (full) | 190 files, 946 passed + 8 skipped (the player budgets, dist parity and the perf-only tokenizer budget, without a package build) |
| `pnpm vitest run packages/runtime` | 1 file, 14 passed |
| `pnpm vitest run prototypes/crm-demo` | 1 file, 5 passed |
| `pnpm vitest run prototypes` | 17 files, 58 passed |
| `pnpm vitest run packages/core/tests/core.test.ts` | 1 file, 14 passed |
| `pnpm vitest run -t "idempotent"` | 1 test selected (922 skipped), passes |
| `pnpm vitest run packages/cli` | 33 files, 164 passed + 1 skipped (dist parity) |
| `pnpm vitest run packages/cli/tests/quick` | 6 files, 28 passed (every `quick*` file plus `quick/single-file-kinds`) |
| `pnpm vitest run packages/blueprint packages/crud` | 21 files, 138 passed |
| `pnpm vitest run packages/player` | 3 files, 29 passed with a player build (6 skip without one) |
| `pnpm vitest run tests/integration/templates.test.ts` | 1 file, 35 passed |
| `pnpm vitest run tests/integration/templates.test.ts -t analytics` | 1 selected (34 skipped) |

Counts move with the suite. Re-run the command and check the selection rather
than trusting these numbers.

## Where tests live (source → test mapping)

| Source | Tests (selection on 2026-11-01) | Layer |
| --- | --- | --- |
| `packages/<pkg>/src/**` | `pnpm vitest run packages/<pkg>` (`packages/<pkg>/tests/*.test.ts`) | unit / integration |
| `packages/core/src/**` | `pnpm vitest run packages/core` (1 file, 14 tests: schemas, rng, clock, policy, environment, review comment parsing, snapshot guards) | unit |
| `packages/{core,database,scenarios,runtime,http,offline,avatars}/src/**` | `pnpm vitest run packages/core packages/database packages/scenarios packages/runtime packages/http packages/offline packages/avatars` (7 files, 51 tests) | unit + integration on fake IndexedDB |
| `packages/runtime/src/**` | `packages/runtime/tests/runtime.test.ts` (fixture `packages/runtime/tests/fixtures/tasks-prototype.ts`) | integration |
| `packages/blueprint/src/**`, `packages/crud/src/**` | `pnpm vitest run packages/blueprint packages/crud` (21 files, 138 tests) | unit + integration + component |
| `packages/blueprint/src/{untrusted,share}.ts`, `src/kinds/**` | `pnpm vitest run packages/blueprint/tests/untrusted.test.ts packages/blueprint/tests/untrusted-fuzz.test.ts packages/blueprint/tests/kinds` | untrusted loader, share links, seeded fuzz, kind envelope and runtime |
| `packages/blueprint/src/services.ts` | `packages/blueprint/tests/services.test.ts` (real runtime, fixture `tests/fixtures/blueprint-prototype.ts`) | integration |
| `runtime-definition.ts`, `app-model.ts`, codegen `emit.ts`, `templates/crud-app/src/**` | `pnpm vitest run packages/blueprint/tests/runtime-parity.test.ts`: the CRM blueprint generated with the CLI and compared with `definePrototypeFromBlueprint` (definitions, policy, routes, layout and world, byte for byte) | level 1 / level 2 parity |
| `packages/crud/src/EntityForm.svelte`, `src/screens/{sheet,canvas}/**`, the screen registry | `pnpm vitest run packages/crud` (6 files, 31 tests) | component + service-backed behavior |
| `packages/{ui,renderer-svelte,devtools}/src/**` | `pnpm vitest run packages/ui packages/renderer-svelte packages/devtools` (10 files, 48 tests) | component + bundle hygiene |
| Pending feedback (global bar, `Button` loading, DevTools) | `pnpm vitest run packages/renderer-svelte/tests/pending.test.ts packages/ui/tests/button.test.ts packages/devtools/tests/panel.test.ts` (15 tests) + `pending-feedback.spec.ts` (DevTools build) | component + E2E |
| `packages/themes/src/**` | `pnpm vitest run packages/themes` (5 files, 23 tests) | unit |
| `packages/{views,views-ui}/src/**` | `pnpm vitest run packages/views packages/views-ui` (11 files, 42 tests) + `pnpm vitest run packages/cli/tests/views-bundle.test.ts` (2 tests, real build) + `views.spec.ts` (`ui-kit` target) | unit + component + bundle + E2E |
| `packages/{charts,charts-ui,analytics,analytics-ui}/src/**` | `pnpm vitest run packages/charts packages/charts-ui packages/analytics packages/analytics-ui` (8 files, 33 tests) + `pnpm exec tsx scripts/bench-charts.ts --skip-browser --check` + `charts.spec.ts` (`ui-kit` target) | unit + bench gate + E2E |
| `packages/{blocks,blocks-ui}/src/**` | `pnpm vitest run packages/blocks packages/blocks-ui` (7 files, 67 tests) + `pnpm exec tsx scripts/blocks-reference.ts --check` | unit + render + security fuzz + generated reference |
| `packages/{decks,decks-ui}/src/**` | `pnpm vitest run packages/decks packages/decks-ui` (5 files, 34 tests) + `pnpm vitest run packages/cli/tests/deck-command.test.ts` + the deck E2E row above | unit + render + bundle caps + browser |
| `packages/{pages,pages-ui}/src/**` | `pnpm vitest run packages/pages packages/pages-ui` (5 files, 31 tests) + `content-kinds-a11y.spec.ts` + `doc-edits.spec.ts` (`doc` target) | unit + render + bundle + E2E |
| `packages/player/src/**` | `pnpm --filter @protoyard/player build && pnpm vitest run packages/player` (3 files, 29 tests) + `showcase.spec.ts` | share links, kind security, `postMessage`, CSP, budgets |
| `packages/{review,review-ui}/src/**` | `pnpm vitest run packages/review packages/review-ui` (4 files, 36 tests) + `review-comments.spec.ts` | adapter contract, server handler, UI + browser |
| `packages/{ai,ai-ui,saas,saas-ui}/src/**` | `pnpm vitest run packages/ai packages/ai-ui packages/saas packages/saas-ui` (8 files, 74 tests) | safe markdown, streaming, simulated auth, onboarding, forms |
| `packages/{flows,flows-ui,gamification,gamification-ui}/src/**` | `pnpm vitest run packages/flows packages/flows-ui packages/gamification packages/gamification-ui` (4 files, 13 tests) | one engine and one UI test each |
| `packages/cli/src/**` | `pnpm vitest run packages/cli` (33 files, 165 tests; temporary workspaces) | CLI integration |
| `packages/cli/src/lib/quick/**`, `src/commands/quick/**` | `pnpm vitest run packages/cli/tests/quick` (6 files, 28 tests; the single-file case needs a player build) | CLI integration |
| `packages/cli/src/commands/generate.ts`, codegen | `pnpm vitest run packages/cli/tests/generate.test.ts packages/cli/tests/generate-kinds.test.ts` (15 tests) | CLI integration |
| `packages/cli/src/commands/mcp.ts` | `pnpm vitest run packages/cli/tests/mcp.test.ts packages/cli/tests/mcp-hardening.test.ts packages/cli/tests/mcp-security.test.ts` (23 tests) | MCP server |
| `packages/cli/src/commands/doctor.ts`, `--version`, `INTERFACE_MAJOR` | `pnpm vitest run packages/cli/tests/interface.test.ts` (7 tests) | machine interface |
| Write and delete guards, injection and escaping guards in the CLI | `pnpm vitest run packages/cli/tests/security.test.ts packages/cli/tests/security-regressions.test.ts` (28 tests) | refused targets, symlinks, escaping, credential refusals |
| `packages/cli/src/lib/ds-check/**`, `check ds`, the `validate` design-system step | `pnpm vitest run packages/cli/tests/check-ds.test.ts` (21 tests; one failing fixture and a passing twin per rule in `packages/cli/tests/fixtures/ds-check/`) + `pnpm vitest run tests/adoption` (adoption rules unchanged) | rules + CLI integration |
| `packages/cli/src/commands/ds-component.ts`, `src/lib/ds-components.ts`, the `ds_component_*` MCP tools, the locked wording in `spec-render.ts` | `pnpm vitest run packages/cli/tests/ds-component.test.ts` (11 tests: every refusal, request → approve-request → new, `components.json` sha256, story stub, the scaffold under `scanDesignSystemSource` and the Svelte compiler, `ds validate` without drift, MCP validation and a real CLI call, locked-only `AGENTS.md` wording with a byte-identical unlocked region) + `pnpm vitest run packages/cli/tests/mcp.test.ts packages/cli/tests/spec-command.test.ts` | CLI integration + MCP |
| `new --ds`, `generate --ds` (`new.ts`, `generate.ts`, the `applyDesignSystem` core in `ds.ts`, the design-system emit options in `lib/codegen/`), the `new_from_design_system` MCP tool | `pnpm vitest run packages/cli/tests/new-ds.test.ts` (13 tests: default template, refusals for unknown, flat, draft and changed design systems, a fixture template with violations and its counts by rule, `--unlocked`, `--from` refused, the bound prototype under `scanPrototypeDesignSystem` and `lockedBindingProblem`, app, deck, page and doc generation bound and kept across regeneration with a clean drift check, binding an unbound generated prototype on regeneration with refusals checked before any write, `ds use --upgrade` on a generated deck, MCP validation and a real CLI call) + `pnpm vitest run packages/cli/tests/ds-lock.test.ts packages/cli/tests/ds-command.test.ts packages/cli/tests/new.test.ts packages/cli/tests/generate.test.ts packages/cli/tests/generate-kinds.test.ts` | CLI integration + MCP |
| `packages/cli/src/commands/spec.ts`, `budget.ts` | `pnpm vitest run packages/cli/tests/spec-command.test.ts packages/cli/tests/budget-command.test.ts` (8 tests); `pnpm protoyard spec --all --check` | CLI integration + drift check |
| `scripts/check-packages.ts`, `.changeset/`, release workflows | `pnpm vitest run packages/cli/tests/check-packages.test.ts packages/cli/tests/package-dist-parity.test.ts packages/cli/tests/release-config.test.ts` (6 tests; dist parity needs `pnpm build:packages --filter svelte`) | packaging and release |
| `skills/protoyard/**` | `pnpm check:skill` + `pnpm vitest run packages/cli/tests/skill-integrity.test.ts tests/scripts/validate-skill-links.test.ts` (10 tests) | frontmatter, links, checksums, `setup.sh` |
| `integrations/deepworkplan/protoyard/**`, `tests/integration/**` | `pnpm check:integrations -- --run-tests` + `pnpm vitest run tests/integration/dwp-loop-isolation.test.ts` (4 tests) | integration surface, DWP isolation |
| `scripts/check-texuli-latest.ts`, Texuli adoption, public hygiene | `pnpm vitest run scripts/tests tests/scripts tests/adoption` (4 files, 19 tests) | repo guards |
| `packages/{templates,create-protoyard,protoyard}/**` | `pnpm vitest run packages/templates packages/create-protoyard packages/protoyard` (3 files, 9 tests; real `pnpm pack` and spawned bins, slow) | packaging and scaffolding |
| `templates/<name>/**` | `pnpm vitest run tests/integration/templates.test.ts -t <name>` (one generate, integrity and boot case per template; the file has 35 tests) + `pnpm protoyard validate <name> --build` | integration |
| `prototypes/<slug>/**` | `pnpm vitest run prototypes/<slug>` (one file each: the boot smoke from `tests/support/smoke.ts` plus the domain service rule; 17 files, 58 tests in all) + `pnpm protoyard validate <slug> --build` | integration on the real runtime |
| `apps/gallery/src/**` | `pnpm vitest run apps/gallery` (2 files, 14 tests: registry reading, the create-flow guard, untrusted input) + `gallery.spec.ts`, `marketplace.spec.ts`, `docs.spec.ts`, `a11y.spec.ts` | unit + E2E |
| `docs/*.md` (public guide links), `scripts/check-public-docs.ts` | `pnpm check:docs`; after a gallery build, `pnpm exec tsx scripts/check-public-docs.ts --built apps/gallery/dist` | links and anchors |
| `packages/renderer-svelte/src/shell/**`, viewport presets | `PROTOYARD_E2E_PROTOTYPES=mobile-banking-demo pnpm exec playwright test tests/e2e/shell-layout.spec.ts` (4 cases) | E2E (layout + axe) |

**Rule of thumb:** a change in `X/src/...` runs `pnpm vitest run X`. Areas
with no test of their own after PLAN_009 (for example the views timeline,
tree, map, activity and files adapters, DevTools tours, the deck design rules
and the artifact viewer harness) are named in their own guides; check those
by hand or add an essential case.

### Consumers and escalation

- **Core contracts** (`packages/core`) are consumed by every package,
  prototype and template. Changing them runs the full suite (`pnpm test`)
  and `pnpm typecheck`.
- **Engine packages** (`database`, `scenarios`, `runtime`) are consumed by
  `renderer-svelte`, `devtools`, every prototype test and the templates test.
  Run `pnpm vitest run packages prototypes tests/integration`.
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
  media queries need E2E, and PLAN_009 kept only the essential journeys.
- Charts in happy-dom have no layout: tests stub `ResizeObserver` with a fixed
  width. The browser check is `tests/e2e/charts.spec.ts` (one family, axe and
  the dark palette).
- Generated worlds can change silently when Faker or the SDK upgrades. That is
  what the determinism tests and `generatorVersion` exist for.
- Provider deployments are not exercised by local tests or CI. Validate real
  Cloudflare, Netlify or Vercel behavior manually with authorized credentials
  and a dry run first.
- Review comments: real Cloudflare deploys, D1 and KV bindings and
  `REVIEW_KEY` secrets are not exercised. Only the handler with an in-memory
  store and the browser specs are tested.
- The dist-parity and prebuilt-player suites (`package-dist-parity.test.ts`,
  `packages/player/tests/budget.test.ts`) are skipped when `dist/` is missing,
  so a local `pnpm test` without a package build does not run them. The CI
  unit job builds the packages and the player first, so they run there.
- The MCP tests drive the real `protoyard mcp` process with JSON-RPC written
  by the test helper. No round trip with an MCP SDK client has been run.
- GitHub-hosted runner timing varies. Cold-start numbers are uploaded as
  reports, not a CI threshold, until a calibration run establishes a stable
  baseline.

**Fallback:** when unsure, run `pnpm lint && pnpm typecheck && pnpm test`.

## Testing posture

- **Essential and behavioral.** Test observable outcomes: rows written,
  errors thrown, worlds generated. Never test internal call sequences. Keep
  tests fast and deterministic: fixed seeds, the simulation clock, and
  instant `sleep` for the environment.
- **Real seams over mocks.** Services are tested on `createPrototypeRuntime`
  with a fresh in-memory IndexedDB per test. "Reload" means
  `harness.reload()`: close, then reopen on the same storage. Persistence,
  migrations, snapshot I/O, permissions and transactions are seams; a change
  to one adds an integration test.
- **Few, valuable E2E journeys** on built static artifacts, in fresh browser
  contexts so no IndexedDB leaks between tests: the gallery and marketplace;
  CRM create, edit, delete and a refused write; the banking transfer and
  phone layout; streamed safe answers; simulated sign-in, MFA and onboarding;
  DevTools theme, persona and design-system flows; decks, pages and docs;
  the player, quick and review comments; charts, views and shells; axe in
  light and dark.
- **What every prototype must test:** generator determinism and integrity for
  every scenario (the boot smoke) and its domain service rule.
- **Level 1 / level 2 parity.** A change to codegen, the crud-app template's
  prototype or scenarios, or the runtime definition keeps
  `runtime-parity.test.ts` green.

Agents using the distributable skill follow
[`skills/protoyard/review/SKILL.md`](../skills/protoyard/review/SKILL.md):
`validate --build`, the scoped suites from this guide, `spec --check`,
`scenario validate`, `budget`, then `preview` and variant checks. A run that
selects zero tests is reported as a failure, not a pass.

No coverage quotas. The budgets above cap the suite's size; a behavior change
still comes with a test that would have failed before it.

## Blueprint kinds (deck, page, doc): default suite vs opt-in

Content-kind checks split into three tiers. Use the matching tier; do not
promote a report-only bench into a gate without calibrated thresholds in
[PERFORMANCE.md](PERFORMANCE.md).

### Default unit and integration suite (`pnpm test`)

| Check | Command | Notes |
| --- | --- | --- |
| Deck / page / doc / block packages | `pnpm vitest run packages/decks packages/decks-ui packages/pages packages/pages-ui packages/blocks packages/blocks-ui` | Schema, untrusted input, hosts, blocks, deck and page/doc bundle caps |
| Kind blueprints | `pnpm vitest run packages/blueprint/tests/kinds` (3 files, 33 tests) | Envelope (every shipped example parses), runtime service path, security |
| Player | `pnpm vitest run packages/player` | Share links, kind security; the budget suite runs when `dist/` exists |
| Kind entry budgets (when `dist/` exists) | `pnpm vitest run packages/player/tests/budget.test.ts` | 150 KB JS / 30 KB CSS for deck, page and doc (`kinds.*` in `protoyard.budgets.json`); 250 KB / 30 KB for the app entry, plus a 125 KB regression cap |
| Generation and quick single files per kind | `pnpm vitest run packages/cli/tests/generate-kinds.test.ts packages/cli/tests/quick/single-file-kinds.test.ts` | The single-file case needs a player build |

### Opt-in browser checks

These need the root Playwright config with the env flags in the E2E section.
They are **not** part of a bare `pnpm test`.

| Check | Setup | Command |
| --- | --- | --- |
| Hosted kind showcase | `PROTOYARD_E2E_SHOWCASE=1`; also run with `PROTOYARD_E2E_SHOWCASE_BASE=/protoyard/` | `pnpm exec playwright test tests/e2e/showcase.spec.ts` |
| Deck navigation, steps, presenter and print, controls and Debug for agents | `PROTOYARD_E2E_DECK=1` | `pnpm exec playwright test deck-navigation deck-fragments deck-presenter deck-controls` |
| A deck, a page and a doc under axe, light and dark; a page form response | `PROTOYARD_E2E_PLAYER=1` (or name the spec) | `pnpm exec playwright test tests/e2e/content-kinds-a11y.spec.ts` |
| Doc edit, reload and reset | `doc` in `PROTOYARD_E2E_PROTOTYPES` | `pnpm exec playwright test tests/e2e/doc-edits.spec.ts` |
| Deck visual QA sweep | Private loopback port (ephemeral or `--port`); never gallery 4321 / 4500 / 4501 | `pnpm exec tsx scripts/sweep-deck.ts --blueprint blueprints/decks/example.json` |
| Prototype visual sweep | Review contact sheet; not a pixel gate | `pnpm visual:sweep --only <slug…>` |

PLAN_009 removed the everything-deck sweep, the deck and page design gates,
the artifact harness specs and the deck sweep's unit tests; see
[DECKS](DECKS.md) and [PAGES](PAGES.md) for what they measured.

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
pnpm vitest run packages/player/tests/budget.test.ts
```

`budget.test.ts` walks each of `index.html`, `deck.html`, `page.html` and
`doc.html` as the sole Vite entry, asserts the configured gzip caps (see
`protoyard.budgets.json` `kinds.*` and [PERFORMANCE.md](PERFORMANCE.md#versioned-budgets)),
proves content-kind static graphs omit app-only dependencies, and caps the
world-generation worker graph. Host-only package budgets for PageApp and
DocApp live in `packages/pages-ui/tests/budget.test.ts`; the DeckApp entry and
Debug for agents chunk caps live in `packages/decks-ui/tests/bundle-size.test.ts`.

## Visual QA sweep

For shared layouts, the sweep replaces the layout-fit E2E spec that PLAN_009
removed (`tests/e2e/shell-layout.spec.ts` keeps one responsive fallback).
Layouts use the host container width, not only the browser viewport, so
exercise them inside the shells or panels they support. The sweep varies each target's manifest
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
| Scenario | the densest by name (`massive`, `scale`, `long-`, `multi-`, `power`, `busy`, `mature`, in that order), else the manifest default |

Every shot opens `?devtools=0&scenario=…&shell=…&mode=…` in a fresh browser
context with the thumbnails' readiness wait (`packages/cli/src/lib/capture/page.ts`:
`data-py-ready`, fonts, network idle, a quiet DOM, reduced motion, UTC,
`en-US`). It then records:

- the axe violation count (WCAG 2.1 A and AA; `--no-axe` skips it);
- layout flags from the layout-fit rules (kept from the removed E2E spec) that hold for every app:
  `input-off-screen` (a primary input outside the viewport that the page
  cannot scroll to), `region-does-not-scroll`, `page-overflow-stuck`;
- with `--compare <earlier sweep>`, the changed pixels per shot (both PNGs
  are decoded by `packages/cli/src/lib/capture/png.ts`, no image dependency), `new` or
  `resized`.

**Theme review.** `--themes all` (every library theme: the 64-theme catalog
and Texuli's expanded set, 204 in all) or a collection
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
pnpm visual:sweep --only ui-kit --themes all --shells none              # 2 × 204 shots
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
