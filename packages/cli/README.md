# @protoyard/cli

The `protoyard` command line. It discovers, indexes, scaffolds, runs, validates, builds, exports
and publishes prototypes: one at a time, or several in one run (`publish <slug>… | --all | --tag`). It also builds the showcase, packs prototypes for Claude artifacts and pulls review comments. Inside the repository, run it with `pnpm protoyard …`, which executes the TypeScript source. The published package compiles `src/` (including its inspect runner and review worker entry) to `dist/`; its bin and API export point to that JavaScript output. `tsx` remains a dependency for the isolated inspect runner, which loads user prototype code.

```bash
pnpm protoyard doctor                       # environment check with actionable hints
pnpm protoyard list --kind template         # what can I start from?
pnpm protoyard affected --since HEAD~1 --format csv  # which prototypes this diff touches
pnpm protoyard new my-crm --template blank  # scaffold prototypes/my-crm and link it
pnpm protoyard dev my-crm --host            # Vite for ONLY this prototype (+ LAN URL for phones)
pnpm protoyard validate my-crm --build      # contract, scenarios, schema version, types, build
pnpm protoyard export my-crm                # artifacts/my-crm/my-crm.zip (+ sha256)
pnpm protoyard publish my-crm --provider cloudflare --dry-run
pnpm protoyard mcp                           # local MCP server over stdio
```

## Commands

`protoyard mcp` runs a newline-delimited JSON-RPC server over stdin and stdout
for MCP clients, supporting the stateless 2026-07-28 revision and the legacy
2025-11-25 initialize handshake. See [the MCP guide](../../docs/MCP.md) for the
available tools, argument schemas and trust model.

Target commands (`dev`, `validate`, `build`, `export`, `preview`, `publish`, `scenario`,
`snapshot`) accept prototypes **and templates**. A slug resolves in `prototypes/` first, then
`templates/`. Template artifacts go to `artifacts/templates/<name>/`, so they never collide with a
prototype of the same name. `build --all` builds prototypes only.

| Command | What it does |
| --- | --- |
| `doctor [--offline]` | Node ≥ 24.20, pnpm, installed deps, workspace layout, templates, git, Playwright browsers, provider CLIs and their auth (never prints tokens). |
| `list [--kind] [--tag] [--category] [--platform] [--search] [--sort name\|modified]` | Table from the registry: name, slug, kind, category, template, platform, status, scenario count. |
| `index [--force]` | Scans `prototypes/*/protoyard.json` and `templates/*/protoyard.json` (one level deep, 256 KB cap, parsed as data, no code runs). Writes `.protoyard/registry.json` and an incremental cache keyed by path + mtime + size. Invalid manifests are reported, not fatal. Each entry carries the optional `catalog` block (category from a shared list, product type, platforms, resolved shell, features, highlights, difficulty) or `null`; search also matches its product type and features. |
| `affected --since <ref> [--format text\|csv]` | Maps `git diff --name-only <ref>...HEAD` to prototype slugs: `prototypes/<slug>/**` → that slug; `packages/**`, `templates/**`, root configs → all prototypes; docs/meta-only → none. `--format csv` prints a bare comma-joined list for shell/CI. |
| `new <slug> --template <t> \| --from <template\|prototype> [--name] [--description] [--force] [--no-install]` | Validates the slug, refuses paths outside `prototypes/`, copies the source through a hidden staging folder and renames it into place (no `node_modules`/`dist`/symlinks), and rewrites `protoyard.json` (`id: local.<slug>`, name, storage namespace, timestamps), `package.json`, the README title and the spec titles. `--from` also accepts an existing prototype to remix (prototypes win over templates of the same name); the copy keeps its origin `template` and gets a fresh id, name and namespace, and the source is untouched. Then runs `pnpm install --offline` (falling back to `pnpm install`), refreshes the generated spec regions for the new slug, and re-indexes. Re-running the same command resumes. An existing prototype is never overwritten; `--force` only reuses an **empty** folder. |
| `quick "<brief>" \| - \| --blueprint <file> [--slug] [--name] [--seed <n>] [--out <dir>] [--allow-external-out] [--standalone] [--no-store-brief] [--force]` | A disposable, playable exploration with no build and no install (ADR-031). It synthesizes the blueprint offline from the brief (`-` reads stdin, 64 KB cap) or loads `--blueprint` as untrusted input (256 KB cap, schema issues with fixes), then writes `.protoyard/quick/<slug>/`: `blueprint.json`, `quick.json`, the `.protoyard-quick` marker and a script-free `index.html` launcher. The prebuilt player is shared per version in `.protoyard/quick/_player/<version>/`, and the launcher opens it with a `#bp=` share link (plus `?seed=`). `--standalone`, a custom `--out`, or a blueprint too large for a 16 KB link copies the player into `<dir>/player/` instead, next to its own `blueprint.json`. The envelope carries `{ slug, dir, blueprintSha256, ready, layout, player, open, … }`. Serve it with `quick serve` to open it (browsers block module scripts from `file://`). Exit 2 usage, 3 missing file or player, 4 invalid input, 1 when the slug exists without `--force`. |
| `quick serve <slug\|dir> [--port <n>] [--strict-port] [--open]` | Serves an exploration on `127.0.0.1` until Ctrl+C, so its launcher and the player run over http. Only folders `protoyard quick` wrote (the `.protoyard-quick` marker and a valid `quick.json`) are served; a symbolic link, a plain folder or a missing exploration is refused. A shared-player exploration is served from the quick zone at `/<slug>/` (its launcher links to `../_player/<version>/`), and a standalone one from its own folder at `/`. Paths that don't exist are 404s, never the launcher. The port starts at 4180 and, like `preview`, a busy port falls back to the next free one (`--strict-port` fails instead). `--open` opens the launcher in the default browser. The envelope prints before the server keeps running: `{ slug, dir, url, port, root, layout, playerVersion, opened }`. Exit 2 usage (bad port), 3 not found (no exploration, or its player is missing), 2 unsafe path, 1 conflict (busy port with `--strict-port`). |
| `quick export <slug\|dir> --single-file [--out <file>] [--force]` | The exploration as one self-contained HTML file that opens from `file://` with no server, no network and no service worker (`src/lib/quick/single-file.ts`). The player's chunks are embedded as text and loaded as `blob:` modules through an import map, CSS is inlined, and the blueprint is an inert `<script type="application/json" id="protoyard-blueprint">` with `<` escaped, read by the player as an untrusted source. The file has its own CSP (`connect-src 'none'`). It defaults to `<exploration>/<slug>.html`; `--out` writes only under `artifacts/` or `tmp/`. Refused over 4 MiB (`QUICK_SINGLE_FILE_BUDGET_BYTES`; measured about 3.25 MB for catalog blueprints). The envelope is `{ slug, dir, file, bytes, budgetBytes, chunks, stylesheets, playerVersion }`. Exit 2 usage (no `--single-file`) or unsafe `--out`, 3 not found, 4 invalid blueprint or over budget, 1 an existing file without `--force`. |
| `quick promote <slug\|dir> <slug> [--variant <id>] [--no-install]` | Turns an exploration (or one variant) into `prototypes/<slug>` by running the `generate` handler in process (`src/commands/quick/promote.ts`). Refuses any existing `prototypes/<slug>` (1 conflict), a folder without the quick marker (2 unsafe_path), a blueprint whose sha256 no longer matches `quick.json` (4 validation), and a `--root` that is not a workspace (3 not_found, `data.reason: "no_workspace"`). An iterated exploration's blueprint `history` is left out, so the prototype starts at schema v1. Then checks the folder contract, the blueprint drift check and parity (same blueprint identity and database versions), and only then records `promotedTo` in `quick.json`; a failing check exits 4 with the data. The envelope is `{ from, variant, slug, path, blueprintSha256, databaseVersions, checks, generate, promotedTo }`. |
| `quick iterate <slug\|dir> --patch <file\|-> [--allow-drop]` | Changes an exploration's blueprint with an RFC 6902 JSON Patch (`src/commands/quick/iterate.ts`, `applyBlueprintPatch` from `@protoyard/blueprint`). The patch file or stdin is capped at 512 KB (`QUICK_PATCH_MAX_BYTES`) before parsing, applied in memory, and refused (exit 4, `data.code` from the patch error) when it is invalid, unsafe, writes `history`, or drops data without `--allow-drop`; a refused patch writes nothing. When storage changes, the previous blueprint is appended to the blueprint's `history`, so a player opened with `?keep=<name>` migrates its kept world. Every change is recorded in `history/NNNN.json` (the patch, the exact previous text, before and after sha256), then blueprint.json, the standalone player's copy, the launcher and quick.json are rewritten with temp files and renames. A shared exploration whose new blueprint no longer fits a `#bp=` link is refused (recreate it with `--standalone`). The envelope is `{ slug, dir, changed, history, before, after, world: { preserved, fromVersion, toVersion, ops } }`. |
| `quick undo <slug\|dir>` | Restores the blueprint from before the last `quick iterate`, byte for byte, and removes that history entry. Refused when blueprint.json changed after that change: exit 4 when its identity no longer matches quick.json, exit 1 (conflict) when only its bytes differ; exit 3 when there is nothing to undo. `world.preserved` is false when the undone change had raised the schema version (a kept world cannot go back). |
| `quick report <slug\|dir> [--import <files...>]` | Aggregates validation sessions per variant and task into `report.json` and `REPORT.md` in the exploration (`src/commands/quick/report.ts`). Each `--import` is a `protoyard-validation-metrics` v1 file the player's task panel downloaded: a regular file of at most 2 MB, parsed with a strict schema (outcomes, whole-number durations and steps, ISO times, task ids), and it must come from the exploration or one of its variants (matched by the player's content namespace). A malformed or foreign file fails the run (exit 4) before anything is written. Imports are kept normalized in `metrics/<sha256>.json` (re-importing adds nothing) and re-validated on every run; attempts repeated across downloads count once. Per task: attempts, success rate (all attempts), median time and median steps (successful attempts), gave-up and timed-out counts; tasks the blueprint defines are listed even without attempts. Prompts are reduced to one safe line and Markdown-escaped. No clock is involved, so the same inputs give the same bytes. REPORT.md notes that task progress resets when the player reloads while attempts persist. |
| `quick list` | Lists the explorations under `.protoyard/quick/` (`src/commands/quick/list.ts`), newest first. It reads only real folders with a slug name that carry the `.protoyard-quick` marker (never symlinks, `_player/` or unmarked folders), validates each `quick.json`, and reports marked folders with an unreadable record in `skipped`. Explorations never enter the prototype registry. The envelope is `{ root, explorations: [{ slug, folder, dir, name, source, createdAt, updatedAt, layout, playerVersion, open, variants, compare, review, shares, promotedTo }], skipped }`. |
| `quick open <slug> [--port <port>] [--strict-port]` | Finds a listed exploration by slug (or folder name) and runs `quick serve <dir> --open` on it: the player needs http, so opening means serving on 127.0.0.1 until Ctrl+C. An unknown or unmarked name exits 3 with the known slugs in the hint. |
| `quick index` | Writes `.protoyard/quick/index.html` (`src/lib/quick/index-html.ts`): one card per exploration with relative links to it, its variants, its compare page and its `REVIEW.md`. Every string is escaped, every link must pass `safeRelativeUrl`, the page runs no script, and its CSP allows only its own hashed style. Exit 3 when there is no quick zone. The envelope is `{ file, explorations, skipped }`. |
| `quick export <slug\|dir> --target artifact [--url <url>]` | The same single file as a Claude artifact page (`src/lib/quick/artifact.ts`): body content in `<exploration>/artifact/page.html` (the Artifact tool adds the document skeleton) plus `artifact-manifest.json`, checked against `ARTIFACT_LIMITS`. The envelope carries `publish: { file_path, title, icon, description }` (title at most four words). It never publishes. With `--url`, it records the URL the Artifact tool returned in the exploration's `quick.json` `shares` (private at record time, with the page's sha256), never in the prototype share ledger; the page must still match its manifest. Exit 2 usage (other target, `--single-file`, `--out`, a URL that is not a claude.ai artifact link), 3 no exploration or no pack, 4 a rule broken or a changed page. |
| `blueprint new <file> --from-brief <file\|-> \| --interactive [--archetype] [--name] [--force] [--generate <slug>] [--dry-run] [--no-install]` | Writes a validated blueprint from a product brief, offline and deterministically (`blueprintFromBrief`), and prints the rationale for each archetype, entity, field and screen. `-` reads stdin; `--interactive` asks seven questions on a terminal (exit 2 otherwise). Refuses non-`.json` names and paths outside the workspace, and never overwrites without `--force` (exit 1). `--generate <slug>` chains into `generate`; `--dry-run` writes nothing (with `--generate`, it plans the prototype from a temporary copy). Exit 2 usage, 3 missing brief file, 4 when no valid blueprint comes out. See docs/GENERATOR.md. |
| `dev <slug> [--port] [--host]` | Starts Vite with that prototype or template's own `vite.config.ts` on a free port and prints the real URL. Templates run as live demos under the `template-demo-<slug>` storage namespace (template files are never written). |
| `validate <slug> [--skip-typecheck] [--build] [--strict-spec]` | Each check passes or fails: manifest schema, folder contract, package name, schema version (static), scenario ids (unique, listed, default exists), database versions, the prototype spec (missing `AGENTS.md`/`docs/` files warn, or fail with `--strict-spec`; stale generated regions fail), `svelte-check`, optional build. |
| `build <slug> \| --all [--base] [--include-devtools] [--offline] [--out] [--allow-external-out]` | Production build to `artifacts/<slug>/dist`, plus `build-manifest.json` (files with sizes and sha256, base, devtools, review enabled/adapter, SDK versions). Checks that `index.html` and its assets exist. `--all` builds one after another and prints a summary. |
| `budget <slug> \| --all [--skip-build]` | Checks initial JS and CSS (gzip) from `build-manifest.json` against `protoyard.budgets.json` (default 250 KB / 30 KB, per-prototype overrides) and prints the headroom. Exit 4 when a budget is exceeded. Without `--skip-build` it builds first. |
| `export <slug> \| --all [--base] [--include-devtools] [--offline] [--skip-build]` | Builds, checks that the bundle holds no other registered prototype's manifest or storage name, and zips it with stable ordering and timestamps. `--all` exports every prototype (never templates) one after another, continues past failures, prints zip path + sha256 per slug, and exits 1 if any failed. |
| `export <slug> --target artifact [--dry-run] [--skip-build] [--no-devtools] [--comments]` | Builds a separate copy for a Claude artifact in `artifacts/<slug>/artifact-dist/` (base `./`, DevTools included unless `--no-devtools`, explicit shells keep their frame when embedded), runs the isolation check, then packs `artifacts/<slug>/artifact/` (`page.html`, every referenced file, `artifact-manifest.json` with sizes, sha256, content types and publish batches of at most 255 files). Every Artifact rule is checked (allowed CDNs, no network fetches or service workers, web file types only, size limits, 511 files and 256 MB per version, a `<title>`); a broken rule exits 4 with every reason. U+FFFD in JS, JSON and CSS is written as an equivalent escape, and refused in other text files. `--comments` declares the `db`, `user` and `comments` capabilities for shared review comments and needs `build.review.enabled`. `--dry-run` writes nothing. The CLI never publishes: the `share-as-artifact` skill does, after approval (docs/PUBLISHING.md). |
| `artifact record <slug> --url <url>` | Appends the URL the Artifact tool returned to `artifacts/share/ledger.jsonl` (visibility `private` at record time), after checking that the pack still matches its manifest file by file. Refuses URLs that are not `https://claude.ai/artifact/<id>` or `https://claude.ai/code/artifact/<id>`. |
| `artifact list` | The latest recorded share per prototype (`--json`: `{ entries, total, ledger, skipped }`). |
| `preview <slug> [--port] [--host] [--strict-port]` | Serves the built `dist/` like a static host (SPA fallback, sub-path `base` aware). |
| `publish <slug>… \| --all \| --tag <tag> --provider cloudflare\|netlify\|vercel\|static [--project] [--branch] [--preview\|--production] [--dry-run] [--ensure-project] [--comments [d1\|kv]]` | Builds and verifies first. `--dry-run` prints the exact command and contacts no provider. Cloudflare runs `wrangler pages deploy` and reports only the URL wrangler printed. `--branch <name>` sets the Cloudflare Pages preview branch (default `preview`; not with `--production`). `--ensure-project` (Cloudflare) lists `wrangler pages project create <p> --production-branch main` on dry-run and, on a real publish, creates the Pages project only when `pages project list` does not already name it. **Netlify and Vercel adapters are experimental and untested against the live services.** Vercel has no project flag on `deploy`, so the adapter first runs `vercel link --yes --project <name> --cwd <dist>`, then `vercel deploy --cwd <dist>`. The dry run prints both. `static` produces the ZIP plus upload instructions. `--production` requires `--yes`. Several slugs, `--all` or `--tag <tag>` publish every matching prototype (never templates) one after another, continue past failures, print one summary and exit 1 if any failed. `--project` is refused for more than one target. Every completed publish is appended to `artifacts/publish/ledger.jsonl` (provider-printed URLs only, never credentials); `publish --history [slug…] [--provider] [--limit n]` prints it. `--comments [d1\|kv]` (Cloudflare, one prototype) builds with the http review adapter on `/api/comments`, bundles the comments handler into `dist/_worker.js` (under 20 KB raw, no Node built-ins) with a `dist/_routes.json` that includes only `/api/comments/*`, and prints the one-time `wrangler d1 create`/`d1 execute --file` or `kv namespace create` commands, the binding name (`REVIEW_DB`/`REVIEW_KV`) and the optional `pages secret put REVIEW_KEY`, none of which it runs. The ledger records `review.adapter` and the store, never a key. |
| `review-index [--from-ledger \| --slugs a,b] [--ledger <file>] [--out] [--base] [--title] [--provider <p>] [--no-personas] [--serve [--port] [--strict-port]] [--publish <provider> [--project] [--dry-run] [--production] [--allow-publish-out]]` | Writes one static, script-free review page (`artifacts/review/index.html` + `review-manifest.json`) listing each prototype's latest real deploy from the ledger (provider-printed URL, branch, commit) with `?scenario=` and `?actor=` links; undeployed prototypes show the publish command, never a guessed URL. A valid `artifacts/review-comments/comments/<slug>.json` adds open/resolved thread counts and its `pulledAt` timestamp; missing files add nothing. Persona links run each deployed prototype's generator in a child process (`--no-personas` skips them). `--serve` previews the page locally; `--publish` deploys it as `protoyard-review` through a provider adapter (`--dry-run` prints the command; `--production` requires `--yes`). Publishing uploads the whole `--out` folder, so it accepts only `artifacts/review` unless `--allow-publish-out`, never a folder that holds the deploy ledger, and refuses files it did not write. |
| `comments pull <slug> (--from <url> \| --file <json>) --format md\|json [--out <file>]` | GETs one remote comments collection (optional `PROTOYARD_REVIEW_KEY`, never printed) or validates a local adapter export. The request times out after 10 seconds, rejects redirects, and caps the response at 5 MB. Writes `prototypes/<slug>/docs/REVIEW.md` plus `artifacts/review-comments/comments/<slug>.json` with `pulledAt`; `--out` writes the selected representation to one more file, which must be under `artifacts/`, `tmp/` or `prototypes/<slug>/docs/` (source folders, `.git`, config files, the ledger folder and symlinked paths are refused with `unsafe_path`). Markdown groups open threads before resolved threads by screen and escapes untrusted comment text. |
| `comments import <slug> <file>` | Validates a local adapter export and imports it into `artifacts/review-comments/comments/<slug>.json`, stamping `pulledAt`. |
| `comments export <slug> [--out <file>]` | Exports the cached comments in the local adapter JSON format (without pull-only metadata); default output is `artifacts/review-comments/exports/<slug>.json`; `--out` follows the same rule as `comments pull --out`. |
| `ci init [--provider github] [--with check,build,e2e,preview] [--deploy cloudflare] [--prototypes <csv>] [--dry-run] [--force]` | `--prototypes` must list registry slugs (checked before anything is rendered). Renders versioned workflows from `ci-templates/` into `.github/workflows/`. Refuses overwrite without `--force`. Prints secret **names** only and "Settings are not changed by this command". `--dry-run` shows unified diffs and writes nothing. Each file gets a `# protoyard-ci-hash:` line under its template header. |
| `spec <slug\|--all> [--write\|--check] [--init] [--bundle]` | Keeps a prototype's `AGENTS.md` and `docs/` generated regions (`<!-- protoyard:generated:<id> -->`) in sync with its definition (runs local code in a child process). `--init` creates missing skeletons, `--write` refreshes regions only, `--check` exits 4 when a region is stale or a marker is invalid. Prose outside the markers is never touched. `--bundle` writes `artifacts/<slug>/<slug>-rebuild-kit.zip` (spec, schema, domain, scenarios and a generated `REBUILD.md`) from a current spec, refusing symlinks and public-hygiene findings. See docs/SPECS.md. |
| `ci check [--strict]` | Compares `.github/workflows/protoyard-*.yml` with the packaged templates: `up-to-date`, `outdated` (a newer template version ships), `modified` (edited since `ci init`), `unhashed` (no hash line) or `unmanaged` (not ours). `--strict` exits 4 on drift. `doctor` adds an informational line when a workflow is outdated. |
| `showcase [--out] [--allow-external-out] [--base /] [--site <origin>] [--no-devtools] [--no-templates] [--offline] [--serve] [--skip-build] [--port] [--strict-port] [--host] [--publish cloudflare [--project] [--branch] [--dry-run] [--comments [d1\|kv]]] [--target artifact [--slugs a,b]]` | ONE static site: the gallery and marketplace plus each prototype's own build at `<base>p/<slug>/app/` and, unless `--no-templates`, each template as a demo at `<base>t/<name>/app/` (storage namespace `template-demo-<name>`; `--include-templates` is still accepted). Blueprints are not bundled. Each is built in its own Vite process with DevTools included (a demo site), and each must pass the export isolation check. Failed builds are listed without a live demo. The gallery is built from `.protoyard/showcase-registry.json`, which marks bundled builds as `embedded`. Hosted previews, **Open** links and `?scenario=<id>` links then work with no control server. `--site https://…` (or `PROTOYARD_SITE_URL`) makes canonical links, Open Graph images and `sitemap.xml` absolute for that origin. Output: `artifacts/showcase/` (summary in `artifacts/showcase-builds/showcase.json`). `--publish cloudflare` deploys the finished site as one Pages project (default `protoyard-showcase`) and refuses when any demo failed to build. With `--comments`, every demo uses the http review adapter and one comments worker sits at the site root. The `--json` `targets` list every demo with its `appPath`, `marketplacePath` and (templates) `storageNamespace`. `--target artifact` (base `./` only, no `--publish`, `--serve` or `--skip-build`) packs the gallery and the demos chosen with `--slugs` under `artifacts/showcase/artifact/`, and refuses (exit 4) a selection over the 511-file version cap, so a full showcase is never one artifact. |
| `scenario list <slug> [--details]` | Scenario ids from the manifest (static), or names, groups and seeds with `--details`. |
| `scenario bench <slug> [-s id] [--runs 3] [--check] [--ci-factor <n>]` | Runs the generator and integrity validation for each scenario in a child process and prints median generate / validate / total ms and row counts. `--check` exits 4 when generate + validate exceeds `generateMs` (50 ms by default). |
| `scenario validate <slug> [-s id]` | Runs the generator for every scenario and checks referential integrity (`validateWorld`). |
| `theme list [--collection <collection>] [--search <query>]` | Lists built-in and library themes, filtered by the library collection and a deterministic search across names, ids, tags, moods, categories and descriptions. |
| `theme show <theme-id>` | Shows light and dark color swatches with WCAG text and UI contrast checks for a built-in or library theme. |
| `theme use <slug> <theme-id> [--dry-run]` | Sets only `defaultTheme` in the prototype's validated `protoyard.json`; dry-run prints the planned change without writing. |
| `theme create`, `theme import`, `theme export` | Create a typed prototype theme, import validated theme JSON, or export built-in/library themes as CSS, Tailwind or W3C design tokens. |
| `snapshot list <slug>` | Validates committed `snapshots/*.protoyard.json` files as data. Snapshots saved in DevTools stay in the browser. |
| `gallery [--port] [--control-port] [--allow-create]` | What `pnpm dev` runs: index, the local control server and the Astro gallery. Astro is kept in the foreground (`--ignore-lock`), so stopping the command also stops the gallery, even when Astro detects an AI agent. |
| `control-server [--port] [--gallery-port] [--allow-origin] [--allow-create]` | Just the local API: `GET /api/status`, `POST /api/dev/:slug` (prototype or template demo), `POST /api/stop/:slug`, and, only with `--allow-create`, `POST /api/new` (JSON `{ slug, from, name?, description? }` plus an `X-Protoyard-Token` header with the per-run token that `GET /api/status` gives allowed origins; without the flag it answers 403 with a hint: the same in-process code path as `new --from`, one creation at a time; links with `pnpm install --offline` only and, when that is not enough, returns `linked: false` with the exact command instead of going online; otherwise starts the new prototype and returns its dev URL). Template demos use `template-demo-<slug>` storage. Loopback + Origin allow-list (required for every POST); JSON bodies only, at most 8 KB, strict fields; max 8 concurrent dev servers. |

Global options: `--json`, `-y/--yes` (implied by `CI=1`), `--cwd <dir>`, `--root <dir>` (or
`PROTOYARD_ROOT`), `-q/--quiet`, `--no-color` (or `NO_COLOR=1`). The CLI never prompts. Every
decision has a flag with a documented default, so it behaves the same with or without a TTY and
for humans and agents alike.

## Hosting the showcase on GitHub Pages

`.github/workflows/pages.yml` builds `pnpm protoyard showcase --base /protoyard/` (the gallery plus
every prototype's own build, one static site) and deploys it with `actions/deploy-pages`.

- **Manual only (`workflow_dispatch`).** Publishing a public site is the owner's decision, so
  there is no push trigger. Run it from Actions → pages → Run workflow. You can change the base or
  include templates there.
- **One-time setup:** Settings → Pages → Source: **GitHub Actions**.
- **Permissions:** the build job has `contents: read`. Only the deploy job gets `pages: write` and
  `id-token: write`.
- **All or nothing:** the build fails if any prototype fails to build, so a deploy never silently
  ships missing demos.
- **Check it locally first:**
  `pnpm protoyard showcase --base /protoyard/ --serve` → `http://127.0.0.1:4500/protoyard/`, or
  `PROTOYARD_E2E_SHOWCASE=1 PROTOYARD_E2E_SHOWCASE_BASE=/protoyard/ pnpm test:e2e tests/e2e/showcase.spec.ts`.
- **Data stays in the browser:** each visitor's data lives in their own browser (IndexedDB, per
  origin). All prototypes share the `github.io` origin, but each uses its own
  `protoyard.<namespace>.*` databases.

## JSON output and exit codes

With `--json`, stdout holds exactly one envelope:

```json
{ "ok": true, "command": "list", "data": { "count": 3, "entries": [] } }
{ "ok": false, "command": "build", "error": { "code": "not_found", "message": "…", "hint": "…" } }
```

| Exit | Meaning | `error.code` |
| --- | --- | --- |
| 0 | ok | — |
| 1 | failure | `failure`, `conflict` |
| 2 | usage | `usage`, `unsafe_path` |
| 3 | not found | `not_found` |
| 4 | validation | `validation` |
| 5 | provider / auth | `provider`, `auth` |

Commands that complete with failing checks (`validate`, `scenario validate`, `build --all`, `export --all`,
`snapshot list`, `showcase`) return `ok: false` and keep the full `data`.

## Offline builds (`--offline`)

`build`, `export` and `showcase` accept `--offline`. It sets `PROTOYARD_OFFLINE=1` for the Vite
child process, so `defineProtoyardConfig` adds the opt-in service worker from
`@protoyard/offline`. A manifest with `build.offline: true` does the same without the flag.

- **Recorded:** `build-manifest.json` gets `offline: { enabled: true, version, precached }` (read
  back from `dist/sw.js`) or `offline: false`.
- **Fails clearly:** if offline was requested but no `sw.js` was emitted, the build fails with
  exit 4.
- **Shipped:** `sw.js` is part of `dist`, so it is in the ZIP and in the showcase. There each
  prototype's worker is scoped to its own `<base>p/<slug>/app/`.
- **Opt out:** visitors append `?offline=0` to an app URL to unregister the worker.

## Output folders (`--out`)

The CLI empties or replaces output folders, so the destination is allow-listed. The check runs on
canonical paths: symlinks are resolved, and letter case is compared case-insensitively on macOS
and Windows.

- **Strictly inside `artifacts/` or `tmp/`:** always allowed. The default
  (`artifacts/<slug>/dist`, or `artifacts/templates/<name>/dist` for templates) needs no flag.
  Prototype slugs `templates`, `showcase`, `showcase-builds`, `publish` and `review` are reserved
  (the CLI owns those folders under `artifacts/`).
- **Anywhere else in the workspace:** only a new or empty folder, or one Protoyard wrote before. A
  build leaves a hidden `.protoyard-out` marker (it also holds that build's manifest); a showcase
  leaves `.protoyard-showcase`.
- **Outside the workspace:** additionally needs `--allow-external-out`.
- **Quick explorations:** `.protoyard/quick/<slug>/` (outside a workspace, `./.protoyard/quick/`
  under the working folder, never the home folder itself). Only `protoyard quick` writes there,
  one slug-named folder per exploration, through real folders only, and only into a new, empty or
  `.protoyard-quick`-marked folder (`src/lib/quick/paths.ts`). Each exploration records a strict,
  versioned `quick.json` (`protoyard.quick` v1: brief and blueprint sha256, player version,
  variants, screenshots, shares, promotion; `src/lib/quick/model.ts`). A newer format version is
  refused with an upgrade hint, and the brief text is omitted with `--no-store-brief`.
  `--variants N` (1–8) also writes `v1/`…`vN/`, each with its own `blueprint.json` and launcher
  on the one shared player. They are deterministic for a blueprint and `--seed` (from
  `deriveVariants` over every shared layout and catalog theme), and each opens its own world,
  because the player keys storage by blueprint hash. A replaced exploration drops earlier
  variant folders.
  Explorations with variants get a static `compare.html` (`src/lib/quick/compare-html.ts`): the
  variants side by side with labels, links and screenshots, only relative same-folder URLs, all
  text escaped, no script, and a Content-Security-Policy that allows only its own hashed style,
  same-origin images and same-origin frames.
  The prebuilt player is copied, never built (`src/lib/quick/player-assets.ts`):
  - **Where it comes from:** the CLI's own `@protoyard/player` dependency, then the workspace's
    install, then this repository's `packages/player`.
  - **How it is checked:** every file must match the `protoyard-player-assets.json` sha256
    manifest the player ships in its app folder (`dist/app/`, or `dist/`). A changed, missing,
    unlisted or linked file is refused.
  - **Where it goes:** a verified copy is staged and renamed into `.protoyard/quick/_player/<version>/`
    (shared) or `<exploration>/player/`. A verified copy that is already there is reused, and a
    tampered copy is replaced from the verified source. No Vite and no install run.
- **Never allowed:** the workspace or its parents, your home folder, `.git`, `node_modules`,
  `packages`, `apps`, `prototypes`, `templates`, `docs`, `scripts`, `tests`, `.github`,
  `.agents`, `.claude` or `.dwp`, nor a path that is itself a symlink.
- **Markers stay out of artifacts:** they are excluded from digests, build manifests and ZIPs.

Builds also refuse prototypes containing symlinks that point outside their folder (for example
`public/x → ../../.env`), because Vite would copy the target into the output. `validate` reports
these as a failing `symlinks` check. Discovery never indexes symlinked prototype folders or
symlinked manifests.

## Trust model

- **Indexing never executes code.** Manifests are JSON parsed with the core zod schema.
- `scenario validate`, `scenario list --details`, `snapshot list` and the definition checks in
  `validate` import `src/prototype.ts` in a **separate tsx child process** (with fake-indexeddb).
  That is local code execution, at the same trust level as `pnpm test`, so use it only on
  prototypes you trust (your own workspace).
- Child processes always get an argv array (`shell: false`). Slugs, paths and project names never
  pass through a shell.
- `preview` and `showcase --serve` serve only files whose real path is inside the output folder
  (symlinks leaving it get 403), answer malformed URL escapes with 400, and send
  `X-Content-Type-Options: nosniff`.
- `publish --dry-run` and `doctor --offline` locate provider CLIs on `PATH` and in
  `node_modules/.bin` only. They never spawn `npx`, so the npm registry is never contacted. Real
  publishes may fall back to `npx --no-install` with `npm_config_offline=true`.
- `new` never copies `.env*` (except `.env.example`), `.envrc`, `.npmrc` or `.git` from a
  template.
- The control server binds to `127.0.0.1`. It accepts only loopback `Host` headers (a DNS
  rebinding guard) and allow-listed `Origin`s (POST requires one), starts only slugs found in the
  registry, and runs at most 8 dev servers at once.
- In the monorepo, Vite runs with tsx's loader (`--import tsx/esm`) so TypeScript workspace
  packages load the same way in every Node version. The published CLI uses compiled JavaScript
  dependencies and does not register that loader; Vite handles the user's erasable
  `vite.config.ts` with Node's built-in type stripping. The published `tsx` dependency serves the
  isolated inspect runner.

## Programmatic API

`import { buildIndex, filterEntries, runCli, startControlServer, zipDirectory, createProvider } from '@protoyard/cli'`.
See `src/index.ts`. `scripts/bench-index.ts` is a real consumer.
