# Design systems

A Protoyard design system is Texuli's design-system document
(`format: "texuli/design-system"`): brand colors, typography, shape, density,
motion and component tokens in one JSON file. Protoyard validates it with
Texuli as untrusted input, compiles it to `--tx-*` variables for light and
dark, and paints it with Texuli's runtime. The same inputs always give the
same document and the same hash.

## Create one

From a few inputs (each is optional; give at least a brand color or a brief):

```bash
pnpm protoyard ds new harbor --name Harbor --brand '#0f766e' --font Inter --shape rounded --density compact --motion subtle
```

From a one-line brief (explicit inputs win over the brief):

```bash
pnpm protoyard ds new atlas --brief "brand #4f46e5, font Geist, heading font Fraunces, sharp, comfortable"
```

From an existing theme (a built-in or any library theme):

```bash
pnpm protoyard ds new ocean-ds --from-theme ocean
```

Each writes `design-systems/<id>.json` and prints the contrast result per
mode. `--dry-run` compiles without writing; `--force` replaces the file. An
imported theme lists what it could not keep exactly as notes (most Protoyard
themes get their `input` and dark `borderStrong` colors raised to 3:1).

## Check, export and apply

```bash
pnpm protoyard ds validate design-systems/harbor.json
pnpm protoyard ds export design-systems/harbor.json --format css
pnpm protoyard ds use crm-demo design-systems/harbor.json --dry-run
pnpm protoyard ds use crm-demo design-systems/harbor.json
pnpm protoyard spec crm-demo --write
pnpm protoyard validate crm-demo --build
```

`ds use` writes `src/design-system.ts`, adds the theme to
`definePrototype({ themes })` in `src/prototype.ts`, and sets `defaultTheme`.
It refuses a prototype without a `definePrototype({ … })` call or without the
`@protoyard/runtime` dependency, and another design system without `--force`.

## In the browser

DevTools → Look → **Open studio** → **Design system** creates one from a name,
a brief, a brand color, fonts, shape, density and motion, from the current
theme, or from pasted JSON, then **Save and apply**. It is kept per prototype
and browser; to put it in the repository, download the JSON and run `ds use`.

## Over MCP

`protoyard mcp` has `ds_create`, `ds_validate`, `ds_export` and `ds_use`, the
same commands with the same checks.

## Limits

- Component defaults (`components.<name>.defaults`) are compiled but not
  applied; tokens are.
- Level-1 player blueprints (decks, pages, docs, apps played without a build)
  do not carry a design system yet; generate the prototype and run `ds use`.
- Remote and `data:` URLs (logos, fonts) are refused: design systems are
  validated as untrusted.
