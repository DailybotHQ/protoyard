---
name: fix-lint
description: Fix Biome lint and format errors and TypeScript, svelte-check or astro check errors in Protoyard, including erasable-syntax and strict-mode pitfalls, without weakening any rule.
version: "1.0.0"
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Edit
# === Documentation (ignored by harnesses, useful for humans) ===
tier: light
intent: fix
max-files: 10
---

# Skill: Fix lint and type errors

## Goal

Make `pnpm lint` and the relevant `typecheck` pass by fixing the code, never
by disabling rules, adding `// @ts-ignore`, or editing `biome.json` /
`tsconfig.base.json` (shared files with one owner).

## When to use

- `pnpm lint`, `npx biome check <path>`, `pnpm typecheck` or
  `pnpm --filter <package> typecheck` fails.

## Inputs

- The failing path or package, or the failing command output.

## Steps

1. **Scope the run.**
   ```bash
   npx biome check <path>                        # lint + format, one area
   pnpm --filter <package> typecheck             # tsc or svelte-check for one package/prototype
   ```
   Package names: `@protoyard/<pkg>` for `packages/*`, `@prototype/<slug>`
   for prototypes, `@protoyard/gallery` for `apps/gallery` (astro check).
2. **Apply safe Biome fixes** to the files you own:
   `npx biome check --write <path>` (the workspace-wide form is
   `pnpm biome:fix`; avoid it in a shared checkout, it touches other lanes'
   files). Re-run the check and fix what remains by hand.
3. **Erasable TypeScript** (`erasableSyntaxOnly`, configs load through Node
   type stripping):
   - Enum → `as const` object plus a union type
     (`export const STAGES = ['lead', 'won'] as const; type Stage = (typeof STAGES)[number];`).
   - Constructor parameter properties (`constructor(private readonly x: X)`)
     → declare the field and assign it in the body (see `ValidationError` in
     `prototypes/crm-demo/src/domain/services.ts`).
   - `namespace` → a module with named exports.
4. **Other strict-mode errors.**
   - `verbatimModuleSyntax`: type-only imports use `import type { … }`.
   - Relative imports keep the `.ts` extension (`'./clock.ts'`).
   - `noUncheckedIndexedAccess`: `arr[0]` is `T | undefined`; guard it
     (`const first = rows[0]; if (!first) throw …`) or use `?.`.
     Non-null assertions (`!`) are allowed only under `**/tests/**`.
5. **Svelte 5 (`svelte-check`).** Replace `export let` with `$props()`,
   `on:click` with `onclick`, `$:` with `$derived`/`$effect`, slots with
   snippets. Type props with an interface. Unused-variable rules are relaxed
   for `.svelte` and `.astro` files by `biome.json`; do not add more
   exceptions.
6. **Re-run** the exact failing commands, then the tests for the area
   (`pnpm vitest run <path>`) to confirm behavior did not change.

## Validation

```bash
npx biome check <path>
pnpm --filter <package> typecheck
pnpm vitest run <path>
```
Root config or `packages/core` changes: `pnpm check`.

## Notes

- `.agents/`, `tmp/`, `.dwp/`, `artifacts/` and build output are excluded
  from Biome by `biome.json`.
- If a rule looks wrong for the whole repository, propose the change to the
  owner of `biome.json` instead of suppressing it locally.
