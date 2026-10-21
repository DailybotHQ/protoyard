# Protoyard CLI command reference

The command map the Protoyard skill uses for examples and flag spelling. It
was taken from the real command tree (`protoyard --help` and every
`protoyard <command> --help`) of the Protoyard CLI 1.0.0 line on 2026-10-20
(source revision `b4f45af`). It covers 46 commands and subcommands, and
`pnpm check:skill` keeps every row and flag in step with the real CLI.
(source revision `b4f45af`). It covers 46 commands and subcommands.

**Verify before you act.** The CLI you have may be older or newer than this
page. Before following an example, run:

```bash
protoyard --version
protoyard <command> --help     # the flags this installed CLI really accepts
```

If a command or flag below is missing from that help, the installed CLI does
not have it: do not run it, and tell the developer which release adds it.
Inside the Protoyard repository the same CLI runs as `pnpm protoyard <command>`.

## Status legend

| Status | Meaning |
| --- | --- |
| Released (1.0.0) | In the `v1.0.0` release, with the same name and flags. |
| Released; new options marked | The command is in 1.0.0; options marked "(new)" were added after it. |
| New in PLAN_004 | Added after 1.0.0 and present in this CLI, not in 1.0.0. |
| Planned (not available) | Named in the plan but not implemented in this CLI; never run it. |

"Released" was checked by comparing every command name and `--flag` spelling
with the `v1.0.0` CLI sources.

## Global options

Every command accepts these:

| Option | Meaning |
| --- | --- |
| `-v, --version` | output the version number |
| `--json` | machine-readable output: one JSON envelope on stdout |
| `-y, --yes` | never prompt; accept documented defaults (implied by CI=1) |
| `--cwd <dir>` | run as if started in <dir> |
| `--root <dir>` | workspace root (default: nearest pnpm-workspace.yaml; env PROTOYARD_ROOT) |
| `-q, --quiet` | only print essential output |
| `--no-color` | disable colors (also NO_COLOR=1) |

With `--json`, every command prints exactly one envelope on stdout:
`{ "ok", "command", "data" }` on success or `{ "ok": false, "command", "error": { "code", "message", "hint" } }`.
`protoyard doctor --json` also carries the machine interface at the top
level, beside `ok`, `command` and `data`, on every outcome (new in PLAN_004):
`"interface": 1` and `"capabilities"`, the sorted ids this CLI implements
(`blueprint-schema`, `generate`, `mcp`, `player`, `quick`; `import` is defined
but not implemented yet). Tools detect Protoyard by reading
`interface`.

`protoyard --version` stays plain semver. `protoyard --version --json` (new in
PLAN_004) prints exactly `{"version":"<semver>","interface":1}` and exits 0
anywhere, even outside a workspace, so it is the detection probe. See the
[interface guide](https://protoyard.app/docs/interface/).

Exit codes are `0` ok, `1` failure or conflict, `2` usage or unsafe path,
`3` not found, `4` validation (invalid input, failed check or budget), and
`5` provider.

## Commands

Commands marked "runs local code" in their description execute the
prototype's own code (`spec`, `scenario --details`, `dev`, `build` …): read
unfamiliar prototype code first. `publish` without `--dry-run` uploads
immediately; use `--dry-run` first and get the developer's approval for a live
deploy.

### Workspace and discovery

| Command | Options | What it does | Status |
| --- | --- | --- | --- |
| `protoyard doctor` | `--offline` | check Node, pnpm, dependencies, layout, templates, git, Playwright and provider CLIs. With `--json`, the envelope also has top-level `interface` and `capabilities` (new in PLAN_004) | Released; new output (`interface`, `capabilities`) |
| `protoyard list` | `--kind <kind>`, `--tag <tag>`, `--category <category>`, `--platform <platform>`, `--search <text>`, `--sort <field>` | list prototypes and templates from the registry | Released (1.0.0) |
| `protoyard index` | `--force` | scan protoyard.json manifests (no code runs) and write .protoyard/registry.json | Released (1.0.0) |
| `protoyard affected` | `--since <ref>`, `--format <fmt>` | list prototype slugs affected by changes since a git ref (for selective CI builds) | Released (1.0.0) |
| `protoyard gallery` | `-p, --port <port>`, `--control-port <port>`, `--allow-origin <origins>`, `--allow-create` | index, start the control server and run the gallery (what `pnpm dev` runs) | Released (1.0.0) |
| `protoyard control-server` | `-p, --port <port>`, `--gallery-port <port>`, `--allow-origin <origins>`, `--allow-create` | only the local control API (127.0.0.1) the gallery uses to start dev servers | Released (1.0.0) |
| `protoyard mcp` | — | serve the MCP JSON-RPC protocol over newline-delimited stdio | New in PLAN_004 |

### Create prototypes

| Command | Options | What it does | Status |
| --- | --- | --- | --- |
| `protoyard new <slug>` | `-t, --template <name>`, `--from <slug>`, `--name <name>`, `--description <text>`, `--force`, `--no-install` | create prototypes/<slug> from a template or by remixing an existing prototype | Released (1.0.0) |
| `protoyard generate <slug>` | `-b, --blueprint <file>`, `-t, --template <name>`, `--name <name>`, `--description <text>`, `--dry-run`, `--force`, `--allow-drop`, `--no-install` | create prototypes/<slug> from a data-only blueprint, or regenerate it after the blueprint changes | Released (1.0.0) |
| `protoyard quick [brief]` | `--blueprint <file>`, `--slug <slug>`, `--name <name>`, `--out <dir>`, `--allow-external-out`, `--seed <n>`, `--variants <n>`, `--standalone`, `--no-store-brief`, `--force` | a disposable, playable exploration from a brief or a blueprint, with no build | New in PLAN_004 |
| `protoyard quick serve <slug\|dir>` | `--port <port>`, `--strict-port`, `--open` | serve an exploration on 127.0.0.1 until Ctrl+C (marked explorations only) | New in PLAN_004 |
| `protoyard quick export <slug\|dir>` | `--single-file`, `--out <file>`, `--force` | export an exploration as one self-contained HTML file that opens from file:// (no server, no network, no service worker); `--single-file` is the only format so far | New in PLAN_004 |
| `protoyard quick promote <slug\|dir> <slug>` | `--variant <id>`, `--no-install` | turn an exploration (or one variant) into a full prototype in prototypes/<slug> through `generate`; checks the result is the same app and records `promotedTo` in quick.json; never replaces an existing prototype; needs a workspace | New in PLAN_004 |
| `protoyard quick export <slug\|dir>` | `--single-file`, `--target <target>`, `--url <url>`, `--out <file>`, `--force` | export an exploration as one self-contained HTML file that opens from file:// (no server, no network, no service worker), or with `--target artifact` pack that file as a Claude artifact page plus its publish arguments (never publishes); `--target artifact --url <url>` records the returned URL in quick.json | New in PLAN_004 |
| `protoyard blueprint` | — | work with data-only blueprints (see packages/blueprint) | Released (1.0.0) |
| `protoyard blueprint validate <file>` | — | validate a blueprint JSON file (exit 4 with path-specific issues) | Released (1.0.0) |
| `protoyard blueprint new <file>` | `--from-brief <file>`, `-i, --interactive`, `--archetype <id>`, `--name <name>`, `--force`, `--generate <slug>`, `--dry-run`, `--no-install` | write a validated blueprint from a product brief (offline, deterministic) and optionally generate it | Released (1.0.0) |

### Run, inspect and check

| Command | Options | What it does | Status |
| --- | --- | --- | --- |
| `protoyard dev <slug>` | `-p, --port <port>`, `--host` | start ONLY that prototype's Vite dev server | Released (1.0.0) |
| `protoyard validate <slug>` | `--skip-typecheck`, `--build`, `--strict-spec` | check manifest, folder contract, package, scenarios, schema version and types | Released (1.0.0) |
| `protoyard budget [slug]` | `--all`, `--skip-build` | check initial JavaScript and CSS bundle sizes against configured budgets | Released (1.0.0) |
| `protoyard scenario` | — | inspect a prototype's scenarios | Released (1.0.0) |
| `protoyard scenario list <slug>` | `--details` |  | Released (1.0.0) |
| `protoyard scenario validate <slug>` | `-s, --scenario <id>` | run the generator for every scenario and check referential integrity (runs local code) | Released (1.0.0) |
| `protoyard scenario bench <slug>` | `-s, --scenario <id>`, `--runs <count>`, `--check`, `--ci-factor <n>` | benchmark generation and integrity validation for one or all scenarios | Released (1.0.0) |
| `protoyard theme` | — | search, inspect, apply, create, export and import themes | Released (1.0.0) |
| `protoyard theme list` | `--collection <collection>`, `--search <query>` | list built-in and library themes, optionally filtered by collection or search | Released (1.0.0) |
| `protoyard theme show <theme-id>` | — | show a theme’s light and dark swatches and contrast checks | Released (1.0.0) |
| `protoyard theme use <slug> <theme-id>` | `--dry-run` | set a prototype manifest’s default theme to a built-in or library theme | Released (1.0.0) |
| `protoyard theme create <slug>` | `--id <id>`, `--name <name>`, `--seed <hex>`, `--secondary <hex>`, `--from <file>`, `--force`, `--dry-run` | write a typed theme into a prototype from a seed or JSON file | Released (1.0.0) |
| `protoyard theme export [id]` | `--from <file>`, `--format <format>` | export a theme as CSS variables, Tailwind tokens or W3C design tokens | Released (1.0.0) |
| `protoyard theme import <slug> <file>` | `--force`, `--dry-run` | write a validated JSON theme into a prototype | Released (1.0.0) |
| `protoyard snapshot` | — | snapshot files committed with a prototype | Released (1.0.0) |
| `protoyard snapshot list <slug>` | — |  | Released (1.0.0) |
| `protoyard spec [slug]` | `--all`, `--write`, `--check`, `--init`, `--bundle` | keep a prototype's AGENTS.md and docs/ generated regions in sync with its definition (runs local code) | Released (1.0.0) |

### Build, share and review

| Command | Options | What it does | Status |
| --- | --- | --- | --- |
| `protoyard comments` | — | pull, export and import prototype review comments | Released (1.0.0) |
| `protoyard comments pull <slug>` | `--from <url>`, `--file <json>`, `--format <format>`, `--out <file>` | pull review comments from an endpoint or local adapter export | Released (1.0.0) |
| `protoyard comments export <slug>` | `--out <file>` | write the local adapter JSON format from the last pulled comments | Released (1.0.0) |
| `protoyard comments import <slug> <file>` | — | import a local adapter JSON export into the workspace comments cache | Released (1.0.0) |
| `protoyard build [slug]` | `--all`, `--out <dir>`, `--allow-external-out`, `--base <path>`, `--include-devtools`, `--offline` | production build of one prototype (or --all) into artifacts/<slug>/dist | Released (1.0.0) |
| `protoyard export [slug]` | `--all`, `--skip-build`, `--target <target>`, `--no-devtools`, `--comments`, `--dry-run`, `--base <path>`, `--include-devtools`, `--offline` | build and zip a prototype into artifacts/<slug>/<slug>.zip (or every prototype with --all) | Released (1.0.0) |
| `protoyard artifact` | — | record and inspect Claude artifact shares | Released (1.0.0) |
| `protoyard artifact record <slug>` | `--url <url>` | record the URL returned by the Claude Artifact tool | Released (1.0.0) |
| `protoyard artifact list` | — | list the latest recorded Artifact share for each prototype | Released (1.0.0) |
| `protoyard preview <slug>` | `-p, --port <port>`, `--strict-port`, `--host` | serve artifacts/<slug>/dist like a static host (SPA fallback) | Released (1.0.0) |
| `protoyard publish [slugs...]` | `--all`, `--tag <tag>`, `--provider <id>`, `--history`, `--limit <n>`, `--project <name>`, `--branch <name>`, `--preview`, `--production`, `--dry-run`, `--ensure-project`, `--comments [store]`, `--base <path>`, `--include-devtools`, `--offline` | build, verify and deploy one or many prototypes to a static host. Without --dry-run it uploads a preview immediately, with no prompt (also with --all/--tag); only --production asks for --yes | Released (1.0.0) |
| `protoyard review-index` | `--out <dir>`, `--allow-external-out`, `--from-ledger`, `--slugs <list>`, `--base <path>`, `--title <text>`, `--publish <provider>`, `--allow-publish-out`, `--project <name>`, `--dry-run`, `--production`, `--provider <id>`, `--no-personas`, `--ledger <file>`, `--serve`, `--port <n>`, `--strict-port` | one static page for reviewers: every published prototype with scenario and persona links | Released (1.0.0) |
| `protoyard showcase` | `--out <dir>`, `--target <target>`, `--allow-external-out`, `--base <path>`, `--site <url>`, `--slugs <list>`, `--no-devtools`, `--no-templates`, `--include-templates`, `--offline`, `--publish <provider>`, `--comments [store]`, `--project <name>`, `--branch <name>`, `--dry-run`, `--serve`, `--skip-build`, `-p, --port <port>`, `--strict-port`, `--host` | ONE static site: the gallery and marketplace + a live demo of every prototype (<base>p/<slug>/app/) and template (<base>t/<name>/app/) | Released (1.0.0) |

### CI

| Command | Options | What it does | Status |
| --- | --- | --- | --- |
| `protoyard ci` | — | scaffold and manage CI workflow templates | Released (1.0.0) |
| `protoyard ci init` | `--provider <id>`, `--with <list>`, `--deploy <target>`, `--prototypes <csv>`, `--dry-run`, `--force` | render versioned workflow templates into .github/workflows/ (never changes repository settings) | Released (1.0.0) |
| `protoyard ci check` | `--provider <id>`, `--strict` | report scaffolded workflows that are outdated or edited since `ci init` (reads only) | Released (1.0.0) |

## The quick and player surface

**`protoyard quick` (new in PLAN_004)** makes a disposable, playable
exploration with no build and no install:

```bash
protoyard quick "A booking tool for a fictional climbing gym"     # from a brief
protoyard quick - < brief.txt                                     # brief on stdin
protoyard quick --blueprint idea.blueprint.json --slug idea       # from a blueprint
protoyard quick "<brief>" --variants 3 --seed 7                   # v1/…v3/ + compare.html
protoyard quick "<brief>" --standalone                            # copy the player into the folder
```

- **It writes** `.protoyard/quick/<slug>/` (`blueprint.json`, `quick.json`, the
  `index.html` launcher, a marker). Outside a workspace it writes
  `./.protoyard/quick/<slug>/` under the working folder, never the home folder.
- **The prebuilt player** is shared per version in
  `.protoyard/quick/_player/<version>/`. Every file is verified against the
  player's sha256 manifest before use.
- **`--variants N`** (1–8) adds `v1/`…`vN/`, deterministic for a blueprint and
  `--seed`, and `compare.html`. Each variant keeps its own data in the browser.
- **Serve the folder over http** to open it. Browsers block the player's
  modules from `file://`, and `compare.html` frames the player.

**The player** (`@protoyard/player`) is a prebuilt app, not a CLI command:

| Surface | What it is |
| --- | --- |
| `https://protoyard.app/play/` | The hosted player: paste a blueprint or open a `#bp=` share link. Share fragments stay in the browser. |
| `<player>/index.html?src=./blueprint.json` | Open a blueprint file next to the player (same-origin relative paths only). |
| `pnpm --filter @protoyard/player build` | In the Protoyard repository: build the app into `packages/player/dist/app/` with its `protoyard-player-assets.json` manifest. |
| `pnpm --filter @protoyard/player dev` | In the Protoyard repository: run the player in development. |

The protoyard CLI depends on `@protoyard/player`, so `quick` uses the player
that matches the CLI version.

## Planned (not available)

These are named in the current plan but **not implemented in this CLI**. Do
not run or suggest them as working commands. Check `protoyard quick --help`
or `protoyard --help` on the installed CLI first.

| Planned command | Purpose |
| --- | --- |
| `protoyard quick list [--json]` · `quick open <slug>` · `quick prune [--older-than 14d] [--yes]` | List, open and prune explorations |
| Exporting an exploration as a Claude artifact (`--target artifact`; the single-file export is available) | Share an exploration as a Claude artifact |
| `protoyard quick promote <dir> <slug> [--variant vN] [--no-install]` | Promote an exploration to a full prototype |
| `protoyard quick iterate <dir> --patch <file\|-> [--allow-drop]` · `quick undo <dir>` | Patch an exploration and undo |
| `protoyard quick shot <dir>` · `quick … --screenshot` | Screenshots when a browser is available |
| `protoyard quick feedback <dir> [--import <file>]` · `quick report <dir> [--import <metrics.json>…]` | Review feedback and validation metrics |

## Where to read more

- Guides: [Protoyard documentation](https://protoyard.app/docs/).
- Installing the skill and hosts: [install.md](install.md), [hosts.md](hosts.md).
- Kits before hand-written screens: [kits.md](kits.md).
