# Page template

Landing-page **kind** starter (`blueprintKind: "page"`). Renders
`@protoyard/pages-ui` `PageApp` from `blueprint.json` through
`defineKindRuntime`. Includes a waitlist form whose responses persist in
IndexedDB via `@protoyard/pages` form services: `PageApp` provides them from
the kind runtime, so the form validates and saves exactly as in the player
(`tests/page-form.test.ts`).

`src/app.css` loads the same base as the player
(`@protoyard/renderer-svelte/app.css`: Tailwind, theme tokens and
`@protoyard/ui`), then the kit stylesheets the page renders: blocks-ui, the
charts and views kits that chart, map and timeline blocks load, and pages-ui.
Each kit stylesheet registers its own Tailwind sources; `@source "./"` adds
this prototype's markup. `src/App.svelte` imports the template's own
`./embed-host.ts`, so the code works unchanged once copied to
`prototypes/<slug>/`.

```bash
pnpm protoyard dev page
pnpm vitest run templates/page
pnpm protoyard validate page --build
```
