# @protoyard/blueprint

## 1.2.4

### Patch Changes

- Updated dependencies
  - @protoyard/themes@1.2.4
  - @protoyard/decks@1.2.4
  - @protoyard/blocks@1.2.4
  - @protoyard/core@1.2.4
  - @protoyard/pages@1.2.4
  - @protoyard/scenarios@1.2.4

## 1.2.3

### Patch Changes

- @protoyard/blocks@1.2.3
  - @protoyard/core@1.2.3
  - @protoyard/decks@1.2.3
  - @protoyard/pages@1.2.3
  - @protoyard/scenarios@1.2.3
  - @protoyard/themes@1.2.3

## 1.2.2

### Patch Changes

- @protoyard/blocks@1.2.2
  - @protoyard/core@1.2.2
  - @protoyard/decks@1.2.2
  - @protoyard/pages@1.2.2
  - @protoyard/scenarios@1.2.2
  - @protoyard/themes@1.2.2

## 1.2.1

### Patch Changes

- @protoyard/blocks@1.2.1
  - @protoyard/core@1.2.1
  - @protoyard/decks@1.2.1
  - @protoyard/pages@1.2.1
  - @protoyard/scenarios@1.2.1
  - @protoyard/themes@1.2.1

## 1.2.0

### Minor Changes

- Design systems for every prototype kind. `ds use` wires deck, page and doc prototypes (`brandTheme` and `defaultThemeId`, now accepted by `definePrototypeFromPage` and `definePrototypeFromDoc`), adds `@protoyard/themes` at the right version when a prototype lacks a runtime dependency, and refreshes the generated spec regions. `ds new --from-theme-file <path>` imports a prototype's own theme. `defineDesignSystemTheme(compiled, { fontBase, description })` resolves fonts from a package and carries the document's description.

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @protoyard/themes@1.2.0
  - @protoyard/core@1.2.0
  - @protoyard/decks@1.2.0
  - @protoyard/blocks@1.2.0
  - @protoyard/pages@1.2.0
  - @protoyard/scenarios@1.2.0

## 1.1.3

### Patch Changes

- @protoyard/blocks@1.1.3
  - @protoyard/core@1.1.3
  - @protoyard/decks@1.1.3
  - @protoyard/pages@1.1.3
  - @protoyard/scenarios@1.1.3
  - @protoyard/themes@1.1.3

## 1.1.2

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.1.2
  - @protoyard/blocks@1.1.2
  - @protoyard/pages@1.1.2
  - @protoyard/scenarios@1.1.2
  - @protoyard/themes@1.1.2
  - @protoyard/decks@1.1.2

## 1.1.1

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.1.1
  - @protoyard/blocks@1.1.1
  - @protoyard/pages@1.1.1
  - @protoyard/scenarios@1.1.1
  - @protoyard/themes@1.1.1
  - @protoyard/decks@1.1.1

## 1.1.0

### Minor Changes

- dfdf50e: Docs can be edited in Texuli's `PageEditor` and downloaded as Word, PDF or Markdown (`@texuli/document`). Applied edits are saved per doc and world in the content-kind runtime's new `docEdits` store (database version 2, `KIND_SCHEMA_VERSION`) and survive a reload; "Reset to the original" removes them, and a viewer persona cannot edit. Saved edits are re-validated on every load and reported as stale when the doc changed.
- dfdf50e: Forms render through Texuli's `SchemaForm` (`@texuli/forms`): generated entity forms (`EntityForm`, mapped by the new `entityFormModel`), page and doc form blocks, and the SaaS kit's notification preferences and member invite. Texuli checks required and range rules before the service runs; every submission still goes through the entity, form-response or SaaS service, whose issues show inline. Relation, datetime, geo, avatar and file fields keep Protoyard controls. `EntityForm` gains optional `title` and `showTitle`.
- dfdf50e: Motion comes from Texuli: the renderer wraps every prototype in `MotionProvider` with its reduced-motion setting, and theme motion reaches the `--tx-motion-*` tokens. Blueprints of every kind take an optional, closed `motion: { level: "full" | "subtle" | "none" }`, a ceiling on every Texuli animation and on a deck's own transitions (reduced motion still wins); a blueprint without it parses and hashes as before.
- dfdf50e: `quick serve` paints a deck, page or doc while its file is still being written: the server finds the valid part of the truncated JSON (`paintStreamedBlueprint`), serves it as a draft, and the player applies it as untrusted input with a "Receiving the deck" notice until the complete file lands. Apps paint only once complete.
- dfdf50e: New lazy views: `@protoyard/views-ui/sheet` (`SheetView`, a spreadsheet with formulas, CSV download and import, over `@texuli/sheets`) and `@protoyard/views-ui/canvas` (`CanvasView`, an infinite canvas with frames, sticky notes, connectors and SVG export, over `@texuli/canvas`). Both persist through a service callback and validate stored data as untrusted input. Blueprints gain `sheet` and `canvas` screen types (`@protoyard/crud/screens/sheet` and `/screens/canvas`), and `@protoyard/views/scenarios` gains `generateSheetWorkbook` and `generateCanvasBoard`.

### Patch Changes

- Updated dependencies [dfdf50e]
- Updated dependencies [085df93]
- Updated dependencies [dfdf50e]
- Updated dependencies [dfdf50e]
- Updated dependencies [085df93]
  - @protoyard/core@1.1.0
  - @protoyard/themes@1.1.0
  - @protoyard/pages@1.1.0
  - @protoyard/decks@1.1.0
  - @protoyard/blocks@1.1.0
  - @protoyard/scenarios@1.1.0
