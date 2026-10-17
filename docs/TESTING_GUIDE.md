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

Run `pnpm test:e2e:install` once on a new machine to install Chromium.
Run **one E2E session per machine at a time**: the Playwright web servers use
fixed ports (gallery 4329, prototypes from 4401), so two concurrent runs
collide with "port already used" or connection-refused errors.

### Verified scoped runs (evidence, re-measured at the end of the foundation build, 2026-10-17)

| Command | Selected → result |
| --- | --- |
| `pnpm test` (full) | 61 files, 510 passed + 1 skipped (the opt-in benchmark) |
| `pnpm vitest run packages/runtime` | 2 files, 33 tests, all pass |
| `pnpm vitest run prototypes/crm-demo` | 3 files, 14 passed + 1 skipped (the benchmark) |
| `pnpm vitest run packages/core/tests/core.test.ts` | 1 file, 11 tests, all pass |
| `pnpm vitest run -t "idempotent"` | 2 tests selected (509 skipped), both pass |

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
| `apps/gallery/src/**` | `apps/gallery/tests/*.test.ts` + `tests/e2e/gallery.spec.ts` | unit + E2E |
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
- Generated worlds can change silently when Faker or the SDK upgrades. That is
  what the determinism tests and `generatorVersion` exist for.

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

## Proposed (not yet verified)

- Visual regression snapshots of the demos with Playwright. Not set up.
- Per-package coverage thresholds. `pnpm test:coverage` runs (v8) but no
  floor is enforced.
