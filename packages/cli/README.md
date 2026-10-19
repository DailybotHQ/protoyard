# @protoyard/cli

The `protoyard` command line. It discovers, indexes, scaffolds, runs, validates, builds, exports
and publishes prototypes: one at a time, or several in one run (`publish <slug>… | --all | --tag`). Inside the repository, run it with `pnpm protoyard …`.
`bin/protoyard.mjs` is the package entry point: it registers tsx and runs `src/bin.ts`.

```bash
pnpm protoyard doctor                       # environment check with actionable hints
pnpm protoyard list --kind template         # what can I start from?
pnpm protoyard affected --since HEAD~1 --format csv  # which prototypes this diff touches
pnpm protoyard new my-crm --template blank  # scaffold prototypes/my-crm and link it
pnpm protoyard dev my-crm --host            # Vite for ONLY this prototype (+ LAN URL for phones)
pnpm protoyard validate my-crm --build      # contract, scenarios, schema version, types, build
pnpm protoyard export my-crm                # artifacts/my-crm/my-crm.zip (+ sha256)
pnpm protoyard publish my-crm --provider cloudflare --dry-run
```

## Commands

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
| `dev <slug> [--port] [--host]` | Starts Vite with that prototype or template's own `vite.config.ts` on a free port and prints the real URL. Templates run as live demos under the `template-demo-<slug>` storage namespace (template files are never written). |
| `validate <slug> [--skip-typecheck] [--build] [--strict-spec]` | Each check passes or fails: manifest schema, folder contract, package name, schema version (static), scenario ids (unique, listed, default exists), database versions, the prototype spec (missing `AGENTS.md`/`docs/` files warn, or fail with `--strict-spec`; stale generated regions fail), `svelte-check`, optional build. |
| `build <slug> \| --all [--base] [--include-devtools] [--out]` | Production build to `artifacts/<slug>/dist`, plus `build-manifest.json` (files with sizes and sha256, base, devtools, SDK versions). Checks that `index.html` and its assets exist. `--all` builds one after another and prints a summary. |
| `budget <slug> \| --all [--skip-build]` | Checks initial JS and CSS (gzip) from `build-manifest.json` against `protoyard.budgets.json` (default 250 KB / 30 KB, per-prototype overrides) and prints the headroom. Exit 4 when a budget is exceeded. Without `--skip-build` it builds first. |
| `export <slug> \| --all [--base] [--include-devtools] [--skip-build]` | Builds, checks that the bundle holds no other registered prototype's manifest or storage name, and zips it with stable ordering and timestamps. `--all` exports every prototype (never templates) one after another, continues past failures, prints zip path + sha256 per slug, and exits 1 if any failed. |
| `preview <slug> [--port] [--host] [--strict-port]` | Serves the built `dist/` like a static host (SPA fallback, sub-path `base` aware). |
| `publish <slug>… \| --all \| --tag <tag> --provider cloudflare\|netlify\|vercel\|static [--project] [--branch] [--preview\|--production] [--dry-run] [--ensure-project]` | Builds and verifies first. `--dry-run` prints the exact command and contacts no provider. Cloudflare runs `wrangler pages deploy` and reports only the URL wrangler printed. `--branch <name>` sets the Cloudflare Pages preview branch (default `preview`; not with `--production`). `--ensure-project` (Cloudflare) lists `wrangler pages project create <p> --production-branch main` on dry-run and, on a real publish, creates the Pages project only when `pages project list` does not already name it. **Netlify and Vercel adapters are experimental and untested against the live services.** Vercel has no project flag on `deploy`, so the adapter first runs `vercel link --yes --project <name> --cwd <dist>`, then `vercel deploy --cwd <dist>`. The dry run prints both. `static` produces the ZIP plus upload instructions. `--production` requires `--yes`. Several slugs, `--all` or `--tag <tag>` publish every matching prototype (never templates) one after another, continue past failures, print one summary and exit 1 if any failed. `--project` is refused for more than one target. Every completed publish is appended to `artifacts/publish/ledger.jsonl` (provider-printed URLs only, never credentials); `publish --history [slug…] [--provider] [--limit n]` prints it. |
| `review-index [--from-ledger \| --slugs a,b] [--ledger <file>] [--out] [--base] [--title] [--provider <p>] [--no-personas] [--serve [--port] [--strict-port]] [--publish <provider> [--project] [--dry-run] [--production] [--allow-publish-out]]` | Writes one static, script-free review page (`artifacts/review/index.html` + `review-manifest.json`) listing each prototype's latest real deploy from the ledger (provider-printed URL, branch, commit) with `?scenario=` and `?actor=` links; undeployed prototypes show the publish command, never a guessed URL. Persona links run each deployed prototype's generator in a child process (`--no-personas` skips them). `--serve` previews the page locally; `--publish` deploys it as `protoyard-review` through a provider adapter (`--dry-run` prints the command; `--production` requires `--yes`). Publishing uploads the whole `--out` folder, so it accepts only `artifacts/review` unless `--allow-publish-out`, never a folder that holds the deploy ledger, and refuses files it did not write. |
| `ci init [--provider github] [--with check,build,e2e,preview] [--deploy cloudflare] [--prototypes <csv>] [--dry-run] [--force]` | `--prototypes` must list registry slugs (checked before anything is rendered). Renders versioned workflows from `ci-templates/` into `.github/workflows/`. Refuses overwrite without `--force`. Prints secret **names** only and "Settings are not changed by this command". `--dry-run` shows unified diffs and writes nothing. Each file gets a `# protoyard-ci-hash:` line under its template header. |
| `spec <slug\|--all> [--write\|--check] [--init] [--bundle]` | Keeps a prototype's `AGENTS.md` and `docs/` generated regions (`<!-- protoyard:generated:<id> -->`) in sync with its definition (runs local code in a child process). `--init` creates missing skeletons, `--write` refreshes regions only, `--check` exits 4 when a region is stale or a marker is invalid. Prose outside the markers is never touched. `--bundle` writes `artifacts/<slug>/<slug>-rebuild-kit.zip` (spec, schema, domain, scenarios and a generated `REBUILD.md`) from a current spec, refusing symlinks and public-hygiene findings. See docs/SPECS.md. |
| `ci check [--strict]` | Compares `.github/workflows/protoyard-*.yml` with the packaged templates: `up-to-date`, `outdated` (a newer template version ships), `modified` (edited since `ci init`), `unhashed` (no hash line) or `unmanaged` (not ours). `--strict` exits 4 on drift. `doctor` adds an informational line when a workflow is outdated. |
| `showcase [--out] [--base /] [--no-devtools] [--no-templates] [--offline] [--serve] [--skip-build] [--port] [--publish cloudflare [--project] [--branch] [--dry-run]]` | ONE static site: the gallery and marketplace plus each prototype's own build at `<base>p/<slug>/app/` and, unless `--no-templates`, each template as a demo at `<base>t/<name>/app/` (storage namespace `template-demo-<name>`; `--include-templates` is still accepted). Blueprints are not bundled. Each is built in its own Vite process with DevTools included (a demo site), and each must pass the export isolation check. Failed builds are listed without a live demo. The gallery is built from `.protoyard/showcase-registry.json`, which marks bundled builds as `embedded`. Hosted previews, **Open** links and `?scenario=<id>` links then work with no control server. Output: `artifacts/showcase/` (summary in `artifacts/showcase-builds/showcase.json`). `--publish cloudflare` deploys the finished site as one Pages project (default `protoyard-showcase`) and refuses when any demo failed to build. The `--json` `targets` list every demo with its `appPath`, `marketplacePath` and (templates) `storageNamespace`. |
| `scenario list <slug> [--details]` | Scenario ids from the manifest (static), or names, groups and seeds with `--details`. |
| `scenario bench <slug> [-s id] [--runs 3] [--check]` | Runs the generator and integrity validation for each scenario in a child process and prints median generate / validate / total ms and row counts. `--check` exits 4 when generate + validate exceeds `generateMs` (50 ms by default). |
| `scenario validate <slug> [-s id]` | Runs the generator for every scenario and checks referential integrity (`validateWorld`). |
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
- Vite runs with tsx's loader (`--import tsx/esm`) so TypeScript workspace packages load the same
  way in every Node version.

## Programmatic API

`import { buildIndex, filterEntries, runCli, startControlServer, zipDirectory, createProvider } from '@protoyard/cli'`.
See `src/index.ts`. `scripts/bench-index.ts` is a real consumer.
