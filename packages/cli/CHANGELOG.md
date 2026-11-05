# @protoyard/cli

## 1.2.3

### Patch Changes

- @protoyard/player@1.2.3
  - @protoyard/blocks@1.2.3
  - @protoyard/blueprint@1.2.3
  - @protoyard/core@1.2.3
  - @protoyard/crud@1.2.3
  - @protoyard/decks@1.2.3
  - @protoyard/offline@1.2.3
  - @protoyard/renderer-svelte@1.2.3
  - @protoyard/review@1.2.3
  - @protoyard/scenarios@1.2.3
  - @protoyard/templates@1.2.3
  - @protoyard/themes@1.2.3

## 1.2.2

### Patch Changes

- @protoyard/crud@1.2.2
  - @protoyard/player@1.2.2
  - @protoyard/renderer-svelte@1.2.2
  - @protoyard/blocks@1.2.2
  - @protoyard/blueprint@1.2.2
  - @protoyard/core@1.2.2
  - @protoyard/decks@1.2.2
  - @protoyard/offline@1.2.2
  - @protoyard/review@1.2.2
  - @protoyard/scenarios@1.2.2
  - @protoyard/templates@1.2.2
  - @protoyard/themes@1.2.2

## 1.2.1

### Patch Changes

- A prototype generated in a consumer workspace typechecks and builds: `generate` (and `blueprint new --generate`) no longer writes the starter `tests/services.test.ts`, which imports this repository's `tests/support/` harness. `tests/generators.test.ts` is still written. `verify:packages` now generates a catalog blueprint in the packed consumer and runs `validate --build` on it.
- @protoyard/blocks@1.2.1
  - @protoyard/blueprint@1.2.1
  - @protoyard/core@1.2.1
  - @protoyard/crud@1.2.1
  - @protoyard/decks@1.2.1
  - @protoyard/offline@1.2.1
  - @protoyard/player@1.2.1
  - @protoyard/renderer-svelte@1.2.1
  - @protoyard/review@1.2.1
  - @protoyard/scenarios@1.2.1
  - @protoyard/templates@1.2.1
  - @protoyard/themes@1.2.1

## 1.2.0

### Minor Changes

- A first-class consumer workspace (`npm create protoyard`). `generate`, `blueprint new --from-brief --generate`, `quick promote` and `new --from` write the installed Protoyard version instead of `workspace:*`, and keep a consumer's own `workspace:` packages. `protoyard.workspace.json` accepts local `templates` and a `showcase.templates` default. New commands: `validate --all [--build]`, `check texuli` (the Texuli adoption rules for any workspace), `sweep <slug>` (light/dark × desktop/phone PNGs), and `gallery build` / `gallery preview`. `protoyard/capture` and `protoyard/static-server` are public subpaths. The catalog blueprints ship in `@protoyard/templates`, the gallery ships its guides, and `showcase` copies the published player build.
- Design systems for every prototype kind. `ds use` wires deck, page and doc prototypes (`brandTheme` and `defaultThemeId`, now accepted by `definePrototypeFromPage` and `definePrototypeFromDoc`), adds `@protoyard/themes` at the right version when a prototype lacks a runtime dependency, and refreshes the generated spec regions. `ds new --from-theme-file <path>` imports a prototype's own theme. `defineDesignSystemTheme(compiled, { fontBase, description })` resolves fonts from a package and carries the document's description.

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @protoyard/templates@1.2.0
  - @protoyard/themes@1.2.0
  - @protoyard/blueprint@1.2.0
  - @protoyard/core@1.2.0
  - @protoyard/renderer-svelte@1.2.0
  - @protoyard/decks@1.2.0
  - @protoyard/player@1.2.0
  - @protoyard/crud@1.2.0
  - @protoyard/blocks@1.2.0
  - @protoyard/offline@1.2.0
  - @protoyard/review@1.2.0
  - @protoyard/scenarios@1.2.0

## 1.1.3

### Patch Changes

- @protoyard/blocks@1.1.3
  - @protoyard/blueprint@1.1.3
  - @protoyard/core@1.1.3
  - @protoyard/crud@1.1.3
  - @protoyard/decks@1.1.3
  - @protoyard/offline@1.1.3
  - @protoyard/player@1.1.3
  - @protoyard/renderer-svelte@1.1.3
  - @protoyard/review@1.1.3
  - @protoyard/scenarios@1.1.3
  - @protoyard/templates@1.1.3
  - @protoyard/themes@1.1.3

## 1.1.2

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.1.2
  - @protoyard/blocks@1.1.2
  - @protoyard/blueprint@1.1.2
  - @protoyard/crud@1.1.2
  - @protoyard/offline@1.1.2
  - @protoyard/player@1.1.2
  - @protoyard/renderer-svelte@1.1.2
  - @protoyard/review@1.1.2
  - @protoyard/scenarios@1.1.2
  - @protoyard/themes@1.1.2
  - @protoyard/decks@1.1.2
  - @protoyard/templates@1.1.2

## 1.1.1

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.1.1
  - @protoyard/blocks@1.1.1
  - @protoyard/blueprint@1.1.1
  - @protoyard/crud@1.1.1
  - @protoyard/offline@1.1.1
  - @protoyard/player@1.1.1
  - @protoyard/renderer-svelte@1.1.1
  - @protoyard/review@1.1.1
  - @protoyard/scenarios@1.1.1
  - @protoyard/themes@1.1.1
  - @protoyard/decks@1.1.1
  - @protoyard/templates@1.1.1

## 1.1.0

### Minor Changes

- 085df93: Design systems from Texuli: `createDesignSystem` builds a Texuli design-system document from a brief or a few inputs (colors, fonts, shape, density, motion, contrast). `designSystemFromTheme` imports any Protoyard theme. `compileDesignSystemDocument` validates and compiles a document at `trust: 'untrusted'` with Texuli's compile-core, and `defineDesignSystemTheme` applies it with `applyDesignSystem`. The CLI gains `protoyard ds new|validate|export|use`, `protoyard mcp` gains `ds_create`, `ds_validate`, `ds_export` and `ds_use`, and Theme Studio gains a Design system panel. The compiler loads only on demand, so a chunked prototype build without a design system does not grow. Quick single-file exports, which ship DevTools inline, grow by about 88 KB raw for the Design system panel.
- dfdf50e: All 204 Texuli library themes are offered by default: the 64-theme catalog plus the 140 expanded themes from `@texuli/tokens/library-expand`, loaded on demand. The `theme` CLI, DevTools' theme browser and Theme Studio, Deck Studio, the player and generated-app settings screens, `?theme=` and every theme id in a manifest, scenario or blueprint resolve them. A single-file export embeds only the expanded theme it uses.
- dfdf50e: `quick serve` paints a deck, page or doc while its file is still being written: the server finds the valid part of the truncated JSON (`paintStreamedBlueprint`), serves it as a draft, and the player applies it as untrusted input with a "Receiving the deck" notice until the complete file lands. Apps paint only once complete.

### Patch Changes

- dfdf50e: `generate` records the content-kind runtime's storage schema (`KIND_SCHEMA_VERSION`, now 2) in a deck, page or doc prototype's manifest and generation snapshot. Regenerating one made at version 1 upgrades it, and the drift check reports a content-kind manifest that is behind.
- dfdf50e: Each player kind page loads only its own renderer, and a single-file export leaves out what its kind never runs, so a deck file no longer carries the doc editor and forms. Single-file caps are lowered to the measured maximum + 5 % (app 4,065,196 B, deck 2,801,658 B, page 2,464,489 B).
- Updated dependencies [dfdf50e]
- Updated dependencies [085df93]
- Updated dependencies [dfdf50e]
- Updated dependencies [dfdf50e]
- Updated dependencies [dfdf50e]
- Updated dependencies [dfdf50e]
- Updated dependencies [dfdf50e]
- Updated dependencies [dfdf50e]
- Updated dependencies [dfdf50e]
- Updated dependencies [085df93]
- Updated dependencies [dfdf50e]
  - @protoyard/core@1.1.0
  - @protoyard/themes@1.1.0
  - @protoyard/blueprint@1.1.0
  - @protoyard/decks@1.1.0
  - @protoyard/player@1.1.0
  - @protoyard/crud@1.1.0
  - @protoyard/renderer-svelte@1.1.0
  - @protoyard/blocks@1.1.0
  - @protoyard/offline@1.1.0
  - @protoyard/review@1.1.0
  - @protoyard/scenarios@1.1.0
  - @protoyard/templates@1.1.0
