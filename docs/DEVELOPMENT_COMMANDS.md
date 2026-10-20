# Development Commands

The authoritative command reference. Run everything from a Protoyard monorepo
or marked consumer workspace with pnpm 11 and Node 24+ (`corepack enable` once).
Every `protoyard` command
accepts `--json` (envelope `{ ok, command, data?, error? }`) and returns
meaningful exit codes: 0 ok · 1 failure · 2 usage · 3 not found ·
4 validation · 5 provider/auth.

## Workspace

The CLI discovers the nearest ancestor containing `pnpm-workspace.yaml` as a
`monorepo`, or a `package.json` with a `protoyard` field or non-empty npm
`workspaces` declaration as a `consumer` workspace. `--root <dir>` and
`PROTOYARD_ROOT` still select an existing directory explicitly; paths are
canonicalized before containment checks. `doctor` reports the detected layout
and checks monorepo-only templates and registry files only for monorepos.

| Command | What it does |
| --- | --- |
| `pnpm install` | Install and link every workspace package (honors `minimumReleaseAge`) |
| `pnpm dev` | `protoyard gallery`: index, start the 127.0.0.1 control server, run the gallery in dev |
| `pnpm dev:create` | `protoyard gallery --allow-create`: the same, with the marketplace's create flow turned on (`POST /api/new` writes files and runs code; per-run token, allowed origins only) |
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
| `pnpm exec tsx scripts/bench-charts.ts [--runs 3] [--check] [--skip-browser] [--skip-bundles]` | Charts benchmark: Node scale/LTTB/path timings, a Chromium 10k-point render with hover latency and long tasks on the ui-kit stress demo (`#/c/chart-stress`), and per-family subpath sizes from a real Vite build. Build `ui-kit` first (`pnpm protoyard build ui-kit`). Writes `tmp/bench-charts.json`; `--check` exits 1 when a threshold is missed. See [CHARTS.md](CHARTS.md). |
| `pnpm exec tsx scripts/bench-grid.ts [--rows 100000] [--runs 3] [--check] [--skip-build]` | 100k-row data grid benchmark on the ui-kit grid demo: first render, DOM rows, long tasks and dropped frames during a 5 s scroll (JSON in `tmp/`). `--check` gates locally; on CI it reports only until calibrated. |
| `pnpm exec tsx scripts/bench-idea.ts [--runs 3] [--check] [--ci-factor 3]` | Brief → seeded first paint in isolated workspaces under `tmp/`, with and without the install step (report in `tmp/`). Null budgets are report-only. See [PERFORMANCE.md](PERFORMANCE.md). |
| `pnpm visual:sweep [--only a,b] [--shells a,b] [--themes all\|<collection>\|a,b] [--route /path] [--templates] [--skip-build] [--no-axe] [--concurrency N] [--compare <dir>] [--out <dir>]` | Visual QA sweep (`scripts/visual-sweep.ts`): screenshots every prototype (and with `--templates`, every template demo) per shell × layout × light/dark × desktop/phone, with axe counts and layout-fit flags, into a static contact sheet at `tmp/visual-sweep/index.html`. `--themes all\|<collection>` reviews library themes (one screen per target, light and dark); `--compare` counts changed pixels against an earlier sweep. Flags are for review, not a gate; exit 1 only when a shot fails to capture. |
| `pnpm exec tsx scripts/import-avatars.ts [--src <dir>] [--check] [--dry-run]` | Re-encode the owner's fictional portraits into `packages/avatars` (WebP 64/128 px + manifest). `--check` verifies the committed files byte for byte and writes nothing. See [AVATARS.md](AVATARS.md). |
| `pnpm build:showcase` | `protoyard showcase --site https://protoyard.app`: the gallery plus every prototype's and template's build as one static site in `artifacts/showcase/`, with canonical links, social cards and a sitemap for the official site |
| `pnpm build:packages` | Build every publishable package to `dist/` (ESM JS, declarations; `svelte-package` for Svelte packages). Being implemented in PLAN_004; the repository itself never needs it |
| `pnpm check:packages [--json] [--require-all] [--filter <name>] [--max-bytes <n>] [--root <dir>]` | Pack every publishable package (`packages/*`, `apps/gallery`; never `private`) with `pnpm pack` and lint the tarball: publint (strict), arethetypeswrong (`esm-only`), no tests, fixtures, snapshots or `.env`, TypeScript source only as a declaration-map target, no `workspace:`/`link:`/`file:` and no install scripts in the packed manifest, a 5 MiB cap and the lockstep version. Packages without `publishConfig` are `pending` (manifest checks only) and fail only with `--require-all`. Exit 0 ok, 1 violation, 2 usage |
| `pnpm verify:packages` | Pack every package to tarballs and prove a fresh workspace works from them, with no registry. Being implemented in PLAN_004 |
| `pnpm changeset` | Describe a change for the next release: pick packages and the bump. Every public package (`@protoyard/*`, `protoyard`, `create-protoyard`) is in one Changesets `fixed` group, so all bump together ([.changeset/README.md](../.changeset/README.md)) |
| `pnpm version-packages [--check]` | Apply pending changesets (`changeset version`, per-package CHANGELOG.md), then set the root `package.json` version to the lockstep version that `release.yml` compares with the tag. `--check` only verifies that the public packages and the root agree. The root CHANGELOG.md stays hand-curated. Exit 0 in sync, 1 disagreement, 2 usage |
| `pnpm preview:showcase` | Serve the built showcase (`showcase --skip-build --serve`) |
| `pnpm thumbnails [slug…] [--check]` | Capture gallery thumbnails from real builds with Playwright for every prototype and template into `prototypes/<slug>/public/thumbnail.png` or `templates/<name>/public/thumbnail.png`, and set the manifest's `thumbnail`. `protoyard new` drops the source's thumbnail, so run it for a new prototype |
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
| `blueprint new <file> --from-brief <file\|-> \| --interactive [--archetype <id>] [--name] [--force] [--generate <slug>] [--dry-run] [--no-install]` | Write a validated blueprint from a product brief, offline and deterministic (no model or network call), and optionally run `generate <slug>` with it. `--from-brief -` reads stdin; `--interactive` asks a few questions on a terminal; `--dry-run` writes nothing (with `--generate`, it plans the prototype only). See [BRIEF_TO_PROTOTYPE.md](BRIEF_TO_PROTOTYPE.md). |
| `dev <slug> [--port] [--host]` | Start **only** that prototype's Vite dev server (HMR, DevTools on). Templates run as live demos under the `template-demo-<slug>` storage namespace. `--host` exposes it on the LAN for phones. |
| `validate <slug> [--skip-typecheck] [--build] [--strict-spec]` | Manifest schema, folder contract, package name, scenario ids, schema version, database versions, the prototype spec (missing `AGENTS.md`/`docs/` files warn, or fail with `--strict-spec`; stale generated regions fail), svelte-check, optional production build. Also reports the marketplace `catalog` block (warns when a template has none), and warns on unknown theme ids (`defaultTheme`, scenario `appearance.themeId`) with the closest known ids. |
| `spec <slug> \| --all [--init] [--write\|--check] [--bundle]` | Keep `AGENTS.md` and `docs/` generated regions in sync with the prototype (**executes local prototype code** in a child process). `--init` creates missing skeletons, `--write` refreshes regions only, `--check` exits 4 when a region is stale, `--bundle` writes `artifacts/<slug>/<slug>-rebuild-kit.zip`. See [SPECS.md](SPECS.md). |
| `build <slug> \| --all [--base] [--include-devtools] [--offline] [--out <dir>] [--allow-external-out]` | Production build into `artifacts/<slug>/dist` + `build-manifest.json`. DevTools are excluded unless requested. `--out` is allow-listed: anything under `artifacts/` or `tmp/`; elsewhere in the workspace only a missing, empty or previously marked output folder; never source/tooling folders or symlinks. `--allow-external-out` permits the same (missing, empty or marked) outside the repository. `--offline` adds the service worker. |
| `budget <slug> \| --all [--skip-build]` | Build (or read `build-manifest.json` with `--skip-build`) and check initial JS and CSS gzip against `protoyard.budgets.json`; exits 4 when a budget is exceeded |
| `showcase [--base] [--site <origin>] [--out] [--allow-external-out] [--no-devtools] [--no-templates] [--offline] [--serve] [--skip-build] [--port] [--strict-port] [--host] [--publish cloudflare [--project] [--branch] [--dry-run]]` | Gallery and marketplace + a live demo of every prototype and template (templates in the `template-demo-<name>` namespace; `--no-templates` for prototypes only) as one static site in `artifacts/showcase/`. DevTools are included by default (demo site). `--publish cloudflare` deploys the finished site as one Pages project and refuses when a prototype failed to build; with `--comments [d1\|kv]` it adds one shared comments worker at the site root. `--target artifact [--slugs a,b]` packs the gallery and the selected demos (base `./`) for one Claude artifact under `artifacts/showcase/artifact/` ([PUBLISHING.md](PUBLISHING.md#the-showcase-as-one-artifact)). |
| `export <slug> \| --all [--base] [--include-devtools] [--offline] [--skip-build]` | Build, then zip into `artifacts/<slug>/<slug>.zip` (prints size and sha256, checks isolation). `--all` exports every prototype (never templates), continues past failures and exits 1 if any failed. |
| `export <slug> --target artifact [--dry-run] [--skip-build] [--no-devtools] [--comments]` | Build for a Claude artifact (DevTools included unless `--no-devtools`, explicit shell frame when embedded, base `./`) into `artifacts/<slug>/artifact-dist` (never the plain `dist/`), check isolation, then pack `artifacts/<slug>/artifact/` (`page.html`, assets, `artifact-manifest.json` with sizes, sha256 and publish batches). `--comments` declares the shared review-comment capabilities; `--dry-run` checks every artifact rule without writing the pack; exit 4 lists every broken rule. The CLI never publishes ([PUBLISHING.md](PUBLISHING.md#sharing-as-a-claude-artifact)). |
| `artifact record <slug> --url <url>` | Record the URL the Claude Artifact tool returned, after checking that the local pack still matches its manifest file by file; refuses URLs that are not Claude artifact URLs and credential-looking fields. Appends to `artifacts/share/ledger.jsonl` (private visibility at entry time). |
| `artifact list` | The latest recorded artifact share per prototype, from the share ledger |
| `preview <slug> [--port] [--strict-port] [--host]` | Serve the built artifact like a static host |
| `publish <slug>… \| --all \| --tag <tag> --provider cloudflare\|netlify\|vercel\|static [--project] [--branch] [--preview\|--production] [--dry-run] [--ensure-project] [--base] [--include-devtools] [--offline]` | Build, verify and deploy through a provider adapter, one target after another (continues past failures). `--dry-run` contacts no provider. `--production` requires `--yes`. `--branch` sets the Cloudflare preview branch; `--ensure-project` creates the Cloudflare Pages project when missing (shown on dry-run). Every completed publish is appended to `artifacts/publish/ledger.jsonl`. `--comments [d1\|kv]` (Cloudflare) adds shared review comments: it writes `dist/_worker.js` and prints the one-time Wrangler setup, which it never runs ([PUBLISHING.md](PUBLISHING.md#shared-review-comments-on-cloudflare-pages---comments)). |
| `publish --history [<slug>…] [--provider <p>] [--limit <n>]` | Print the last recorded publishes from the ledger (provider-printed URLs only, never credentials) |
| `review-index [--from-ledger \| --slugs a,b] [--ledger <file>] [--out] [--allow-external-out] [--base] [--title] [--provider <p>] [--no-personas] [--serve [--port] [--strict-port]] [--publish <provider> [--project] [--dry-run] [--production] [--allow-publish-out]]` | One static, script-free team review page (`artifacts/review/`) linking real deployments with scenario and persona links; undeployed prototypes show the publish command. It also reads the Claude artifact share ledger: `--from-ledger` includes prototypes with a recorded deployment or a recorded artifact share, and artifact links are labeled private. `--publish` deploys it through a provider adapter; production requires `--yes`. It uploads only `artifacts/review` unless `--allow-publish-out`, never a folder holding the deploy ledger, and refuses stray files. |
| `ci init [--provider github] [--with check,build,e2e,preview] [--deploy cloudflare] [--prototypes <csv>] [--dry-run] [--force]` | Render versioned workflows into `.github/workflows/`. Prints secret names only and never changes repository settings. `--prototypes` must be registry slugs. `--dry-run` shows diffs and writes nothing. |
| `ci check [--provider github] [--strict]` | Report scaffolded `protoyard-*.yml` as up-to-date, outdated, modified, unhashed or unmanaged; `--strict` exits 4 on drift. Reads only. |
| `scenario list <slug> [--details]` | Scenario ids and names (static; `--details` runs local code) |
| `scenario validate <slug> [-s <id>]` | Run the generator for every scenario and check integrity (**executes local prototype code**) |
| `scenario bench <slug> [-s <id>] [--runs 3] [--check] [--ci-factor <n>]` | Median generation + integrity time and row counts per scenario; `--check` exits 4 over `generateMs` (× `--ci-factor`) |
| `comments pull <slug> (--from <url> \| --file <json>) --format md\|json [--out <file>]` | Pull review comments from a comments endpoint (GET only) or a local adapter export; writes an escaped, screen-grouped `prototypes/<slug>/docs/REVIEW.md` and a timestamped `artifacts/review-comments/comments/<slug>.json` (outside `artifacts/review/`, the folder `review-index --publish` uploads). See [REVIEW_COMMENTS.md](REVIEW_COMMENTS.md). |
| `comments export <slug> [--out <file>]` | Write the last pulled comments in the local adapter JSON format (default `artifacts/review-comments/exports/<slug>.json`) |
| `comments import <slug> <file>` | Import a local adapter JSON export into the workspace comments cache |
| `theme list [--collection <collection>] [--search <query>]` | Built-in (6) and library (64) themes, filtered by library collection (`industry`, `mono`, `high-contrast`, `brand-like`, `colorblind-safe`, `seasonal`) and a deterministic search over names, ids, tags, moods and descriptions |
| `theme show <theme-id>` | Light and dark swatches with WCAG text and UI contrast checks for a built-in or library theme |
| `theme use <slug> <theme-id> [--dry-run]` | Set only `defaultTheme` in the prototype's validated `protoyard.json`; `--dry-run` prints the change without writing |
| `theme create <slug> --id <id> --seed <hex> [--secondary <hex>] [--name] [--from <file>] [--force] [--dry-run]` | Write a typed `src/theme.ts` into a prototype from a brand seed color (or a theme JSON file) |
| `theme import <slug> <file> [--force] [--dry-run]` | Write a validated JSON theme into a prototype |
| `theme export <id> \| --from <file> [--format css\|tailwind\|tokens]` | Export a built-in, library or custom JSON theme as CSS variables (default), Tailwind tokens or W3C design tokens |
| `snapshot list <slug>` | Snapshot files committed in the prototype folder, validated |
| `gallery [--port] [--control-port] [--allow-origin <origins>] [--allow-create]` | What `pnpm dev` runs. `--allow-create` turns on the marketplace's create flow (`POST /api/new`, which writes files and runs code); it is off by default |
| `control-server [--port] [--gallery-port] [--allow-origin <origins>] [--allow-create]` | Only the local control API used by the gallery (starts prototype dev servers and template demos; with `--allow-create`, also `new --from`) |

Target commands (`dev`, `validate`, `build`, `budget`, `export`, `preview`,
`publish`, `scenario`, `snapshot`) also accept template names; template artifacts go to
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
`PROTOYARD_BUILT_AT`, `PROTOYARD_OFFLINE`, `PROTOYARD_STORAGE_NAMESPACE`
(template live demos), `PROTOYARD_FRAME_WHEN_EMBEDDED` (the artifact target)
and, for avatar images, `PROTOYARD_AVATARS`, `PROTOYARD_AVATAR_BASE` and
`PROTOYARD_AVATAR_SIZES`. Review comments are opt-in per build:
`PROTOYARD_REVIEW=1` turns them on (like `build.review.enabled` in the
manifest), and `PROTOYARD_REVIEW_ADAPTER=local|http|cloudflare|artifact` (with
`PROTOYARD_REVIEW_ENDPOINT`) selects the backend for one build, validated like
`build.review` ([REVIEW_COMMENTS.md](REVIEW_COMMENTS.md)).

## Where commands run

Every command above runs locally on macOS, Linux and Windows. None needs
Docker. `publish` with a real provider needs that provider's CLI and your
own authentication (`wrangler login`, …). CI runs lint, typecheck, unit
tests, a gallery build, a prototype build/export, Playwright with
Chromium and a performance job (bundle budgets, index and scenario
generation gates; cold start report-only), see `.github/workflows/` and
[PERFORMANCE.md](PERFORMANCE.md).
