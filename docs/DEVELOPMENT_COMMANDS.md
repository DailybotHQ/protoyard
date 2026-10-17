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
| `pnpm bench:index` | Benchmark discovery and indexing over 1,000 synthetic manifests (results in `tmp/`) |
| `pnpm build:showcase` | `protoyard showcase`: the gallery plus every prototype's build as one static site in `artifacts/showcase/` |
| `pnpm preview:showcase` | Serve the built showcase (`showcase --skip-build --serve`) |
| `pnpm thumbnails [slug…] [--check]` | Capture gallery thumbnails from real builds with Playwright into `prototypes/<slug>/public/thumbnail.png` |
| `pnpm hygiene` | Public-hygiene check over tracked files (secrets, tokens, stray files) |
| `pnpm check` | `lint` + `typecheck` + `test` |

## The `protoyard` CLI (`pnpm protoyard <command>`)

| Command | What it does |
| --- | --- |
| `help`, `--version` | Usage and version |
| `doctor` | Check Node, pnpm, installed deps, layout, templates, git, Playwright browsers and provider CLIs (never prints secrets) |
| `index [--quiet]` | Scan `prototypes/*/protoyard.json` and `templates/*/protoyard.json` **without executing code**, write `.protoyard/registry.json` (incremental cache) |
| `list [--kind prototype\|template\|all]` | Table of entries from the registry |
| `new <slug> --template <name> [--name] [--description] [--force] [--no-install]` | Copy a template into `prototypes/<slug>`, rewrite id, slug, name and namespace, link it and re-index. Refuses existing non-empty folders. |
| `dev <slug> [--port] [--host]` | Start **only** that prototype's Vite dev server (HMR, DevTools on). `--host` exposes it on the LAN for phones. |
| `validate <slug> [--skip-typecheck] [--build]` | Manifest schema, folder contract, package name, scenario ids, schema version, svelte-check, optional production build |
| `build <slug> \| --all [--base] [--include-devtools] [--offline] [--out <dir>] [--allow-external-out]` | Production build into `artifacts/<slug>/dist` + `build-manifest.json`. DevTools are excluded unless requested. `--out` is allow-listed (under `artifacts/`); `--allow-external-out` permits a new or empty folder outside the repository. `--offline` adds the service worker. |
| `showcase [--base] [--out] [--allow-external-out] [--no-devtools] [--include-templates] [--offline] [--serve] [--skip-build]` | Gallery + every prototype (optionally templates) as one static site in `artifacts/showcase/`. DevTools are included by default (demo site). |
| `export <slug> [--base] [--include-devtools] [--offline] [--skip-build]` | Build, then zip into `artifacts/<slug>/<slug>.zip` (prints size and sha256, checks isolation) |
| `preview <slug> [--port] [--strict-port] [--host]` | Serve the built artifact like a static host |
| `publish <slug> --provider cloudflare\|netlify\|vercel\|static [--project] [--preview\|--production] [--dry-run]` | Build, verify and deploy through a provider adapter. `--dry-run` contacts no provider. `--production` requires `--yes`. |
| `scenario list <slug>` | Scenario ids and names (static) |
| `scenario validate <slug>` | Run the generator for every scenario and check integrity (**executes local prototype code**) |
| `snapshot list <slug>` | Snapshot files committed in the prototype folder, validated |
| `gallery` | What `pnpm dev` runs |
| `control-server` | Only the local control API used by the gallery |

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
tests, a gallery build, a prototype build/export and Playwright with
Chromium (see `.github/workflows/`).
