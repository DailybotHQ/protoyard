# AGENTS.md — Doc (`doc`)

Entry point for agents working on the **doc kind template**. Repository rules:
root [AGENTS.md](../../AGENTS.md). Spec standard: [docs/SPECS.md](../../docs/SPECS.md).

## What this is

A level-2 **content-kind** template (`blueprintKind: "doc"`). It mounts
`DocApp` from `@protoyard/pages-ui/doc` with `definePrototypeFromDoc` →
`defineKindRuntime`. TOC and print come from pages-ui; runtime policy is the
shared kind stack (not a separate empty-policy definition).

Content lives in `blueprint.json` (kind doc body).

## Index

- [docs/SPEC.md](docs/SPEC.md) — problem, users, boundaries
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) — kind stores
- [docs/FLOWS.md](docs/FLOWS.md) — read, TOC, optional feedback form, print
- [docs/SCREENS.md](docs/SCREENS.md) — continuous document + TOC
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md) — kind roles

## Rules for this template

- Do not add entity CRUD tables; use kind stores.
- Prefer editing `blueprint.json` headings and blocks for the report body.
- Forms use `@protoyard/pages` `createFormServices` (never write Dexie from the UI).
- Keep numbers fictional.

## Quick commands

```bash
pnpm protoyard dev doc
pnpm vitest run templates/doc
pnpm protoyard validate doc --build
pnpm protoyard export doc
```
