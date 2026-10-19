# Development Commands

The authoritative command reference. Run everything from the repository root
with pnpm 11 and Node 24+ (`corepack enable` once). Every `protoyard` command
accepts `--json` (envelope `{ ok, command, data?, error? }`) and returns
meaningful exit codes: 0 ok · 1 failure · 2 usage · 3 not found ·
4 validation · 5 provider/auth.

## Workspace

| Command | What it does |
| --- | --- |
| `pnpm install` | Install and link every workspace package (honors `minimumReleaseAge`) |
| `pnpm dev` | `protoyard gallery`: index, start the 127.0.0.1 control server, run the gallery in dev |
| `pnpm build` | Index and build the static gallery |
| `pnpm preview` | Serve the built gallery |
| `pnpm lint` / `pnpm biome:check` | Biome lint + format check (full) |
| `pnpm biome:fix` | Apply safe Biome fixes |
| `pnpm typecheck` | Run every package's `typecheck` script in parallel (full) |
| `pnpm --filter <package> typecheck` | Type check one package, e.g. `@protoyard/runtime` or `@prototype/crm-demo` (scoped) |
| `pnpm test` | Vitest, every unit and integration test (full) |
| `pnpm vitest run <path>` | Tests under a path (scoped), e.g. `pnpm vitest run packages/scenarios` |
| `pnpm vitest run -t "<name>"` | Tests by name (scoped) |
| `pnpm test:coverage` | Vitest with v8 coverage over `packages/*/src` |
| `pnpm test:e2e:install` | Install Playwright Chromium (once per machine) |
| `pnpm test:e2e` | Playwright E2E. Builds and serves the gallery; add `PROTOYARD_E2E_PROTOTYPES=crm-demo,…` for prototype flows |
| `pnpm bench:index [--count 1000] [--runs 5] [--gallery] [--marketplace] [--keep] [--check [--ci-factor 3]]` | Benchmark discovery and indexing over 1,000 synthetic manifests with catalog blocks (results in `tmp/`). `--check` gates the cold and incremental medians on `indexColdMs` (`protoyard.budgets.json`) × `--ci-factor` and exits 1 when over; it needs the default `--count`. `--marketplace` builds the gallery over the 1,000 synthetic entries and measures `/marketplace/` in headless Chromium (needs `pnpm test:e2e:install`); with `--check` it is gated on `MARKETPLACE_BUDGET`. |
| `pnpm exec tsx scripts/bench-cold-start.ts <slug…> [--runs 5] [--check]` | Cold-start benchmark of built prototypes in headless Chromium (first and repeat visit to the `protoyard:ready` mark; results in `tmp/`). Build first. `--check` compares with `coldStartMs`; while that budget is `null` (not calibrated) it reports and passes. No root script yet. |
| `pnpm build:showcase` | `protoyard showcase`: the gallery plus every prototype's build as one static site in `artifacts/showcase/` |
| `pnpm preview:showcase` | Serve the built showcase (`showcase --skip-build --serve`) |
| `pnpm thumbnails [slug…] [--check]` | Capture gallery thumbnails from real builds with Playwright into `prototypes/<slug>/public/thumbnail.png` |
| `pnpm hygiene` | Public-hygiene check over tracked files (secrets, tokens, stray files) |
| `pnpm check` | `lint` + `typecheck` + `test` |

## The `protoyard` CLI (`pnpm protoyard <command>`)

| Command | What it does |
| --- | --- |
| `help`, `--version` | Usage and version. `pnpm protoyard help <command>` (or `<command> --help`) prints one command's flags. |
| `doctor [--offline]` | Check Node, pnpm, installed deps, layout, templates, git, Playwright browsers and provider CLIs (never prints secrets) |
| `index [--force] [--quiet]` | Scan `prototypes/*/protoyard.json`, `templates/*/protoyard.json` and `blueprints/*.json` **without executing code**, write `.protoyard/registry.json` (incremental cache) |
| `list [--kind prototype\|template\|blueprint\|all] [--tag] [--category] [--platform] [--search] [--sort name\|modified]` | Table of entries from the registry. `--kind blueprint` lists the catalog in `blueprints/`; `all` (the default) lists everything. |
| `affected --since <ref> [--format text\|csv]` | Prototype slugs touched by `git diff <ref>...HEAD`: `prototypes/<slug>/**` → that slug; `packages/`, `templates/`, root configs → all; docs-only → none. `csv` prints a bare list for CI. |
| `new <slug> --template <name> \| --from <template\|prototype> [--name] [--description] [--force] [--no-install]` | Copy a template, or remix an existing prototype, into `prototypes/<slug>` with a fresh id, name and storage namespace; fill the spec regions, link it and re-index. Never overwrites; `--force` only reuses an empty folder. |
| `generate <slug> --blueprint <file> [--template crud-app] [--name] [--description] [--dry-run] [--force] [--allow-drop] [--no-install]` | Create `prototypes/<slug>` from a data-only blueprint (on the `crud-app` template). Re-running it on a generated prototype regenerates: untouched generated files are rewritten, hand-edited ones are refused unless `--force`, and storage changes append a schema version (drops need `--allow-drop`, which deletes that data). `--dry-run` lists or plans the files and writes nothing. Exit 1 on a conflict (hand-edited generated files), 4 when the blueprint is invalid or the change would lose data. See [GENERATOR.md](GENERATOR.md). |
| `blueprint validate <file>` | Validate a blueprint JSON file; exit 4 with path-specific issues |
| `dev <slug> [--port] [--host]` | Start **only** that prototype's Vite dev server (HMR, DevTools on). Templates run as live demos under the `template-demo-<slug>` storage namespace. `--host` exposes it on the LAN for phones. |
| `validate <slug> [--skip-typecheck] [--build] [--strict-spec]` | Manifest schema, folder contract, package name, scenario ids, schema version, database versions, the prototype spec (missing `AGENTS.md`/`docs/` files warn, or fail with `--strict-spec`; stale generated regions fail), svelte-check, optional production build. Also reports the marketplace `catalog` block (warns when a template has none). |
| `spec <slug> \| --all [--init] [--write\|--check] [--bundle]` | Keep `AGENTS.md` and `docs/` generated regions in sync with the prototype (**executes local prototype code** in a child process). `--init` creates missing skeletons, `--write` refreshes regions only, `--check` exits 4 when a region is stale, `--bundle` writes `artifacts/<slug>/<slug>-rebuild-kit.zip`. See [SPECS.md](SPECS.md). |
| `build <slug> \| --all [--base] [--include-devtools] [--offline] [--out <dir>] [--allow-external-out]` | Production build into `artifacts/<slug>/dist` + `build-manifest.json`. DevTools are excluded unless requested. `--out` is allow-listed: anything under `artifacts/` or `tmp/`; elsewhere in the workspace only a missing, empty or previously marked output folder; never source/tooling folders or symlinks. `--allow-external-out` permits the same (missing, empty or marked) outside the repository. `--offline` adds the service worker. |
| `budget <slug> \| --all [--skip-build]` | Build (or read `build-manifest.json` with `--skip-build`) and check initial JS and CSS gzip against `protoyard.budgets.json`; exits 4 when a budget is exceeded |
| `showcase [--base] [--out] [--allow-external-out] [--no-devtools] [--no-templates] [--offline] [--serve] [--skip-build] [--port] [--strict-port] [--host] [--publish cloudflare [--project] [--branch] [--dry-run]]` | Gallery and marketplace + a live demo of every prototype and template (templates in the `template-demo-<name>` namespace; `--no-templates` for prototypes only) as one static site in `artifacts/showcase/`. DevTools are included by default (demo site). `--publish cloudflare` deploys the finished site as one Pages project and refuses when a prototype failed to build. |
| `export <slug> \| --all [--base] [--include-devtools] [--offline] [--skip-build]` | Build, then zip into `artifacts/<slug>/<slug>.zip` (prints size and sha256, checks isolation). `--all` exports every prototype (never templates), continues past failures and exits 1 if any failed. |
| `preview <slug> [--port] [--strict-port] [--host]` | Serve the built artifact like a static host |
| `publish <slug>… \| --all \| --tag <tag> --provider cloudflare\|netlify\|vercel\|static [--project] [--branch] [--preview\|--production] [--dry-run] [--ensure-project] [--base] [--include-devtools] [--offline]` | Build, verify and deploy through a provider adapter, one target after another (continues past failures). `--dry-run` contacts no provider. `--production` requires `--yes`. `--branch` sets the Cloudflare preview branch; `--ensure-project` creates the Cloudflare Pages project when missing (shown on dry-run). Every completed publish is appended to `artifacts/publish/ledger.jsonl`. |
| `publish --history [<slug>…] [--provider <p>] [--limit <n>]` | Print the last recorded publishes from the ledger (provider-printed URLs only, never credentials) |
| `review-index [--from-ledger \| --slugs a,b] [--ledger <file>] [--out] [--allow-external-out] [--base] [--title] [--provider <p>] [--no-personas] [--serve [--port] [--strict-port]] [--publish <provider> [--project] [--dry-run] [--production]]` | One static, script-free team review page (`artifacts/review/`) linking real deployments with scenario and persona links; undeployed prototypes show the publish command. `--publish` deploys it through a provider adapter; production requires `--yes`. |
| `ci init [--provider github] [--with check,build,e2e,preview] [--deploy cloudflare] [--prototypes <csv>] [--dry-run] [--force]` | Render versioned workflows into `.github/workflows/`. Prints secret names only and never changes repository settings. `--dry-run` shows diffs and writes nothing. |
| `ci check [--provider github] [--strict]` | Report scaffolded `protoyard-*.yml` as up-to-date, outdated, modified, unhashed or unmanaged; `--strict` exits 4 on drift. Reads only. |
| `scenario list <slug> [--details]` | Scenario ids and names (static; `--details` runs local code) |
| `scenario validate <slug> [-s <id>]` | Run the generator for every scenario and check integrity (**executes local prototype code**) |
| `scenario bench <slug> [-s <id>] [--runs 3] [--check] [--ci-factor <n>]` | Median generation + integrity time and row counts per scenario; `--check` exits 4 over `generateMs` (× `--ci-factor`) |
| `theme list` | Built-in (6) and library (32) themes |
| `theme create <slug> --id <id> --seed <hex> [--secondary <hex>] [--name] [--from <file>] [--force] [--dry-run]` | Write a typed `src/theme.ts` into a prototype from a brand seed color (or a theme JSON file) |
| `theme import <slug> <file> [--force] [--dry-run]` | Write a validated JSON theme into a prototype |
| `theme export <id> \| --from <file> [--format css\|tailwind\|tokens]` | Export a built-in, library or custom JSON theme as CSS variables (default), Tailwind tokens or W3C design tokens |
| `snapshot list <slug>` | Snapshot files committed in the prototype folder, validated |
| `gallery [--port] [--control-port]` | What `pnpm dev` runs |
| `control-server` | Only the local control API used by the gallery (starts prototype dev servers and template demos, and `new --from`) |

Target commands (`dev`, `validate`, `build`, `export`, `preview`, `publish`,
`scenario`, `snapshot`) also accept template names; template artifacts go to
`artifacts/templates/<name>/`. `build --all`, `export --all` and batch
`publish` cover prototypes only. Full flag details:
[packages/cli/README.md](../packages/cli/README.md).

Global flags: `--json`, `-y/--yes` (implied by `CI=1`), `--cwd <dir>`,
`--root <dir>` (or `PROTOYARD_ROOT`), `-q/--quiet`, `--no-color`.

## Inside one prototype

The CLI is the recommended entry point. These also work, from
`prototypes/<slug>/`:

| Command | Notes |
| --- | --- |
| `pnpm dev` | Plain `vite`. The config graph is erasable TypeScript, so no tsx is needed. |
| `pnpm build` | Plain `vite build` into `dist/` (the CLI uses `artifacts/<slug>/dist`) |
| `pnpm typecheck` | `svelte-check --threshold error` |

Build-time environment variables (set by the CLI, read by
`defineProtoyardConfig`): `PROTOYARD_OUT_DIR`, `PROTOYARD_BASE`,
`PROTOYARD_INCLUDE_DEVTOOLS`, `PROTOYARD_DEMO_BADGE`, `PROTOYARD_PORT`,
`PROTOYARD_BUILT_AT`.

## Where commands run

Every command above runs locally on macOS, Linux and Windows. None needs
Docker. `publish` with a real provider needs that provider's CLI and your
own authentication (`wrangler login`, …). CI runs lint, typecheck, unit
tests, a gallery build, a prototype build/export, Playwright with
Chromium and a performance job (bundle budgets, index and scenario
generation gates; cold start report-only), see `.github/workflows/` and
[PERFORMANCE.md](PERFORMANCE.md).
