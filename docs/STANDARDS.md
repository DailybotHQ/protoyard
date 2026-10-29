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

## Components and Texuli

Protoyard's UI is Texuli-first ([TEXULI.md](TEXULI.md), [ADR-044](DECISIONS.md)).
Start with Texuli's published component or kit, then use a public
`@protoyard/*` export when it provides the host integration or stable Protoyard
contract. Do not build a generic component that duplicates Texuli.

- **Import public subpaths.** Use `texuli/<component>` and
  `@texuli/<package>/<export>` only where a package adapter needs Texuli
  directly. Never import package `src/` paths. Avoid the `@texuli/core` root
  barrel and static imports of the `@texuli/tokens` root; the latter includes
  the theme library in the initial chunk.
- **Icons have one rendering path.** Import `Icon` from `texuli/icons` for its
  ten built-in names. For any other glyph, import the glyph (for example
  `Activity`) from `@lucide/svelte`, then render it with `LucideIcon` from
  `texuli/icons/lucide`: `<LucideIcon icon={Activity} />`. Never render a raw
  Lucide component in markup.
- **Use the right choice control.** Use `Checkbox` or `RadioGroup`/
  `RadioGroupItem` for choices. `Input` binds `value`; never use
  `Input type="checkbox"` or `Input type="radio"`.
- **Bind DOM refs with `bind:ref`.** When a Texuli or `@protoyard/ui`
  component exposes an element ref, use `bind:ref` for DOM operations such as
  focus, selection, measurement, or scrolling. `bind:this` captures the
  component instance and is appropriate only when calling its component API.
  If the needed DOM ref is absent, keep a minimal adapter and record the
  Texuli gap; do not assume the component instance is an element.
- **Use `--tx-*` tokens for authored UI.** Existing `--py-*` aliases and
  explicitly excepted frame geometry remain for compatibility; new UI reads
  Texuli's `--tx-*` tokens. Use the theme utilities for semantic colors.
- **Keep the gap loop honest.** The adoption check enforces seven rules;
  tracked gaps may use minimal adapters listed in the pending files with a
  `gap` id. See [the adoption check and exception policy](TEXULI.md#texuli-first-the-adoption-check).

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
| CSS tokens | `--tx-<token>` for authored UI | `--tx-primary-foreground` |

## Errors and feedback

- Domain validation errors carry `issues: Record<field, message>` and render
  inline (see `ValidationError` in `prototypes/crm-demo/src/domain/services.ts`).
- `PermissionDeniedError` and `SimulatedServiceError` become toasts through
  `runService()`.
- Destructive actions confirm through `AlertDialog`. A failure must never look
  like success.
- Every async action shows that it is pending. A `@protoyard/ui` `Button`
  whose `onclick` returns a promise shows a spinner, sets `aria-busy` and
  blocks double clicks until it settles. So return the promise
  (`onclick={() => runService(() => save(input))}`) instead of discarding it
  (`() => void save()`), or pass `loading={busy}` for form submits. Custom
  controls set `aria-busy` and disable themselves the same way. The renderer
  adds a global top bar and `aria-busy` on the app root for every runtime
  operation (`environment.run`, scenario loads, time advances, snapshot
  restores, identity switches) after 150 ms, with no prototype code. Use
  `usePending()` for local "saving…" hints.

## Accessibility

Every control has a label. Focus is visible and keyboard paths exist (for
example, the pipeline "Move to…" menu next to drag-and-drop). Contrast meets
AA in light and dark mode (checked for theme presets in
`packages/themes/tests`). `prefers-reduced-motion` is honored. Touch targets
are at least 44px on mobile.

### Roving selection (`@protoyard/ui` `rovingKeydown`)

Single-choice groups that act as a `radiogroup` or `tablist` (segmented
controls, custom tab strips, toolbar toggles) share one keyboard helper in
`packages/ui/src/lib/roving.ts`:

- **Keys:** ArrowRight/Down and ArrowLeft/Up move with wrap-around; Home and
  End jump to the first and last **enabled** option; other keys are ignored.
- **Disabled:** options with `disabled: true` are skipped.
- **Selection follows focus:** the helper calls `select(nextValue)` and focuses
  the matching `[data-value="…"]` inside the nearest group.
- **Safe values:** focus moves via `data-value` attribute equality (not a CSS
  attribute selector), so option values may contain quotes, dots or brackets.
  `escapeSelectorValue` remains available for callers that still build selectors.
- **Tab order:** use `rovingTabIndex(value, entryValue, entries)` so only the
  selected option (or the first enabled one when empty) has `tabindex={0}`.

`Tabs` and `RadioGroup` (on `@texuli/primitives`) already implement roving
focus; use this helper for hand-rolled groups. Wire it on each option:

```ts
import { rovingKeydown, rovingTabIndex } from '@protoyard/ui';

onkeydown={(event) => rovingKeydown(event, options, value, select)}
tabindex={rovingTabIndex(value, option.value, options)}
// each option: data-value={option.value}
```

Covered by `pnpm vitest run packages/ui/tests/roving.test.ts`.

## Commits

Use Conventional Commits, `type(scope): summary`, with the scopes listed in
[CONTRIBUTING.md](../CONTRIBUTING.md). Stage exact paths, never
`git add -A`, when several agents share a checkout.
