# AGENTS.md — Page (`page`)

Entry point for agents working on the **page kind template**. Repository rules:
root [AGENTS.md](../../AGENTS.md). Spec standard: [docs/SPECS.md](../../docs/SPECS.md).

## What this is

A level-2 **content-kind** template (`blueprintKind: "page"`). It mounts
`PageApp` from `@protoyard/pages-ui/page` with a runtime from
`definePrototypeFromPage` → `defineKindRuntime` (ADR-040). There is no second
empty-policy runtime: personas (presenter / audience / viewer) and form
capabilities (`form:submit`, `form:read`, `form:admin`) come only from the
kind runtime. Form rows use `@protoyard/pages` `FormResponse` /
`createFormServices`.

Content lives in `blueprint.json` (kind page body). Prefer editing that file
over hand-written screens.

## Index

- [docs/SPEC.md](docs/SPEC.md) — problem, users, boundaries
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) — kind stores
- [docs/FLOWS.md](docs/FLOWS.md) — waitlist form flow
- [docs/SCREENS.md](docs/SCREENS.md) — single scroll landing
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md) — kind roles

## Rules for this template

- Do not add entity CRUD tables; use kind stores (`blockStates`, `formResponses`).
- Forms go through services (never direct Dexie writes from components).
- Keep landing copy fictional (`example.com`).

## Quick commands

```bash
pnpm protoyard dev page
pnpm vitest run templates/page
pnpm protoyard validate page --build
pnpm protoyard export page
```
