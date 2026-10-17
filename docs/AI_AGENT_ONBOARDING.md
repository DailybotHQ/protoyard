# AI Agent Onboarding

A first-session checklist for any coding agent working in this repository.
Read [AGENTS.md](../AGENTS.md) first; this page is the hands-on version.

## 1. Orient (5 minutes)

1. Read `AGENTS.md`, then [ARCHITECTURE.md](ARCHITECTURE.md) and
   [PRODUCT_SPEC.md](PRODUCT_SPEC.md).
2. Skim the contracts in `packages/core/src/` (`prototype.ts`, `runtime.ts`,
   `scenario.ts`). Everything else implements them.
3. Pick a reference prototype close to your task:
   - `prototypes/crm-demo`: desktop SaaS (CRUD, kanban, roles, migration)
   - `prototypes/mobile-banking-demo`: mobile app (atomic ledger transfers)
   - `prototypes/ai-chat-demo`: streaming, real-time-feeling UI

## 2. Set up and verify the baseline

```bash
corepack enable
pnpm install
pnpm protoyard doctor          # all checks should pass (Playwright optional)
pnpm protoyard list            # see prototypes and templates
pnpm test                      # the whole suite should be green before you start
```

If `pnpm test` is red before you change anything, stop and report it.
Don't build on a broken baseline.

## 3. Do the work

- **New prototype:** `pnpm protoyard new <slug> --template <blank|dashboard|mobile-app|chat|onboarding|task-manager|ecommerce>`
  (`pnpm protoyard list --kind template` shows what exists). Then follow
  [AGENT_GUIDE.md](AGENT_GUIDE.md).
- **Engine or UI change:** find the owning package (see the table in
  `AGENTS.md`), read its `README.md`, and change the smallest thing.
- **Scope:** touch only the prototype or package the task names. Never edit
  another prototype's folder.

## 4. Validate (choose gates from what you touched)

| You touched | Run |
| --- | --- |
| `prototypes/<slug>/**` | `pnpm vitest run prototypes/<slug>` → `pnpm protoyard validate <slug> --build` |
| `packages/<pkg>/**` | `pnpm vitest run packages/<pkg>` → `pnpm --filter @protoyard/<pkg> typecheck` → `npx biome check packages/<pkg>` |
| `packages/core/**` or root config | `pnpm check` (full) |
| UI that users see | Also open it: `pnpm protoyard dev <slug>` or `build` + `preview`, and check it in a browser |

Details and blind spots are in [TESTING_GUIDE.md](TESTING_GUIDE.md).

## 5. Finish

- Conventional Commit with the right scope. Stage exact paths only.
- Report what changed, the commands you ran and their results, and anything
  you could not verify. Never claim a publish URL, benchmark or browser check
  you did not actually observe.

## Where things live

| Need | Look in |
| --- | --- |
| Manifest fields | `packages/core/src/manifest.ts` |
| Scenario presets and helpers | `packages/scenarios/src/{presets,compose,identity}.ts` |
| Reactive data in Svelte | `packages/renderer-svelte/src/bindings.svelte.ts` (`liveQuery`, `usePrincipal`, `can`) |
| Components | `packages/ui/src/index.ts` (a live catalog runs in `prototypes/ui-kit`) |
| Themes and tokens | `packages/themes/src/presets.ts`, `base.css` |
| CLI behavior | `packages/cli/src/commands/*.ts` |
| Test helpers | `tests/support/{runtime,generate-context}.ts` |
