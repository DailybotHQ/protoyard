# CRUD app template

Blueprint-driven starter used as the base for `protoyard generate`. Two entities
(**project**, **task**) rendered by the shared app shell, `BlueprintApp` from
`@protoyard/crud/app`. It is the same shell the Protoyard player runs, with layout
navigation, entity list and form pages, a home overview, members, a ⌘K search palette
and the notifications bell when an entity enables notifications.

## Layout

| Path | Role |
| --- | --- |
| `blueprint.json` | Data-only product model (ADR-017) |
| `src/generated/*` | Derived schema, policy, services, generator (hash-headed) |
| `src/database/schema.ts` | Contract re-export of generated stores |
| `src/scenarios/*` | empty / active / viewer / massive |
| `src/App.svelte` | Lazily loads `BlueprintApp` and renders it with the blueprint (customize with `home`, `extraRoutes`, `recordHref`, `actions`) |
| `src/app.css` | Imports the renderer, CRUD and kit stylesheets; each registers its own markup with Tailwind |

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
navigation. `BlueprintApp` passes `LayoutHost` a data-only navigation model built
from the blueprint; search and notifications remain available above the routed
screen.
