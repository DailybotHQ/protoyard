# Doc template

Report **kind** starter (`blueprintKind: "doc"`). Renders
`@protoyard/pages-ui` `DocApp` from `blueprint.json` with TOC and print,
through `defineKindRuntime`.

`src/app.css` loads the same base as the player
(`@protoyard/renderer-svelte/app.css`: Tailwind, theme tokens and
`@protoyard/ui`), then the kit stylesheets a report renders: blocks-ui, the
charts and views kits that chart, map and timeline blocks load, and pages-ui.
Each kit stylesheet registers its own Tailwind sources; `@source "./"` adds
this prototype's markup. `src/App.svelte` imports the template's own
`./embed-host.ts`, so the code works unchanged once copied to
`prototypes/<slug>/`.

```bash
pnpm protoyard dev doc
pnpm vitest run templates/doc
pnpm protoyard validate doc --build
```
