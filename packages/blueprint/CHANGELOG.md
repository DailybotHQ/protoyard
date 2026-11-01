# @protoyard/blueprint

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
