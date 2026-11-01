# Design Kit prototype

This template is a component library starter. Keep catalog entries searchable, demo imports lazy, review writes behind `src/domain/reviews.ts`, and sketch writes behind `src/domain/sketches.ts`.

- Put visual foundations in the Foundation section of `src/App.svelte`.
- Add demo source under `src/demos/components/` and register it in `src/catalog/entries.ts`.
- Add `@prop name: type — description` comments in component source to populate its generated prop table.
- Keep demo content fictional and offline. Do not render untrusted HTML.
- Only `src/Sketches.svelte` (loaded lazily) may import `src/domain/sketches.ts` or `@protoyard/views-ui/canvas`; the seeded sketch in `src/scenarios/sketches.ts` stays plain data. Bump `generatorVersion` when it changes.
- Run `pnpm vitest run tests/integration/templates.test.ts -t design-kit`, then typecheck and build this template before shipping changes.
