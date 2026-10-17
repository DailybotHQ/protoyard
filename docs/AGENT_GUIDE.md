# Agent guide

How a coding agent (or a person working like one) takes a prototype from an
idea to a published static site in this repository. It assumes the
[QUICKSTART.md](QUICKSTART.md) setup is done (`corepack enable`,
`pnpm install`).

## The operating loop

| # | Step | Commands / files | Done when |
| --- | --- | --- | --- |
| 1 | Explore | `pnpm protoyard list --json`, `pnpm protoyard list --kind template`, read `templates/<t>/README.md` | You know which template fits and which slugs exist |
| 2 | Choose a slug | Lowercase kebab-case, 2–48 chars, not reserved, not taken | `list --json` does not contain it |
| 3 | Create | `pnpm protoyard new <slug> --template <t> --name "<Name>" --description "<one line>"` | `prototypes/<slug>/` exists and `new` printed next steps |
| 4 | Domain | `src/database/schema.ts` → `src/domain/policy.ts` → `src/domain/*.ts` services → `src/scenarios/index.ts` + `protoyard.json → scenarios` → `src/scenarios/generators.ts` → `integrity` in `src/prototype.ts` | `pnpm protoyard scenario validate <slug>` passes |
| 5 | UI | `src/screens/`, `src/components/`, routes in `src/App.svelte`; components from `@protoyard/ui`, bindings from `@protoyard/renderer-svelte` | Every primary control does something real; empty, loading and error states exist |
| 6 | Tests | `prototypes/<slug>/tests/`: generator tests and service tests on the real runtime | `pnpm vitest run prototypes/<slug>` passes |
| 7 | Validate | `pnpm protoyard validate <slug> --build` | Exit code `0` |
| 8 | Build / export | `pnpm protoyard export <slug>` | ZIP written, isolation check passed |
| 9 | Publish | `pnpm protoyard publish <slug> --provider cloudflare --dry-run`, then a real publish **only if the user asked for it** | URL reported by the provider |

Read before writing code:

- `src/prototype.ts` of the template you copied: it wires everything.
- [DATABASE.md](DATABASE.md): schema, migrations, the service pattern,
  `liveQuery`.
- [SCENARIOS.md](SCENARIOS.md): scenarios, generators, determinism,
  personas, time, environment.
- [packages/ui/README.md](../packages/ui/README.md) and
  [packages/renderer-svelte/README.md](../packages/renderer-svelte/README.md)
  for components, routing and `runService()`.

## Step notes

**Explore.** `list --json` returns the registry entries (slug, name, kind,
template, tags, scenario ids, namespace, path). Use it instead of listing
folders. The demos (`crm-demo`, `mobile-banking-demo`, `ai-chat-demo`) show
patterns; do not copy their domain code into a new prototype.

**Create.** `new` copies the template, sets `id: "local.<slug>"`, the
namespace, the package name `@prototype/<slug>`, and runs `pnpm install`. It
never overwrites files. If it fails half-way, re-running the same command
resumes. Use `--no-install` only when you will run `pnpm install` yourself.

**Domain first, UI second.** A working domain layer can be tested without a
browser:

1. Schema: tables, indexes and typed `EntityTable`s. Keep
   `storage.schemaVersion` equal to the latest version.
2. Policy: roles → capabilities. Add record rules where ownership matters.
3. Services: `session.assert` → validate → `environment.run('<area>.<action>')`
   → `db.transaction('rw', …)`.
4. Scenarios: at least an empty state, a normal state and a restricted role.
   List every id in `protoyard.json`.
5. Generator: deterministic, using only `ctx.rng`, `ctx.faker`, `ctx.ids`,
   `ctx.time`, `ctx.scale`. Bump `generatorVersion` when output changes.
6. Integrity: declare `relations` and `timestamps` for every foreign key and
   date column.

**UI.** Read with `liveQuery(fn, { initial, deps })`, write through services
wrapped in `runService()`, hide or disable controls with `can()`. Use hash
routes (`createRouter`, `<Router>`, `<Link>`). Style with theme tokens
(`bg-primary`, `text-muted-foreground`), never raw palette colors (see
[THEMES.md](THEMES.md)).

**Tests.** Two kinds, both run by `pnpm vitest run prototypes/<slug>`:

- Generator: deterministic (same scenario → deep-equal world), a different
  seed → a different world, zero integrity violations for every scenario.
  `contextFor()` in `tests/support/generate-context.ts` builds a
  `GenerateContext` from your scenario list; `resolveScenarios()` +
  `createGenerateContext()` from `@protoyard/scenarios` handle scenarios that
  use `extends`.
- Services on the real runtime: `createHarness(definition)` in
  `tests/support/runtime.ts` boots a runtime on an in-memory IndexedDB;
  `reload()` reopens it on the same storage. Cover CRUD across a reload,
  a forbidden action per restricted role (`PermissionDeniedError`), offline
  failures (`SimulatedServiceError`) and rollback of multi-row writes.

`prototypes/crm-demo/tests/` and `prototypes/mobile-banking-demo/tests/`
are complete examples.

**Validate.** `validate` checks the manifest schema, the folder contract,
`package.json`, scenario ids against `protoyard.json`, `defaultScenario`,
`storage.schemaVersion` against the schema, and runs `svelte-check`. Add
`--build` for a production build. Fix every failure; do not use
`--skip-typecheck` to get a green result.

**Publish.** Building and exporting are local and safe. Deploying is not:
it uses the user's provider account and creates something public. Run
`--dry-run` and show the command. Deploy only when the user explicitly asked,
never with `--production` unless they asked for production.

## Rules

| Rule | Why |
| --- | --- |
| Touch only `prototypes/<your-slug>/` | Each prototype is independent. Do not edit other prototypes, templates or `packages/` unless the user asked. `export` fails if your bundle contains another prototype's code. |
| No `Math.random()`, `Date.now()`, `new Date()` or global `faker` in generators and timelines | Scenarios must be reproducible on every machine ([determinism rules](SCENARIOS.md#determinism-rules)) |
| Timeline events depend only on the day and stable inputs | 7 × 1 day must equal 1 × 7 days ([Time](SCENARIOS.md#time)) |
| Use `runtime.clock.now()` in services, not `new Date()` | Records follow simulated time |
| No real data: no real people, companies, emails, phone numbers, account numbers, secrets or API keys | Demos are public and fictional. Use `example.com` / `example.org` or `.example` domains. |
| Enforce permissions in services, not only in the UI | `session.assert()` makes the rule hold from the console too. Still say it is simulated, not security. |
| Honest states | A failed save must look failed. Show empty, loading and error states. Never fake success. |
| `erasableSyntaxOnly` | `tsconfig.base.json` forbids enums, namespaces and constructor parameter properties. Use `as const` objects and explicit fields. |
| `liveQuery` needs `deps` for every reactive input | Dexie runs the query outside Svelte's tracking ([why](DATABASE.md#reactive-reads-with-livequery)) |
| In `upgrade()` and `applyEvent()`, await only Dexie / `ctx` calls | They run inside IndexedDB transactions |
| Never delete user data in a migration unless asked | Edits in people's browsers cannot be regenerated |
| Never commit `artifacts/`, `dist/` or `.protoyard/` | Build output and caches are git-ignored |

## Prompts users can give an agent

Copy, adjust the bracketed parts, paste.

**1. A new prototype from an idea**

```text
In this Protoyard repo, create a new prototype for [a veterinary clinic
appointment scheduler]. Follow docs/AGENT_GUIDE.md: pick a free slug, start
from the template that fits best (`pnpm protoyard list --kind template`),
then build the schema, policy (owner, receptionist, vet, viewer), services,
at least 4 scenarios (empty clinic, busy Monday, read-only viewer, offline)
with a deterministic generator and integrity rules, and the screens. Use
@protoyard/ui components and theme tokens. Add generator and service tests.
Finish with `pnpm protoyard validate <slug> --build` and
`pnpm protoyard export <slug>`. Do not touch other prototypes and do not
publish.
```

**2. Add a scenario to an existing prototype**

```text
In prototypes/[crm-demo], add a scenario "[quarter-end-crunch]": [the same
company as growing-team, 3x the deals in negotiation, actor is the admin].
Follow the walkthrough in docs/SCENARIOS.md: add it to
src/scenarios/index.ts and protoyard.json, extend the generator only through
`scenario.generators` knobs, bump generatorVersion if existing worlds change,
keep integrity at zero violations and add a test. Run
`pnpm protoyard scenario validate [crm-demo]` and `pnpm vitest run
prototypes/[crm-demo]`.
```

**3. A schema change with a migration**

```text
In prototypes/[my-idea], add [a `priority` field (low/normal/high, indexed)
to notes]. Add a NEW database version with a non-destructive upgrade that
backfills existing rows, bump storage.schemaVersion in protoyard.json, update
the generator, services, UI and tests. Follow the migration rules in
docs/DATABASE.md. Verify with `pnpm protoyard validate [my-idea] --build`.
```

**4. Ship it**

```text
Export prototypes/[my-idea] and show me the publish plan: run
`pnpm protoyard export [my-idea]` and
`pnpm protoyard publish [my-idea] --provider cloudflare --dry-run --json`,
then tell me the exact command, the project name and what I need to log in
with. Do not deploy until I confirm.
```

## Machine-readable output

Every command accepts `--json` and writes exactly one envelope to stdout.
Logs and pnpm's script header go to stderr, so piping works:

```bash
pnpm protoyard list --json | jq '.data.entries[].slug'
pnpm protoyard validate my-idea --json
pnpm protoyard publish my-idea --provider cloudflare --dry-run --json
```

```text
{ "ok": true,  "command": "<name>", "data": { … } }
{ "ok": false, "command": "<name>", "error": { "code": "…", "message": "…", "hint": "…" }, "data"?: { … } }
```

| Exit | Meaning | `error.code` values |
| --- | --- | --- |
| `0` | Success | |
| `1` | Failure | `failure`, `conflict` (for example, the slug folder exists) |
| `2` | Usage | `usage` (missing `--template`, bad `--base`, `--production` without `--yes`), `unsafe_path` |
| `3` | Not found | `not_found` (unknown slug or template, no build to preview) |
| `4` | Validation | `validation` (failed checks, incomplete build, isolation failure) |
| `5` | Provider or auth | `provider`, `auth` |

Other global options: `-y, --yes` (never prompt; implied by `CI=1`),
`-q, --quiet`, `--no-color` (or `NO_COLOR=1`), `--cwd <dir>`,
`--root <dir>` (or `PROTOYARD_ROOT`).

Useful JSON fields:

| Command | Fields |
| --- | --- |
| `list` | `data.entries[]` (`slug`, `kind`, `template`, `scenarios`, `namespace`, `path`…) |
| `new` | `data.path`, `data.created`, `data.install.ok`, `data.nextSteps` |
| `export` | `data.zip`, `data.sha256`, `data.base`, `data.isolation` |
| `publish --dry-run` | `data.command` (argv), `data.commandLine`, `data.toolAvailable`, `data.experimental` |
| `publish` | `data.url`, `data.deploymentId` |
| `dev` | `data.url`, `data.port` (the process keeps running) |

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Missing --template <name>.` | `new` needs a template | `pnpm protoyard list --kind template`, then pass `--template` |
| `prototypes/<slug> already exists and was not created from "<t>".` | Slug taken | Choose another slug. `--force` only reuses an empty folder. |
| `Scenario "<id>" is not listed in protoyard.json "scenarios".` | New scenario not declared | Add the id to `protoyard.json → scenarios` |
| `protoyard.json storage.schemaVersion (N) must equal the latest database version (M).` | Added a version without bumping the manifest (or the reverse) | Make them equal |
| `Table "py_x" uses the reserved "py_" prefix.` | Domain table named `py_*` | Rename it |
| `Generator for scenario "<id>" produced N integrity violation(s)` | A row references a missing id, has a duplicate id, or a date outside the organization's lifetime | Read the listed `table#row.field` entries; fix the generator, not the rules |
| `table "<x>" is not declared in database/schema.ts` | The generator returns a table the schema lacks | Add it to the schema (new version) or stop generating it |
| Type error on a scenario with `extends` (`missing … seed, referenceTime`) | `ScenarioInput` requires both on every entry | Repeat `seed` and `referenceTime` ([walkthrough](SCENARIOS.md#write-your-own-scenario)) |
| A list does not update when a filter or route param changes | `liveQuery` without `deps` | `liveQuery(fn, { deps: () => [id, filter] })` |
| Boot screen: "This browser holds data for schema vN of this prototype, but the code only knows vM." | You lowered `schemaVersion`, or opened older code against newer data | Restore the version, or use "Reset prototype data…" on the boot screen (deletes only this prototype's data) |
| Migration fails with a transaction error | `upgrade()` awaited something other than Dexie | Await only `tx` table calls |
| svelte-check: "This syntax is not allowed when 'erasableSyntaxOnly' is enabled" | Enum, namespace or parameter property | Replace with `as const` objects and explicit fields |
| `The <slug> bundle contains code from other prototypes.` | An import reaches into another prototype | Remove it; share code through `packages/` only with the user's agreement |
| `Not authenticated with Cloudflare Pages (not logged in).` (exit 5) | No Wrangler login or token | Ask the user to run `npx wrangler login` or set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; never ask for the token in chat |
| `Publishing to production needs explicit confirmation.` | `--production` without `--yes` | Only add `--yes` if the user asked for production |
| Port busy | Another server on `5173` / `4173` | Nothing to do: `dev` and `preview` pick the next free port and print it |
| After stopping `pnpm dev`, the gallery is still served on `4321` | Astro can detach its dev server into the background when it is not attached to a terminal (seen when run by an agent) | `pnpm --filter @protoyard/gallery exec astro dev stop` |
| Blank page from an unzipped build | Opened through `file://` | Serve it over HTTP ([PUBLISHING.md](PUBLISHING.md#export-and-the-zip)) |

When a check fails, run the single failing command with `--json` and read
`error.hint` before changing code. `pnpm protoyard doctor --offline` checks
the environment (Node, pnpm, dependencies, templates, registry, Playwright,
provider CLIs).
