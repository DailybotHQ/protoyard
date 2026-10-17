---
name: create-prototype
description: Create a new Protoyard prototype from a template with the CLI, then build its domain, scenarios, UI and tests, validate it and export it.
version: "1.0.0"
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Edit, Write
# === Documentation (ignored by harnesses, useful for humans) ===
tier: standard
intent: create
max-files: 25
---

# Skill: Create a prototype

## Goal

Produce a new, independent `prototypes/<slug>` app that behaves like the real
product: persistent data, roles that matter, deterministic scenarios, honest
failures, passing tests, a production build and a portable ZIP.

## When to use

- "Build a prototype / demo / clickable mock of …" (`/new-prototype`).
- A variant of an existing prototype: always a **new slug**, never edits to
  the original.

## Non-goals

- Changing engine packages or templates (use `executor` / `architect`).
- Publishing to a provider (use `publish-prototype`).

## Inputs

- `slug` — kebab-case, 2 to 48 characters (checked by `checkSlug` in
  `packages/core/src/slug.ts`).
- `template` — one of the entries in `pnpm protoyard list --kind template`.
- A brief: entities, roles, screens, the states worth showing.

## Steps

1. **Pick a template.** `pnpm protoyard list --kind template`. Read its
   `src/prototype.ts` first: it wires schema → policy → scenarios → generator.
2. **Scaffold.**
   ```bash
   pnpm protoyard new <slug> --template <template> --name "<Display Name>" --description "<one line>"
   ```
   `new` runs `pnpm install` to link the package. In a shared checkout where
   you are not the lockfile owner, add `--no-install` and ask the owner to
   install (`docs/AI_AGENT_COLLAB.md`). `new` refuses non-empty folders.
3. **Manifest.** Edit `prototypes/<slug>/protoyard.json` (schema:
   `PrototypeManifestSchema` in `packages/core/src/manifest.ts`): `category`,
   `tags`, `platform`, `icon`, `defaultScenario`, `defaultTheme`,
   `defaultMode`, `preview.viewport`, and `scenarios`. Keep
   `storage.namespace` unique.
4. **Domain model.** Run the `add-entity` skill for each table:
   `src/database/schema.ts` → `src/domain/policy.ts` → `src/domain/services.ts`.
5. **Scenarios.** Run the `add-scenario` skill: `src/scenarios/index.ts`,
   `src/scenarios/generators.ts`, integrity in `src/prototype.ts`, ids in
   `protoyard.json`.
6. **UI.** Routes in `src/App.svelte` (hash router from
   `@protoyard/renderer-svelte`), screens in `src/screens/`, local pieces in
   `src/components/`. Compose `@protoyard/ui`; read with
   `liveQuery(querier, { initial, deps })`; mutate only through services via
   `runService()`. Each screen handles loading, empty and error. Use
   `add-ui-component` for new components.
7. **Run it.** `pnpm protoyard dev <slug>` and walk each scenario with
   DevTools (persona, time, network, theme).
8. **Tests.** `prototypes/<slug>/tests/generators.test.ts` (determinism +
   integrity for every scenario) and `tests/services.test.ts` (persistence
   across reload, permission denial, validation issues, offline writes
   nothing). Models: `prototypes/crm-demo/tests/`. Browser flows:
   `write-e2e`.
9. **README.** `prototypes/<slug>/README.md`: purpose, personas, scenarios,
   run commands, and what is simulated.
10. **Validate and export.** Run the `validate-and-export` skill.

## Validation

```bash
npx biome check prototypes/<slug>
pnpm vitest run prototypes/<slug>                # non-empty Tests line
pnpm protoyard scenario validate <slug>          # every scenario consistent
pnpm protoyard validate <slug> --build           # exit 0
pnpm protoyard export <slug>                     # ZIP path, size, sha256, isolation OK
```

## Notes

- Write only inside `prototypes/<slug>`; never import from another prototype.
- Fictional data only (`example.com`, `.example`); money in integer cents.
- No dead buttons, fake success or placeholder screens.
- Set `"status"` in `protoyard.json` to `ready` only after every gate passes.
