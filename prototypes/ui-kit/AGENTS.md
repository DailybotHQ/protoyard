# AGENTS.md — Protoyard UI Kit (`ui-kit`)

The entry point for agents working on this prototype. Repository-wide rules
live in the root [AGENTS.md](../../AGENTS.md); the spec standard is
[docs/SPECS.md](../../docs/SPECS.md).

## Index

- [docs/SPEC.md](docs/SPEC.md): problem, users, capabilities, honest boundaries, rebuild path
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): tables, indexes, relations, schema versions
- [docs/FLOWS.md](docs/FLOWS.md): user flows mapped to services, capabilities and tables
- [docs/SCREENS.md](docs/SCREENS.md): routes, screens and their states
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md): roles × capabilities, rules, personas

## Rules for this prototype

- This is a showcase of `@protoyard/ui` and `@protoyard/themes`, not a
  business app. Demos use the shared components as published; a component
  bug is fixed in `packages/ui` (its owner), not patched in a demo.
- Every catalog entry needs three things that must agree: metadata in
  `src/catalog/entries.ts` (no Svelte imports, the generator uses it), a
  `src/demos/<Name>Demo.svelte`, and its `DEMOS` record (lazy `load`,
  usage `snippet`, `a11y` notes) in `src/catalog/registry.ts`. The test in
  `tests/demos.test.ts` fails when the two lists disagree.
- The only domain data is `favorites`: one row per persona and catalog
  entry id, written only through `createFavoriteServices`
  (`src/domain/favorites.ts`), which needs `favorites:manage`. Viewers see
  stars but cannot change them.
- Demos keep their state in memory (no database) and may use the wall
  clock and timers for typing and saving effects; nothing a demo does is
  persisted. Keep demo data fictional (`example.com`).
- Theme Lab actions go through the runtime theme controller
  (`saveCustom`, `setOverride`, `exportTheme`), not domain services; custom
  themes are capped at 24 and stored in the prototype's control database.
- Usage snippets are Svelte 5 runes syntax and must match the component's
  real props; update the snippet when a component API changes.

## Layout

```text
src/catalog/entries.ts    catalog metadata (no Svelte imports; used by the generator)
src/catalog/registry.ts   id → lazy demo component + usage snippet + a11y notes
src/demos/*Demo.svelte    one self-contained interactive demo per entry (+ chat.ts, members.ts, nav.ts)
src/screens/              routed pages (Overview, Group, Entry, ThemeLab, Forms, A11y, Favorites)
src/components/           CodeBlock, FavoriteButton, ShowcaseEntry, ThemePreview
src/domain/               policy + favorites services
src/lib/                  favorites live query, service cache, theme-lab helpers
src/scenarios/            scenarios + deterministic generator
tests/                    catalog, generator, service and theme-lab tests; a render test per demo
```

## Quick commands

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev ui-kit                  # run it (DevTools included)
pnpm vitest run prototypes/ui-kit          # unit + integration tests
pnpm protoyard validate ui-kit --build     # contract, schema, build
pnpm protoyard spec ui-kit --check         # generated spec regions are current
pnpm protoyard export ui-kit               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
