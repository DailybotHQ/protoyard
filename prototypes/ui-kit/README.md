# Protoyard UI Kit

A living showcase of `@protoyard/ui` — itself a normal Protoyard prototype.

```bash
pnpm protoyard dev ui-kit
pnpm protoyard build ui-kit
```

| Page | Route |
| --- | --- |
| Overview (stats, groups, recently starred) | `#/` |
| Component groups — every component in its states, with copyable usage and a11y notes | `#/components/<group>` |
| One component (prev/next navigation) | `#/c/<id>` |
| Theme lab — all built-in themes in light and dark side by side (scoped `applyAppearance`), density/radius tuning, token table with live swatches and contrast ratios | `#/themes` |
| Forms with validation | `#/forms` |
| Patterns — dashboard, task board, team chat, mobile app | `#/components/patterns` |
| Accessibility — live contrast audit of the active theme, guarantees, keyboard map | `#/a11y` |
| Favorites | `#/favorites` |

## Domain

A deliberately tiny one: **favorites**, starred catalog entries persisted per persona in
IndexedDB (`favorites` table). Services follow the usual chain — `session.assert` →
validate → `environment.run` → Dexie transaction — so offline/failure simulation and
permissions apply.

| Scenario | Actor | What it shows |
| --- | --- | --- |
| `default` | Dana Reyes, designer | six favorites |
| `dark-viewer` | Sam Ito, viewer | dark mode; stars visible but locked (service-level `PermissionDeniedError`) |
| `empty` | Dana Reyes, designer | empty states |

## Structure

```text
src/catalog/entries.ts    catalog metadata (no Svelte imports; used by the generator)
src/catalog/registry.ts   id → live demo component + usage snippet + a11y notes
src/demos/*Demo.svelte    one self-contained interactive demo per entry
src/screens/              routed pages      src/components/  CodeBlock, ShowcaseEntry, ThemePreview…
src/domain/               policy + favorites services
src/scenarios/            scenarios + deterministic generator
tests/                    catalog/generator/service tests and a render test for every demo
```

To add a component to the kit: add an entry to `src/catalog/entries.ts`, a
`src/demos/<Name>Demo.svelte`, and its `DEMOS` record in `src/catalog/registry.ts`
(the test fails if the two lists disagree).
