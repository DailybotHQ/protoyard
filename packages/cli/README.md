# @protoyard/cli

The `protoyard` command line. It discovers, indexes, scaffolds, runs, validates, builds, exports
and publishes **one prototype at a time**. Inside the repository, run it with `pnpm protoyard …`.
`bin/protoyard.mjs` is the package entry point: it registers tsx and runs `src/bin.ts`.

```bash
pnpm protoyard doctor                       # environment check with actionable hints
pnpm protoyard list --kind template         # what can I start from?
pnpm protoyard new my-crm --template blank  # scaffold prototypes/my-crm and link it
pnpm protoyard dev my-crm --host            # Vite for ONLY this prototype (+ LAN URL for phones)
pnpm protoyard validate my-crm --build      # contract, scenarios, schema version, types, build
pnpm protoyard export my-crm                # artifacts/my-crm/my-crm.zip (+ sha256)
pnpm protoyard publish my-crm --provider cloudflare --dry-run
```

## Commands

Target commands (`dev`, `validate`, `build`, `export`, `preview`, `publish`, `scenario`,
`snapshot`) accept prototypes **and templates**. A slug resolves in `prototypes/` first, then
`templates/`. Template artifacts go to `artifacts/template-<name>/`, so they never collide with a
prototype of the same name. `build --all` builds prototypes only.

| Command | What it does |
| --- | --- |
| `doctor [--offline]` | Node ≥ 24.20, pnpm, installed deps, workspace layout, templates, git, Playwright browsers, provider CLIs and their auth (never prints tokens). |
| `list [--kind] [--tag] [--category] [--platform] [--search] [--sort name\|modified]` | Table from the registry: name, slug, kind, category, template, platform, status, scenario count. |
| `index [--force]` | Scans `prototypes/*/protoyard.json` and `templates/*/protoyard.json` (one level deep, 256 KB cap, parsed as data, no code runs). Writes `.protoyard/registry.json` and an incremental cache keyed by path + mtime + size. Invalid manifests are reported, not fatal. |
| `new <slug> --template <t> [--name] [--description] [--force] [--no-install]` | Validates the slug, refuses paths outside `prototypes/`, copies the template through a hidden staging folder and renames it into place (no `node_modules`/`dist`/symlinks), and rewrites `protoyard.json` (`id: local.<slug>`, namespace, timestamps), `package.json` and the README title. Then runs `pnpm install --offline` (falling back to `pnpm install`) and re-indexes. Re-running the same command resumes. `--force` only reuses an **empty** folder. |
| `dev <slug> [--port] [--host]` | Starts Vite with that prototype's own `vite.config.ts` on a free port and prints the real URL. |
| `validate <slug> [--skip-typecheck] [--build]` | Each check passes or fails: manifest schema, folder contract, package name, schema version (static), scenario ids (unique, listed, default exists), database versions, `svelte-check`, optional build. |
| `build <slug> \| --all [--base] [--include-devtools] [--out]` | Production build to `artifacts/<slug>/dist`, plus `build-manifest.json` (files with sizes and sha256, base, devtools, SDK versions). Checks that `index.html` and its assets exist. `--all` builds one after another and prints a summary. |
| `export <slug> [--base] [--include-devtools] [--skip-build]` | Builds, checks that the bundle holds no other registered prototype's manifest or storage name, and zips it with stable ordering and timestamps. |
| `preview <slug> [--port] [--host] [--strict-port]` | Serves the built `dist/` like a static host (SPA fallback, sub-path `base` aware). |
| `publish <slug> --provider cloudflare\|netlify\|vercel\|static [--project] [--preview\|--production] [--dry-run]` | Builds and verifies first. `--dry-run` prints the exact command and contacts no provider. Cloudflare runs `wrangler pages deploy` and reports only the URL wrangler printed. **Netlify and Vercel adapters are experimental and untested against the live services.** Vercel has no project flag on `deploy`, so the adapter first runs `vercel link --yes --project <name> --cwd <dist>`, then `vercel deploy --cwd <dist>`. The dry run prints both. `static` produces the ZIP plus upload instructions. `--production` requires `--yes`. |
| `showcase [--out] [--base /] [--no-devtools] [--include-templates] [--serve] [--skip-build] [--port]` | ONE static site: the gallery plus each prototype's own build at `<base>p/<slug>/app/`. Each is built in its own Vite process with DevTools included (a demo site), and each must pass the export isolation check. Failed builds are listed without a live demo. The gallery is built from `.protoyard/showcase-registry.json`, which marks bundled builds as `embedded`. Hosted previews, **Open** links and `?scenario=<id>` links then work with no control server. Output: `artifacts/showcase/` (summary in `artifacts/showcase-builds/showcase.json`). |
| `scenario list <slug> [--details]` | Scenario ids from the manifest (static), or names, groups and seeds with `--details`. |
| `scenario validate <slug> [-s id]` | Runs the generator for every scenario and checks referential integrity (`validateWorld`). |
| `snapshot list <slug>` | Validates committed `snapshots/*.protoyard.json` files as data. Snapshots saved in DevTools stay in the browser. |
| `gallery [--port] [--control-port]` | What `pnpm dev` runs: index, the local control server and the Astro gallery. Astro is kept in the foreground (`--ignore-lock`), so stopping the command also stops the gallery, even when Astro detects an AI agent. |
| `control-server [--port] [--gallery-port] [--allow-origin]` | Just the local API: `GET /api/status`, `POST /api/dev/:slug`, `POST /api/stop/:slug`. |

Global options: `--json`, `-y/--yes` (implied by `CI=1`), `--cwd <dir>`, `--root <dir>` (or
`PROTOYARD_ROOT`), `-q/--quiet`, `--no-color` (or `NO_COLOR=1`). The CLI never prompts. Every
decision has a flag with a documented default, so it behaves the same with or without a TTY and
for humans and agents alike.

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

Commands that complete with failing checks (`validate`, `scenario validate`, `build --all`,
`snapshot list`, `showcase`) return `ok: false` and keep the full `data`.

## Trust model

- **Indexing never executes code.** Manifests are JSON parsed with the core zod schema.
- `scenario validate`, `scenario list --details`, `snapshot list` and the definition checks in
  `validate` import `src/prototype.ts` in a **separate tsx child process** (with fake-indexeddb).
  That is local code execution, at the same trust level as `pnpm test`, so use it only on
  prototypes you trust (your own workspace).
- Child processes always get an argv array (`shell: false`). Slugs, paths and project names never
  pass through a shell.
- The control server binds to `127.0.0.1`. It accepts only loopback `Host` headers (a DNS
  rebinding guard) and allow-listed `Origin`s (POST requires one), starts only slugs found in the
  registry, and runs at most 8 dev servers at once.
- Vite runs with tsx's loader (`--import tsx/esm`) so TypeScript workspace packages load the same
  way in every Node version.

## Programmatic API

`import { buildIndex, filterEntries, runCli, startControlServer, zipDirectory, createProvider } from '@protoyard/cli'`.
See `src/index.ts`. `scripts/bench-index.ts` is a real consumer.
