# @protoyard/cli

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
