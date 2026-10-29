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
| `pnpm build:packages [--json] [--root <dir>] [--filter <package>[,<package>…]]` | Build opted-in workspace packages to clean `dist/` directories in dependency order (siblings run in parallel), using `tsc -p tsconfig.build.json` or `svelte-package`; declared non-code assets are copied, `dist/` folders listed in `protoyard.build.keep` survive the clean, and a package's `protoyard.build.postBuild` script runs after its compile (the player builds its app into `dist/app/`). A workspace opts in with `protoyard.build.assets` plus one build config. `--filter` takes a package name, a path or a build group: a declared `protoyard.build.group` (`engine`) or `svelte`; an unknown or empty group is an error. A dependency cycle builds as one level and is reported. With no opted-in packages it succeeds as a no-op |
| `pnpm check:packages [--json] [--require-all] [--filter <name>] [--max-bytes <n>] [--root <dir>]` | Pack every publishable package (`packages/*`, `apps/gallery`; never `private`) with `pnpm pack` and lint the tarball: publint (strict), arethetypeswrong (`esm-only`), no tests, fixtures, snapshots or `.env`, TypeScript source only as a declaration-map target, no `workspace:`/`link:`/`file:` and no install scripts in the packed manifest, a 5 MiB cap and the lockstep version. It also requires every `protoyard.pack.required` path, refuses sources whose outputs differ only by case, and refuses a component declaration that imports its own name. The public-hygiene rules run over every packed file (secrets, `.env` and key files, home paths, also inside source maps, and real emails) and are reported as `path:line: rule`. The one named attw exception, `svelte-component-declaration`, is counted in the report ([PACKAGES.md](PACKAGES.md#attw-and-svelte-components)). Packages without `publishConfig` are `pending` (manifest checks only) and fail only with `--require-all`. Run `pnpm build:packages` first. The release gate and CI use `--require-all`; today all 31 publishable packages pass it. Exit 0 ok, 1 violation, 2 usage |
| `pnpm verify:packages [--pm pnpm\|npm] [--budget-parity]` | Build the packages (`build:packages`), pack every publishable one and prove a fresh consumer workspace works from the tarballs with no registry: `create-protoyard`, install, `new`, `validate --build`, `export`, `index` and the gallery, checking each JSON envelope. `--pm npm` repeats it with npm's default peer handling (only `--ignore-scripts`, for the harness's local folder dependencies); `--budget-parity` compares the packed starter's bundle with the source build. |
| `pnpm changeset` | Describe a change for the next release: pick packages and the bump. Every public package (`@protoyard/*`, `protoyard`, `create-protoyard`) is in one Changesets `fixed` group, so all bump together ([.changeset/README.md](../.changeset/README.md)) |
| `pnpm version-packages [--check]` | Apply pending changesets (`changeset version`, per-package CHANGELOG.md), then set the root `package.json` version to the lockstep version that `release.yml` compares with the tag. `--check` only verifies that the public packages and the root agree. The root CHANGELOG.md stays hand-curated. Exit 0 in sync, 1 disagreement, 2 usage |
| Release to npm | No package is on npm yet. A `v*` tag runs `release.yml`: the gate (tag and changelog, no pending changesets, hygiene, skill version stamp and smoke install, `version-packages --check`, `pnpm check`, `build:packages`, `check:packages --require-all`, `verify:packages`, gallery and prototype builds), then the `npm` job publishes every public package with Trusted Publishing and `--provenance` (dist-tag `next` for prereleases), then the GitHub Release. The tag push and the `npm` environment approval are the developer's consent checkpoint, and agents stop at `publish --dry-run`. Runbook: [PUBLISHING.md](PUBLISHING.md#releasing-the-packages-to-npm) |
| `bash scripts/check-create-anything.sh` | End-to-end proof that Protoyard creates anything on the Texuli it installs: in a throwaway git worktree of HEAD it scaffolds and builds every template, generates and builds one prototype per kind (app, deck, page, doc), turns a brief into a built prototype, and exports a quick exploration of each kind as one file. One line per step and a summary; exit 0 when every step passes. `PROTOYARD_CREATE_KEEP=1` keeps the worktree |
| `pnpm check:skill` | Check the distributable skill in `skills/protoyard/`: frontmatter (`scripts/validate-skill-frontmatter.ts`), every `protoyard` command and flag against the real CLI and the strict command reference (`scripts/check-skill-cli.ts`), local Markdown links that must not escape the pack, with no external fetch (`scripts/validate-skill-links.ts`), and the `SHA256SUMS` integrity check (`scripts/verify-skill-integrity.sh`). See [SKILL.md](SKILL.md) |
| `pnpm check:integrations [-- --run-tests]` | The integration surface gate (`scripts/validate-integrations.ts`): commands and flags in [INTERFACE.md](INTERFACE.md), [MCP.md](MCP.md), [DWP.md](DWP.md) and `integrations/**/*.md` against the real CLI, the MCP tool table against the server's tools, the addon packet files, JSON and descriptor, relative links, and no absolute local paths. `-- --run-tests` also runs every integration test file in one Vitest run and fails on an empty selection ([TESTING_GUIDE.md](TESTING_GUIDE.md#integration-surface)) |
| `npx tsx scripts/blocks-reference.ts [--check]` | Regenerate (or check) the generated block reference region in `docs/BLOCKS.md` |
| `pnpm exec tsx scripts/sweep-deck.ts [--blueprint <file>] [--out tmp/deck-sweep] [--port N]` | Built-deck visual QA sweep on a private port, screenshots under `tmp/deck-sweep` |
| `pnpm --filter @protoyard/player build && pnpm exec tsx scripts/bench-player.ts --runs 3 --kinds app,deck,page,doc` | Report-only ready-time sample by kind (`tmp/bench-player-*.json`) |
| `pnpm exec tsx scripts/bench-brief-kinds.ts --runs 3` | Report-only brief synthesis sample by kind (`tmp/bench-brief-kinds-*.json`) |
| `PROTOYARD_E2E_DECK=1 pnpm exec playwright test deck-navigation deck-presenter interaction-sweep` | Built-deck browser E2E: navigation, presenter and print, dead-control sweep |
| `pnpm exec playwright test tests/e2e/deck-artifact.spec.ts tests/e2e/artifact-pack.spec.ts` | Claude artifact harness for a deck and an app (packs, opens and checks the single-chunk artifact) |
| `pnpm --filter @protoyard/player build\|dev\|preview` | Build the prebuilt player into `packages/player/dist/app/` (static, base `./`), run it with Vite, or serve the build. In this repository `quick` materializes its shared player from that build; `showcase` builds its own copy for `/player/` and `/play/`. See [PLAYER.md](PLAYER.md) |
| `pnpm exec tsx scripts/bench-player.ts [--runs 3] [--blueprints crm,clinic] [--no-large]` | Blueprint-to-ready time in the built player (build it first) for 5 catalog blueprints and the large fixture: first visit, repeat visit, scenario switch with a cache miss and a cache hit, in fresh headless Chromium contexts. Writes `tmp/bench-player-<timestamp>.json`; report-only, no budget. No root script |
| `pnpm exec tsx scripts/bench-integrations.ts [--runs 3]` | Local CLI startup and MCP startup and round-trip latency; writes `tmp/bench-integrations-<timestamp>.json` ([PERFORMANCE.md](PERFORMANCE.md)) |
| `pnpm exec tsx scripts/stamp-skill-version.ts <version> [--check\|--dry-run]` · `bash scripts/generate-skill-checksums.sh` | Stamp (or check) the version in every distributable `SKILL.md`, and regenerate the root `SHA256SUMS` for `skills/protoyard/`. Release steps; see [SKILL.md](SKILL.md) |
| `bash scripts/upgrade-skill.sh --host <host> --from <checkout> [--tag vX.Y.Z] [--home <dir>] [--sums <file>] [--allow-downgrade] [--yes]` | Consent-gated upgrade of an installed skill from a local checkout of the selected release. Without `--yes` it only reports; it never fetches anything |
| `skills/protoyard/setup.sh --host <host> [--home <dir>] [--link] [--replace] [--dry-run]` · `--verify [--sums <file>] [--dir <dir>]` · `--list-hosts` | Install the skill into one host's user-level skill folder (claude, cursor, codex, gemini, copilot, opencode, windsurf), verify a pack against `SHA256SUMS`, or list the hosts. Exit 0 done, 1 failed, 2 usage, 3 refused (existing destination) |
| `node packages/create-protoyard/bin/create-protoyard.mjs <dir> [-t <template>] [--pm pnpm\|npm] [--no-install] [--no-git] [-y] [--json] [--skill]` | The scaffolder behind `npm create protoyard`, run from the repository until it is published: a new or empty folder with a pinned `protoyard`, the workspace marker and a starter prototype. Exit 0 created, 1 failed or not empty, 2 usage or unsafe path, 3 unknown template |
| `pnpm preview:showcase` | Serve the built showcase (`showcase --skip-build --serve`) |
| `pnpm thumbnails [slug…] [--check]` | Capture gallery thumbnails from real builds with Playwright for every prototype and template into `prototypes/<slug>/public/thumbnail.png` or `templates/<name>/public/thumbnail.png`, and set the manifest's `thumbnail`. `protoyard new` drops the source's thumbnail, so run it for a new prototype. The capture helpers live in `packages/cli/src/lib/capture/` (shared with `quick shot` and the visual sweep) |
| `pnpm covers [name…]` | Capture the covers of the deck, page and doc examples the gallery shows (home page and `/features/`) from the real player, plus stills of the flagship deck's capability slides, into `apps/gallery/public/examples/`. The list lives in `apps/gallery/src/lib/content-examples.ts`; builds the player first when it is missing |
| `pnpm hygiene` | Public-hygiene check over tracked files (secrets, tokens, stray files) |
| `pnpm check` | `lint` + `typecheck` + `test` |

## The `protoyard` CLI (`pnpm protoyard <command>`)

| Command | What it does |
| --- | --- |
| `help`, `--version` | Usage and version. `pnpm protoyard help <command>` (or `<command> --help`) prints one command's flags. `--version --json` prints `{"version","interface"}` (the interface major, see [INTERFACE.md](INTERFACE.md)) and exits 0 anywhere, with no workspace. |
| `doctor [--offline]` | Check Node, pnpm, installed deps, layout, templates, git, Playwright browsers and provider CLIs (never prints secrets). `--json` adds top-level `interface` and `capabilities` (the implemented capability ids) on every outcome ([INTERFACE.md](INTERFACE.md)) |
| `mcp` | Serve the Model Context Protocol over newline-delimited stdio JSON-RPC for a local MCP client, in the workspace where it starts; no network endpoint. Tools, protocol revisions and boundaries: [MCP.md](MCP.md) |
| `index [--force] [--quiet]` | Scan `prototypes/*/protoyard.json`, `templates/*/protoyard.json` and `blueprints/*.json` **without executing code**, write `.protoyard/registry.json` (incremental cache) |
| `list [--kind prototype\|template\|blueprint\|all] [--tag] [--category] [--platform] [--search] [--sort name\|modified]` | Table of entries from the registry. `--kind blueprint` lists the catalog in `blueprints/`; `all` (the default) lists everything. |
| `affected --since <ref> [--format text\|csv]` | Prototype slugs touched by `git diff <ref>...HEAD`: `prototypes/<slug>/**` → that slug; `packages/`, `templates/`, root configs → all; docs-only → none. `csv` prints a bare list for CI. |
| `new <slug> --template <name> \| --from <template\|prototype> [--name] [--description] [--force] [--no-install]` | Copy a template, or remix an existing prototype, into `prototypes/<slug>` with a fresh id, name and storage namespace; fill the spec regions, link it and re-index. Never overwrites; `--force` only reuses an empty folder. |
| `generate <slug> --blueprint <file> [--template crud-app] [--name] [--description] [--dry-run] [--force] [--allow-drop] [--no-install]` | Create `prototypes/<slug>` from a data-only blueprint (on the `crud-app` template). Re-running it on a generated prototype regenerates: untouched generated files are rewritten, hand-edited ones are refused unless `--force`, and storage changes append a schema version (drops need `--allow-drop`, which deletes that data). `--dry-run` lists or plans the files and writes nothing. Exit 1 on a conflict (hand-edited generated files), 4 when the blueprint is invalid or the change would lose data. See [GENERATOR.md](GENERATOR.md). |
| `blueprint validate <file>` | Validate a blueprint JSON file; exit 4 with path-specific issues |
| `blueprint new <file> --from-brief <file\|-> \| --interactive [--archetype <id>] [--name] [--force] [--generate <slug>] [--dry-run] [--no-install]` | Write a validated blueprint from a product brief, offline and deterministic (no model or network call), and optionally run `generate <slug>` with it. `--from-brief -` reads stdin; `--interactive` asks a few questions on a terminal; `--dry-run` writes nothing (with `--generate`, it plans the prototype only). See [BRIEF_TO_PROTOTYPE.md](BRIEF_TO_PROTOTYPE.md). |
| `quick "<brief>" \| - \| --blueprint <file> [--kind app\|deck\|page\|doc] [--slug] [--name] [--out <dir> [--allow-external-out]] [--seed <n>] [--variants <1-8>] [--standalone] [--no-store-brief] [--force]` | A disposable, playable exploration with no build and no install: writes `.protoyard/quick/<slug>/` (blueprint, `quick.json`, launcher) on the shared, sha256-verified prebuilt player (`.protoyard/quick/_player/<version>/`). `--variants N` adds deterministic `v1/`…`vN/` and `compare.html`; `--standalone` copies the player into the folder; `--screenshot [--phone]` also captures PNGs (needs Playwright, skipped without it). See [QUICK.md](QUICK.md). |
| `quick serve <slug\|dir> [--port 4180] [--strict-port] [--open]` | Serve an exploration on 127.0.0.1 until Ctrl+C (marked explorations only); the envelope has the launcher URL. |
| `quick open <slug> [--port 4180] [--strict-port]` | Serve an exploration by slug and open it in the browser |
| `quick list` · `quick index` | List the marked explorations, newest first, or write a static `index.html` in the quick zone that links every exploration |
| `quick shot <slug\|dir> [--phone]` | Capture a PNG of the exploration and each variant at 1280×800 (and 390×844 with `--phone`); needs Playwright |
| `quick export <slug\|dir> [--single-file] [--target artifact [--url <url>]] [--out <file>] [--force]` | Export one self-contained HTML file (player and blueprint inlined), or pack it as a Claude artifact page in `<exploration>/artifact/`; `--url` records the URL the Artifact tool returned. Never publishes |
| `quick iterate <slug\|dir> --patch <file\|-> [--allow-drop]` · `quick undo <slug\|dir>` | Apply an RFC 6902 JSON Patch to the blueprint atomically, with undo history (512 KB at most; dropping entities or fields needs `--allow-drop`), or restore the blueprint from before the last iterate, byte for byte |
| `quick report <slug\|dir> [--import <files…>]` | Aggregate validation sessions per variant and task into `report.json` and `REPORT.md`, from metrics files the player downloaded. Covers the current blueprint, the recorded variants and earlier base blueprints kept in the `quick iterate` history (marked as earlier versions) |
| `quick feedback <slug\|dir> [--import <file>]` | Write `REVIEW.md` and `REVIEW.json` from the served comments and an exported comments file. Covers the current blueprint, the recorded variants and earlier base blueprints kept in the `quick iterate` history (marked as earlier versions) |
| `quick promote <slug\|dir> <new-slug> [--variant <v1-v8>] [--no-install]` | Turn an exploration (or one variant) into a full prototype in `prototypes/<new-slug>` through `generate`; never an existing prototype |
| `quick prune [--older-than 14d] [--yes] [--force]` | List explorations not updated for the given age (`14d`, `36h`, `2w`) and remove them only with `--yes` (`CI=1` alone never removes); promoted ones are kept, and `--force` also removes those with comments newer than their `REVIEW.md` |
| `dev <slug> [--port] [--host]` | Start **only** that prototype's Vite dev server (HMR, DevTools on). Templates run as live demos under the `template-demo-<slug>` storage namespace. `--host` exposes it on the LAN for phones. In a deck made from the deck template, it rewrites `src/brand-theme.ts` whenever the `brand` in `src/blueprint.json` changes, reported on stderr (one JSON line per event with `--json`); never through a symlink ([KINDS](KINDS.md#editing-a-decks-brand)). |
| `validate <slug> [--skip-typecheck] [--build] [--strict-spec] [--check]` | Manifest schema, folder contract, package name, scenario ids, schema version, database versions, the prototype spec (missing `AGENTS.md`/`docs/` files warn, or fail with `--strict-spec`; stale generated regions fail), svelte-check, optional production build. Also reports the marketplace `catalog` block (warns when a template has none), and warns on unknown theme ids (`defaultTheme`, scenario `appearance.themeId`) with the closest known ids. In a deck made from the deck template, a stale `src/brand-theme.ts` is rewritten from the blueprint `brand` and reported as a warning (`brand-theme` check); with `--check`, in CI (`CI` set) or on the deck template itself nothing is written and a stale module fails with the fix. A symlinked `src/` or module is never written through: the check fails ([KINDS](KINDS.md#editing-a-decks-brand)). |
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
| `deck schema` | Print the deck JSON Schema (`DeckJsonSchema`, draft 2020-12); text mode prints pure JSON, so it can be piped |
| `deck layouts [id]` | The 21 deck layouts with use-when guidance, limits and a valid sample slide; one id adds its props schema; an unknown id exits 3 with the closest ids |
| `deck blocks [type]` | The block catalog for free slides (34 types): use-when, limits, accessibility and examples; one type adds a rich example |
| `deck lint <file\|slug>` | Authoring lint for a deck blueprint, a bare deck file or a deck prototype: rule, severity, slide id, JSON pointer, what to change and why; exit 4 on errors, warnings alone pass. Rendered checks are listed and left to the visual sweep |
| `deck inspect [file\|slug] --ref "<line>" \| --slide <id>` | Resolve a `[slide-ref]` line pasted from the deck's Debug for agents panel, or a slide id, to the file, JSON pointer and slide JSON. A pasted `source=` resolves only inside the workspace. A missing slide or deck exits 4 with the closest slide ids |
| `deck capabilities` | What decks support at level 1 (player) and level 2 (generate): layouts, blocks, controls, quality rules and limits, read from the engine |
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

## Iterating on a prototype

The usual loop for an existing generated prototype; the skill's
[`iterate` sub-skill](../skills/protoyard/iterate/SKILL.md) explains each step
for agents.

```bash
pnpm protoyard dev <slug>                                                   # run it while you work
pnpm protoyard generate <slug> --blueprint prototypes/<slug>/blueprint.json --dry-run   # plan
pnpm protoyard generate <slug> --blueprint prototypes/<slug>/blueprint.json             # regenerate
pnpm protoyard spec <slug> --write
pnpm vitest run prototypes/<slug>
pnpm protoyard validate <slug> --build
```

Edit `blueprint.json`, never `src/generated/**`. Regeneration stops (exit 1)
on a hand-edited generated file unless `--force`, and on a dropped table or
field (exit 4) unless `--allow-drop`. A quick exploration changes through
`pnpm protoyard quick iterate <slug> --patch <file|->` and
`pnpm protoyard quick undo <slug>` instead.

## Where commands run

Every command above runs locally on macOS, Linux and Windows. None needs
Docker. `publish` with a real provider needs that provider's CLI and your
own authentication (`wrangler login`, …). CI runs lint, typecheck, unit
tests, a gallery build, a prototype build/export, Playwright with
Chromium and a performance job (bundle budgets, index and scenario
generation gates; cold start report-only), see `.github/workflows/` and
[PERFORMANCE.md](PERFORMANCE.md).
