---
name: add-ui-component
description: Add an accessible, theme-aware Svelte 5 component either to the shared @protoyard/ui package with tests and an export, or locally to one prototype.
version: "1.0.0"
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Edit, Write
# === Documentation (ignored by harnesses, useful for humans) ===
tier: standard
intent: create
max-files: 5
---

# Skill: Add a UI component

## Goal

Create a component that uses Svelte 5 runes, Texuli components where
behavior is non-trivial, Tailwind token classes over `--py-*` variables,
Lucide icons, and is labeled and keyboard-usable — placed where it belongs.

## When to use

- A screen needs a piece `@protoyard/ui` does not provide.
- Several prototypes would reuse the same piece (shared), or only one would
  (local).

## Decide where it lives

| Question | Shared: `packages/ui` | Local: `prototypes/<slug>/src/components` |
| --- | --- | --- |
| Domain-free and useful to 2+ prototypes? | yes | no |
| Mentions domain types (deals, accounts…)? | never | fine |
| Owner | the `packages/ui` owner — ask first | the prototype's owner |
| Tests | required in `packages/ui/tests` | for real logic, in `prototypes/<slug>/tests` |

First check that it does not exist: the component table in
`packages/ui/README.md` and `ls packages/ui/src/components`.

## Steps — shared component

1. Create `packages/ui/src/components/<kebab-name>/<PascalName>.svelte`
   (plus `types.ts` or `<name>-variants.ts` when needed, like
   `packages/ui/src/components/button/`).
2. Props via `$props()` with a typed interface; children and slots as
   snippets; events as callback props (`onclick`, `onselect`); `class`
   merged with `cn()` from `packages/ui/src/lib/cn.ts`.
3. Styling: token classes only (`bg-background`, `text-muted-foreground`,
   `bg-primary`, `border-input`, `ring-ring`…). No hex colors. Respect
   `prefers-reduced-motion`. Touch targets at least 44px on mobile.
4. Accessibility: a semantic element or a Texuli component; an accessible
   name for every control (`aria-label` for icon-only buttons);
   `aria-hidden="true"` on decorative icons; visible focus; keyboard
   equivalents for pointer interactions.
5. Export it from `packages/ui/src/index.ts` in its group, and add it to the
   component table in `packages/ui/README.md`.
6. Test in `packages/ui/tests/<name>.test.ts` with `@testing-library/svelte`,
   using a harness in `packages/ui/tests/fixtures/` when it needs snippets
   (pattern: `packages/ui/tests/button.test.ts` + `fixtures/ButtonHarness.svelte`).
   Query by role and accessible name, assert keyboard behavior and states,
   and `cleanup()` after each test.
7. Because every prototype consumes `packages/ui`, also type check one
   prototype: `pnpm --filter @prototype/crm-demo typecheck`.

## Steps — local component

1. Create `prototypes/<slug>/src/components/<PascalName>.svelte` (examples:
   `prototypes/crm-demo/src/components/DealDialog.svelte`,
   `StageBadge.svelte`).
2. Compose `@protoyard/ui` pieces; mutations go through services via
   `runService()`; show `ValidationError.issues` inline with `FormField`.
3. Test non-trivial logic in `prototypes/<slug>/tests/`.

## Validation

```bash
npx biome check packages/ui            # or prototypes/<slug>
pnpm --filter @protoyard/ui typecheck  # or @prototype/<slug>
pnpm vitest run packages/ui            # or prototypes/<slug>
```

## Notes

- Runes only: no `export let`, no `on:click`, no stores for local state.
- Never `{@html}` with data.
- Layout, focus traps and real drag and drop need a Playwright check
  (`write-e2e`); happy-dom cannot verify them.
