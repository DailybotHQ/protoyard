# Review overrides for protoyard

Protoyard is a pnpm monorepo of browser-first prototypes. The framework-agnostic
engine lives in `packages/{core,database,scenarios,runtime}`, the Svelte 5
renderer, UI and DevTools in `packages/{renderer-svelte,ui,devtools,themes}`,
the Node CLI in `packages/cli` and the Astro gallery in `apps/gallery`.
Prototypes (`prototypes/*`) and templates (`templates/*`) are independent
Vite apps. There is no server, so the real attack surface is the CLI (file
system, child processes, the local control server) and untrusted data
imported into the browser (snapshots). The promises users rely on are
determinism, isolation and honesty.

## Severity overrides for this codebase

- **Always `critical`:** CLI file-system writes or deletes whose destination
  is not proven safe by the canonical guards — `childPath()` /
  `isInside()` (`packages/cli/src/lib/paths.ts`, realpath + case-aware) and
  `guardOutputDir()` (`packages/cli/src/lib/output-guard.ts`, the `--out`
  allow-list). This applies especially to `new`, `build --out`, `export`,
  `showcase` and anything derived from a slug, `--out` or `--cwd`. The
  documented allow-list is intended, not a finding: `artifacts/` and `tmp/`;
  elsewhere only missing, empty or marker-carrying folders (`.protoyard-out`,
  `.protoyard-showcase`); `--allow-external-out` applies the same rule outside
  the workspace. Slugs must pass `checkSlug` (`packages/core/src/slug.ts`) before
  any path is built.
- **Always `critical`:** child processes started with `shell: true`, or with
  user-controlled strings joined into a command line. Process spawning lives
  in `packages/cli/src/lib/{process,vite,dev-server}.ts` and
  `packages/cli/src/commands/serve.ts` and must pass argument arrays.
- **Always `critical`:** weakening the control server
  (`packages/cli/src/control-server.ts`). That covers binding to anything
  other than `127.0.0.1`, loosening the exact-Origin allow-list, accepting
  slugs that are not in the registry, or adding endpoints that write files.
- **Always `critical`:** evaluating imported data as code (`eval`,
  `new Function`, `{@html}` on user or snapshot content). Snapshots are
  untrusted. They must go through `parseSnapshotText`/`validateSnapshot`
  (`packages/core/src/snapshot.ts`) with the size limit, and a failed import
  must leave current data untouched (`packages/runtime/src/snapshots.ts`).
  `new Function` is only acceptable in `packages/themes/tests/*`.
- **Always `critical`:** a scenario load, reset or restore that touches
  databases outside `protoyard.<namespace>.{data,control}`, or a migration
  (`database.versions[].upgrade`) that deletes user rows without saying so.
- **Always `critical`:** secrets, tokens or real personal or financial data in
  fixtures, generators, snapshots, build output or CLI logs. Provider tokens
  (`CLOUDFLARE_API_TOKEN`, …) must never be printed (`packages/cli/src/publish/*`).
- **Escalate to `warning`:** any use of `Math.random()`, `Date.now()` or
  `new Date()` without an argument inside a generator, timeline or
  `applyEvent` (`prototypes/*/src/scenarios/*`, `templates/*/src/scenarios/*`,
  `packages/scenarios/src/*`). Seeded worlds must use `ctx.rng`, `ctx.faker`,
  `ctx.ids` and `ctx.time`.
- **Escalate to `warning`:** a timeline whose events depend on mutable record
  state (stages, statuses). Events must depend only on the day and stable ids,
  otherwise advancing 7×1 day stops equalling 1×7 days. See
  `prototypes/crm-demo/src/scenarios/generators.ts`.
- **Escalate to `warning`:** UI code that writes to Dexie tables directly
  instead of through a domain service, or a service that mutates without
  `session.assert` → validation → `environment.run` → `db.transaction`.
  Role checks done only in the UI are a bug.
- **Escalate to `warning`:** a `liveQuery(...)` querier that reads reactive
  state (route params, filters, form fields) without listing it in `deps`.
  The result goes stale silently.
- **Escalate to `warning`:** TypeScript that is not erasable (parameter
  properties, enums, namespaces). `tsconfig.base.json` sets
  `erasableSyntaxOnly` because Vite loads configs through Node's type
  stripping.
- **Escalate to `warning`:** importing prototype code into the gallery, or
  one prototype importing another's files. The gallery may only read the
  registry (`.protoyard/registry.json`).
- **Escalate to `warning`:** a change that alters generated output without
  bumping that prototype's `generatorVersion` (or `GENERATOR_SDK_VERSION` for
  SDK changes).

## Don't comment on

- Formatting. Biome (`biome.json`) is the formatter of record, and CI runs it.
- Non-null assertions in `**/tests/**`. These are allowed by an explicit
  Biome override.
- Fictional brand names, people and amounts in generators and demo data.
  They are intentional.
- Simulated permissions not being real security. That is a documented
  non-goal (docs/SECURITY.md); flag only service-level bypasses.

## Repo-specific conventions

- **Money:** integer cents (`*Cents`) in banking and e-commerce code, never
  floats (`prototypes/mobile-banking-demo/src/database/schema.ts`).
- **Ids:** seeded ids come from `ctx.ids.next('deal')` (`deal_0001`). Ids
  created at runtime use `createRuntimeId` (`deal_u…`). Never mix the two.
- **Manifests:** metadata lives only in the data-only `protoyard.json`
  (validated by `PrototypeManifestSchema`). `src/prototype.ts` imports it via
  `parseManifest`. `storage.schemaVersion` must equal the last database
  version.
- **Exports:** workspace packages export TypeScript source (`./src/index.ts`),
  and relative imports keep the `.ts` extension.
- **Svelte:** use Svelte 5 runes only. Shared reactive state lives in
  `.svelte.ts` files.
- **Accessibility:** every control needs a label. Destructive actions confirm
  through `AlertDialog`. Mobile touch targets are at least 44px.
- **Commits:** Conventional Commits with the scopes listed in AGENTS.md (rule 2).

## Test-strategy expectations

- New or changed services need tests in that prototype's
  `tests/services.test.ts`, run on the real runtime via
  `tests/support/runtime.ts`: persistence across reload, permission denial,
  and offline failure writing nothing.
- New scenarios or generator changes need determinism and integrity tests via
  `tests/support/generate-context.ts`.
- Engine changes (`packages/{core,database,scenarios,runtime}`) need unit
  tests in that package's `tests/`. A schema migration needs a test proving
  existing rows survive.
- CLI changes need tests in `packages/cli/tests/` covering `--json` envelope
  shape and exit codes.
