# Protoyard UI Kit

A living showcase of `@protoyard/ui` — itself a normal Protoyard prototype.
Every component and pattern has a live demo, copyable usage and
accessibility notes; the Theme lab compares built-in and library themes,
tunes custom ones and shows live tokens with contrast ratios. Its only
stored data is each persona's **favorites** (starred entries, in IndexedDB).

```bash
pnpm protoyard dev ui-kit
pnpm protoyard build ui-kit
pnpm vitest run prototypes/ui-kit
```

Pages: Overview (`#/`), component groups (`#/components/<group>`), one
component (`#/c/<id>`), Theme lab (`#/themes`), Forms (`#/forms`),
patterns (`#/components/patterns`), Accessibility (`#/a11y`) and Favorites
(`#/favorites`). Scenarios: `default` (designer with favorites),
`dark-viewer` (read-only viewer in dark mode) and `empty`.

To add a component to the kit: add an entry to `src/catalog/entries.ts`, a
`src/demos/<Name>Demo.svelte`, and its `DEMOS` record in
`src/catalog/registry.ts` (the test fails if the two lists disagree).

## Docs

- [AGENTS.md](AGENTS.md): rules and folder layout for agents working on the kit
- [docs/SPEC.md](docs/SPEC.md): what the kit demonstrates, who uses it, honest boundaries, design-system mapping
- [docs/SCREENS.md](docs/SCREENS.md): every page and its states
- [docs/FLOWS.md](docs/FLOWS.md): favorites, Theme lab, forms and demo interactions
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) · [docs/PERMISSIONS.md](docs/PERMISSIONS.md)
