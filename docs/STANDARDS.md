# Standards

These are the coding rules for the whole workspace. The tooling enforces
most of them: Biome, `tsc` / `svelte-check` / `astro check`,
`erasableSyntaxOnly` and the tests. The rest are checked in review
([`.review/extension.md`](../.review/extension.md)).

## Language and tooling

| Area | Rule |
| --- | --- |
| Language | English everywhere: code, comments, UI copy, docs, commits. |
| TypeScript | `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, **`erasableSyntaxOnly`** (no parameter properties, enums or namespaces), `moduleResolution: Bundler` ([tsconfig.base.json](../tsconfig.base.json)). |
| Imports | Relative TS imports keep the `.ts` extension (`'./clock.ts'`). Type-only imports use `import type`. Biome organizes import order. |
| Formatting | Biome 2 ([biome.json](../biome.json)): 2 spaces, single quotes, ES5 trailing commas, semicolons, 100 columns. Run `pnpm biome:fix`. |
| Lint exceptions | Non-null assertions are allowed in `**/tests/**` only. Svelte and Astro files relax unused-variable rules because templates use them. |
| Packages | Workspace packages export TypeScript source (`"exports": { ".": "./src/index.ts" }`) and have no build step (ADR-004). |
| Versions | Ranges resolve under `minimumReleaseAge: 4320` (3 days) and `verifyDepsBeforeRun: false`. Only the lead or maintainer runs `pnpm install` and edits the lockfile. |

## Svelte 5

- Runes only: `$state`, `$derived`, `$effect`, `$props`, `$bindable`,
  snippets and `onclick=`. No Svelte 3/4 syntax (`export let`, `on:click`,
  stores for local state).
- Shared reactive state lives in `.svelte.ts` files (for example,
  `packages/renderer-svelte/src/bindings.svelte.ts`).
- Read data with `liveQuery(querier, { initial, deps })`. Every reactive input
  the querier reads goes in `deps`, because Dexie runs the querier
  asynchronously.
- Never use `{@html}` with user or snapshot data. Build elements instead.

## Prototype domain rules

```text
UI ─► service ─► session.assert(capability, record)  ─► zod validation ─► environment.run(op) ─► db.transaction('rw', …)
```

- Components never write tables directly. Mutations go through services in
  `src/domain/` and run through `runService()` for consistent feedback.
- Related writes share one transaction (a deal and its activity log; a
  transfer, both ledger rows and both balances).
- Generators use only `ctx.rng`, `ctx.faker`, `ctx.ids` and `ctx.time`.
  Never `Math.random()`, `Date.now()` or `new Date()` without an argument.
- Timelines emit events that depend only on the day and stable ids. Transitions
  are resolved in `applyEvent` (see `prototypes/crm-demo/src/scenarios/generators.ts`).
- Bump `generatorVersion` whenever the same seed can produce a different
  world. Bump `storage.schemaVersion` together with a new
  `database.versions` entry, and never delete rows silently in `upgrade`.
- Money is integer cents. Seeded ids come from `ctx.ids.next()`; runtime ids
  from `createRuntimeId()`.
- Demo data is fictional. Use `example.com`/`example.org`/`.example` domains,
  with no real people, companies, banks or PII.

## Naming

| Thing | Convention | Example |
| --- | --- | --- |
| Prototype slug / folder | kebab-case, 2–48 chars | `mobile-banking-demo` |
| Prototype id | dotted lowercase | `example.mobile-banking` |
| Prototype package | `@prototype/<slug>` | `@prototype/crm-demo` |
| Template package | `@protoyard-template/<name>` | `@protoyard-template/blank` |
| Capability | `resource:action` | `deals:update` |
| Scenario id | kebab-case | `growing-team` |
| Svelte components | PascalCase files | `DealDialog.svelte` |
| CSS tokens | `--py-<token>` | `--py-primary-foreground` |

## Errors and feedback

- Domain validation errors carry `issues: Record<field, message>` and render
  inline (see `ValidationError` in `prototypes/crm-demo/src/domain/services.ts`).
- `PermissionDeniedError` and `SimulatedServiceError` become toasts through
  `runService()`.
- Destructive actions confirm through `AlertDialog`. A failure must never look
  like success.

## Accessibility

Every control has a label. Focus is visible and keyboard paths exist (for
example, the pipeline "Move to…" menu next to drag-and-drop). Contrast meets
AA in light and dark mode (checked for theme presets in
`packages/themes/tests`). `prefers-reduced-motion` is honored. Touch targets
are at least 44px on mobile.

## Commits

Use Conventional Commits, `type(scope): summary`, with the scopes listed in
[CONTRIBUTING.md](../CONTRIBUTING.md). Stage exact paths, never
`git add -A`, when several agents share a checkout.
