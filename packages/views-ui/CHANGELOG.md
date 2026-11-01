# @protoyard/views-ui

## 1.1.0

### Minor Changes

- dfdf50e: Kits render more of Texuli: `NotificationCenter` on Texuli's notification inbox, analytics filters on `FilterBuilder` with Texuli's property catalog, cohort heat cells on Texuli's checked heat scale, the analytics dashboard on Texuli's dashboard grid, and the AI `MessageList` keeps its reading position and day rows through Texuli.
- dfdf50e: New lazy views: `@protoyard/views-ui/sheet` (`SheetView`, a spreadsheet with formulas, CSV download and import, over `@texuli/sheets`) and `@protoyard/views-ui/canvas` (`CanvasView`, an infinite canvas with frames, sticky notes, connectors and SVG export, over `@texuli/canvas`). Both persist through a service callback and validate stored data as untrusted input. Blueprints gain `sheet` and `canvas` screen types (`@protoyard/crud/screens/sheet` and `/screens/canvas`), and `@protoyard/views/scenarios` gains `generateSheetWorkbook` and `generateCanvasBoard`.

### Patch Changes

- dfdf50e: A doc's Edit and Reset follow a persona switch without a reload. The sheet view's "Import CSV" accepts a second file after the first.
- Updated dependencies [dfdf50e]
- Updated dependencies [dfdf50e]
- Updated dependencies [dfdf50e]
- Updated dependencies [085df93]
- Updated dependencies [dfdf50e]
  - @protoyard/core@1.1.0
  - @protoyard/renderer-svelte@1.1.0
  - @protoyard/views@1.1.0
  - @protoyard/ui@1.1.0
  - @protoyard/ai@1.1.0
