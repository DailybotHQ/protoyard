# @protoyard/views

## 1.1.0

### Minor Changes

- dfdf50e: New lazy views: `@protoyard/views-ui/sheet` (`SheetView`, a spreadsheet with formulas, CSV download and import, over `@texuli/sheets`) and `@protoyard/views-ui/canvas` (`CanvasView`, an infinite canvas with frames, sticky notes, connectors and SVG export, over `@texuli/canvas`). Both persist through a service callback and validate stored data as untrusted input. Blueprints gain `sheet` and `canvas` screen types (`@protoyard/crud/screens/sheet` and `/screens/canvas`), and `@protoyard/views/scenarios` gains `generateSheetWorkbook` and `generateCanvasBoard`.

### Patch Changes

- Updated dependencies [dfdf50e]
  - @protoyard/core@1.1.0
  - @protoyard/avatars@1.1.0
