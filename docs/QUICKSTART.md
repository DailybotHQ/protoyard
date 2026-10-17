# Quickstart

From a fresh clone to your own exported prototype. The first section takes
about a minute of commands; the rest explains what you just did.

## The 60-second path

```bash
git clone https://github.com/DailybotHQ/protoyard.git
cd protoyard
corepack enable          # uses the pnpm version pinned in package.json
pnpm install
pnpm dev                 # gallery at http://localhost:4321/
```

In the gallery, open **Pipeline CRM** and press **Start Pipeline CRM**, then
**Open**. Or skip the gallery and run one prototype directly:

```bash
pnpm protoyard dev crm-demo
```

Then, in the running app:

1. Create a deal. Reload the page. It is still there.
2. Press **Ctrl + .** (**⌘ + .** on macOS) to open the DevTools panel.
3. **Personas** tab: switch to *Priya Shah* (sales rep). Deals owned by other
   people can no longer be edited.
4. **Scenario** tab: load *Mature company, year one*. Confirm. The world is
   rebuilt from its seed.
5. **Snaps** tab: save a snapshot, change something, restore the snapshot.

Make your own and ship it:

```bash
pnpm protoyard new my-idea --template blank
pnpm protoyard dev my-idea
pnpm protoyard validate my-idea
pnpm protoyard export my-idea      # → artifacts/my-idea/my-idea.zip
pnpm protoyard preview my-idea     # serves the static build locally
```

## Requirements

| Tool | Version | Why |
| --- | --- | --- |
| Node.js | `>= 24.20.0` (`engines` in `package.json`) | Runs the CLI (through `tsx`), Vite and Astro |
| pnpm | `11.23.0` (`packageManager`), via `corepack enable` | Workspace installs |
| git | any recent | Optional, but `doctor` checks it |

> **Old Corepack?** Very old global Corepack builds (for example 0.10) can't
> start pnpm 11 and fail with `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`. Update
> it with `npm install -g corepack@latest && corepack enable`, or install pnpm
> directly with `npm install -g pnpm@11`.

`pnpm protoyard doctor --offline` checks all of this without touching the
network:

```text
Protoyard doctor
✓ Node.js                        v26.11.1 (needs ≥ 24.20.0)
✓ pnpm                           11.23.0
✓ Workspace layout               /…/protoyard
✓ Dependencies                   installed
✓ Templates                      blank, mobile-app, dashboard, …
…
- Cloudflare Pages               CLI not installed (only needed to publish there)
```

Provider CLIs (Wrangler, Netlify, Vercel) are optional. You only need them to
publish (see [PUBLISHING.md](PUBLISHING.md)).

## What `pnpm dev` starts

`pnpm dev` runs `pnpm protoyard gallery`, which does three things:

| Step | Detail |
| --- | --- |
| Index | Scans every `protoyard.json` (no prototype code runs) and writes `.protoyard/registry.json` |
| Control server | A small API on `http://127.0.0.1:4300`, bound to loopback only. The gallery uses it to start and stop prototype dev servers (at most 8 at once). |
| Gallery | Astro dev server on `http://localhost:4321/` (bound to `127.0.0.1`) |

```text
✓ Indexed 7 projects · control server http://127.0.0.1:4300
  Gallery: http://localhost:4321/ (starting…)
```

Change the ports with `pnpm protoyard gallery --port <p> --control-port <p>`.
The gallery never compiles prototype code. Each prototype runs in its own Vite
dev server, started on demand (default port `5173`, or the next free one).
Why the control server is safe on your machine: ADR-013 in
[DECISIONS.md](DECISIONS.md).

`pnpm protoyard dev <slug>` skips the gallery and starts only that
prototype:

```text
✓ Pipeline CRM is running at http://localhost:5173/
  Only this prototype is served. Ctrl+C to stop.
```

Add `--host` to also print a LAN URL for testing on a phone.

## A tour of a running prototype

Everything below happens in the browser. Nothing is sent to a server.

| Try this | What happens | Read more |
| --- | --- | --- |
| Create, edit or delete a record, then reload | Data lives in IndexedDB and survives reloads | [DATABASE.md](DATABASE.md) |
| **Ctrl/⌘ + .** | Toggles DevTools from anywhere. **Esc** closes it. | [packages/devtools/README.md](../packages/devtools/README.md) |
| Personas → switch persona | Non-destructive: records stay, permissions and visibility change | [SCENARIOS.md](SCENARIOS.md#personas-roles-and-policy) |
| Scenario → load | Destructive and scoped: this prototype's data is rebuilt from a seed. Tick "snapshot first" to keep a copy. | [SCENARIOS.md](SCENARIOS.md#scenarios-overrides-and-snapshots) |
| Time → preview +7 days | UI only. No record changes. | [SCENARIOS.md](SCENARIOS.md#time) |
| Time → advance 1 day | Commits deterministic timeline events (CRM: follow-ups, stage moves) | [SCENARIOS.md](SCENARIOS.md#time) |
| Env → offline | Saves fail with a visible "You are offline" error | [SCENARIOS.md](SCENARIOS.md#environment) |
| Look → theme and mode | Applied instantly; as a temporary override or a saved persona preference | [THEMES.md](THEMES.md) |
| Snaps → save, restore, download | Captures the exact world after your edits | [SCENARIOS.md](SCENARIOS.md#snapshots) |
| Share → copy link | A reproducible `?scenario=…&actor=…` link | [SCENARIOS.md](SCENARIOS.md#reproducible-links) |

Every value in DevTools shows where it comes from: `override`, `preference`,
`scenario` or `default`. The header's **Reset N** button clears all
temporary overrides.

The three demos run on the same engine with no shared domain code:

| Slug | Domain | Good for seeing |
| --- | --- | --- |
| `crm-demo` | Sales CRM | Migrations (schema v2), a custom `rep` role with per-record rules, a time-advance timeline |
| `mobile-banking-demo` | Household banking (fictional) | Atomic transfers over a ledger, per-role amount limits, mobile layout |
| `ai-chat-demo` | Team chat with scripted AI agents | Streaming replies persisted chunk by chunk, a partial outage that only fails agent calls |

## Create your own prototype

```bash
pnpm protoyard list --kind template        # what you can start from
pnpm protoyard new my-idea --template blank --name "My Idea"
```

```text
✓ Created prototypes/my-idea from template blank (23 files)
✓ Linked into the workspace (pnpm install --…)

Next steps:
  pnpm protoyard dev my-idea
  pnpm protoyard validate my-idea
  pnpm protoyard build my-idea
```

What `new` does:

- Copies `templates/<template>/` into `prototypes/<slug>/` (never
  `node_modules`, `dist` or symlinks), through a staging folder, so an
  interrupted run leaves nothing half-copied.
- Rewrites the identity: `id: "local.<slug>"`, `slug`, `name`,
  `storage.namespace: "<slug>"`, `template`, package name
  `@prototype/<slug>`.
- Runs `pnpm install` to link the new package (`--no-install` skips it; then
  run `pnpm install` yourself before `dev`).
- Refuses to overwrite anything. Re-running the exact same command resumes
  safely.

`--template` is required. Slugs are lowercase kebab-case, 2–48 characters,
and some names are reserved (`app`, `docs`, `gallery`, `src`…).

`templates/blank` is the smallest complete example (a Notes list with owner
and viewer personas). Its [README](../templates/blank/README.md) shows how to
add a table, a service, a screen and a scenario.

## Check, build, export, preview

```bash
pnpm protoyard validate my-idea            # manifest, folder contract, scenarios, schema version, svelte-check
pnpm protoyard validate my-idea --build    # …plus a production build
pnpm protoyard build my-idea               # → artifacts/my-idea/dist + build-manifest.json
pnpm protoyard export my-idea              # build + isolation check + ZIP
pnpm protoyard preview my-idea             # http://127.0.0.1:4173/, like a static host
pnpm vitest run prototypes/my-idea         # the prototype's own tests
```

Real output for the CRM demo (sizes and times vary):

```text
$ pnpm protoyard validate crm-demo --skip-typecheck
Validating crm-demo
✓ protoyard.json schema  example.crm v0.1.0
✓ Folder contract files
✓ package.json
✓ storage.schemaVersion  v2
✓ Scenario ids  8 scenarios
✓ defaultScenario  growing-team
✓ Database versions  v1, v2
- svelte-check
    --skip-typecheck

crm-demo is valid.
```

```text
$ pnpm protoyard export crm-demo
…
✓ Exported crm-demo
  artifacts/crm-demo/crm-demo.zip  385 KB  (6 files)
  sha256 8f371b16…
  Isolation: no references to the other 6 registered projects.
  Relocatable (base ./): unzip into any folder of any static host.
```

Builds exclude DevTools and show a small "Prototype · simulated data" badge.
Both are configurable. Hosting and publishing are covered in
[PUBLISHING.md](PUBLISHING.md).

## Scripting the CLI

Every command accepts `--json` and prints one envelope on stdout:

```bash
pnpm protoyard list --json | jq '.data.entries[].slug'
```

```json
{ "ok": false, "command": "validate",
  "error": { "code": "not_found", "message": "No prototype folder prototypes/does-not-exist.",
             "hint": "Run `pnpm protoyard list` to see the available prototypes." } }
```

Exit codes: `0` ok · `1` failure · `2` usage · `3` not found · `4`
validation · `5` provider/auth. Details and agent workflows:
[AGENT_GUIDE.md](AGENT_GUIDE.md).

## Where to go next

| You want to… | Read |
| --- | --- |
| Model data, migrations and services | [DATABASE.md](DATABASE.md) |
| Write scenarios, generators, personas, time | [SCENARIOS.md](SCENARIOS.md) |
| Change the look, add a theme | [THEMES.md](THEMES.md) |
| Host or share a prototype | [PUBLISHING.md](PUBLISHING.md) |
| Have a coding agent build a prototype | [AGENT_GUIDE.md](AGENT_GUIDE.md) |
| Understand the design | [ARCHITECTURE.md](ARCHITECTURE.md), [DECISIONS.md](DECISIONS.md) |
