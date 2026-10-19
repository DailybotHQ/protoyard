# CRUD app template

Blueprint-driven starter used as the base for `protoyard generate`. Two entities
(**project**, **task**), AppShell + Sidebar, `@protoyard/crud` list/form screens,
notifications bell, members page, and a ⌘K command palette.

## Layout

| Path | Role |
| --- | --- |
| `blueprint.json` | Data-only product model (ADR-017) |
| `src/generated/*` | Derived schema, policy, services, generator (hash-headed) |
| `src/database/schema.ts` | Contract re-export of generated stores |
| `src/scenarios/*` | empty / active / viewer / massive |
| `src/screens/*` | Home, entity pages, members |

## Commands

```bash
pnpm protoyard new my-app --template crud-app
pnpm protoyard dev my-app
pnpm vitest run templates/crud-app
pnpm protoyard validate crud-app --build
```

## Honesty

Roles and notifications are **simulated**. Services still run `session.assert` →
zod → `environment.run` → `db.transaction`. The generator is loaded lazily so
Faker stays out of the initial JS chunk.

## Layouts

The CRUD app starts with the sidebar layout and supports the icon rail and top
navigation. `LayoutHost` receives a data-only navigation model; search and
notifications remain available above the routed screen.
