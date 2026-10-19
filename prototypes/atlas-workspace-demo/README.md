# Atlas Workspace Demo

Atlas is a fictional operations and analytics workspace that demonstrates the Protoyard layout system with deterministic local data. It includes an overview, searchable customer and order workflows, role-aware settings, a layout gallery, a documentation-style playbook, a simulated access preview, and a three-step workspace tour. All records live in browser IndexedDB; there is no remote service or real sign-in.

## Start

```bash
pnpm protoyard dev atlas-workspace-demo
```

The default theme is the library theme `aurora-analytics`. DevTools can switch between these repeatable scenarios:

| Scenario | Data |
| --- | --- |
| `empty` | New workspace with no customers or orders |
| `active` | 36 customers and a regular order history (default) |
| `massive` | 180 customers and a dense order history for pagination and layout checks |
| `viewer` | The active world presented to a read-only persona |

## Layout gallery

Open **Layouts** and choose a light or dark preview. The supported layout ids are `sidebar`, `rail`, `top-nav`, `dual-sidebar`, `master-detail`, `dashboard-grid`, `docs`, `marketing`, `wizard`, and `auth-split`. A `?layout=<id>` URL override is shareable and does not change stored workspace data. Narrow widths follow each layout's fallback.

The Playbook route demonstrates content in the docs and marketing frames. The access preview explains that persona switching is a product simulation, not authentication. The workspace tour uses the wizard frame and advances through three orientation steps.

## Implementation map

- `src/prototype.ts` connects schema, policy, scenarios and the seeded generator.
- `src/domain/services.ts` keeps mutations behind permission checks, validation, simulated environment handling and transactions.
- `src/App.svelte` lazy-loads route screens and passes navigation to the shared `LayoutHost`.
- `src/screens/LayoutGallery.svelte` exposes each supported frame through a reproducible URL.
- `tests/generators.test.ts` covers repeatability, integrity and scenario density.
- `tests/e2e/atlas-workspace-demo.spec.ts` checks every frame at desktop width and runs axe in light and dark modes.

## Validation

```bash
pnpm vitest run prototypes/atlas-workspace-demo
pnpm protoyard validate atlas-workspace-demo --strict-spec --build
pnpm protoyard budget atlas-workspace-demo
```
