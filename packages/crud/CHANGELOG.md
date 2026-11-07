# @protoyard/crud

## 1.4.1

### Patch Changes

- Updated dependencies [a14a4f7]
- Updated dependencies [c399afd]
  - @protoyard/renderer-svelte@1.4.1
  - @protoyard/ui@1.4.1
  - @protoyard/analytics-ui@1.4.1
  - @protoyard/views-ui@1.4.1
  - @protoyard/blueprint@1.4.1
  - @protoyard/analytics@1.4.1
  - @protoyard/charts-ui@1.4.1
  - @protoyard/core@1.4.1
  - @protoyard/views@1.4.1

## 1.4.0

### Patch Changes

- Updated dependencies
  - @protoyard/ui@1.4.0
  - @protoyard/renderer-svelte@1.4.0
  - @protoyard/views-ui@1.4.0
  - @protoyard/analytics-ui@1.4.0
  - @protoyard/blueprint@1.4.0
  - @protoyard/analytics@1.4.0
  - @protoyard/charts-ui@1.4.0
  - @protoyard/core@1.4.0
  - @protoyard/views@1.4.0

## 1.3.0

### Patch Changes

- Updated dependencies
  - @protoyard/views-ui@1.3.0
  - @protoyard/ui@1.3.0
  - @protoyard/renderer-svelte@1.3.0
  - @protoyard/analytics-ui@1.3.0
  - @protoyard/blueprint@1.3.0
  - @protoyard/analytics@1.3.0
  - @protoyard/charts-ui@1.3.0
  - @protoyard/core@1.3.0
  - @protoyard/views@1.3.0

## 1.2.4

### Patch Changes

- Updated dependencies
  - @protoyard/ui@1.2.4
  - @protoyard/renderer-svelte@1.2.4
  - @protoyard/blueprint@1.2.4
  - @protoyard/analytics-ui@1.2.4
  - @protoyard/views-ui@1.2.4
  - @protoyard/analytics@1.2.4
  - @protoyard/charts-ui@1.2.4
  - @protoyard/core@1.2.4
  - @protoyard/views@1.2.4

## 1.2.3

### Patch Changes

- @protoyard/analytics@1.2.3
  - @protoyard/analytics-ui@1.2.3
  - @protoyard/blueprint@1.2.3
  - @protoyard/charts-ui@1.2.3
  - @protoyard/core@1.2.3
  - @protoyard/renderer-svelte@1.2.3
  - @protoyard/ui@1.2.3
  - @protoyard/views@1.2.3
  - @protoyard/views-ui@1.2.3

## 1.2.2

### Patch Changes

- Updated dependencies
  - @protoyard/ui@1.2.2
  - @protoyard/analytics-ui@1.2.2
  - @protoyard/renderer-svelte@1.2.2
  - @protoyard/views-ui@1.2.2
  - @protoyard/analytics@1.2.2
  - @protoyard/blueprint@1.2.2
  - @protoyard/charts-ui@1.2.2
  - @protoyard/core@1.2.2
  - @protoyard/views@1.2.2

## 1.2.1

### Patch Changes

- @protoyard/analytics@1.2.1
  - @protoyard/analytics-ui@1.2.1
  - @protoyard/blueprint@1.2.1
  - @protoyard/charts-ui@1.2.1
  - @protoyard/core@1.2.1
  - @protoyard/renderer-svelte@1.2.1
  - @protoyard/ui@1.2.1
  - @protoyard/views@1.2.1
  - @protoyard/views-ui@1.2.1

## 1.2.0

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @protoyard/blueprint@1.2.0
  - @protoyard/core@1.2.0
  - @protoyard/renderer-svelte@1.2.0
  - @protoyard/analytics@1.2.0
  - @protoyard/views@1.2.0
  - @protoyard/views-ui@1.2.0
  - @protoyard/analytics-ui@1.2.0
  - @protoyard/charts-ui@1.2.0
  - @protoyard/ui@1.2.0

## 1.1.3

### Patch Changes

- @protoyard/analytics@1.1.3
  - @protoyard/analytics-ui@1.1.3
  - @protoyard/blueprint@1.1.3
  - @protoyard/charts-ui@1.1.3
  - @protoyard/core@1.1.3
  - @protoyard/renderer-svelte@1.1.3
  - @protoyard/ui@1.1.3
  - @protoyard/views@1.1.3
  - @protoyard/views-ui@1.1.3

## 1.1.2

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.1.2
  - @protoyard/analytics@1.1.2
  - @protoyard/blueprint@1.1.2
  - @protoyard/renderer-svelte@1.1.2
  - @protoyard/views@1.1.2
  - @protoyard/views-ui@1.1.2
  - @protoyard/analytics-ui@1.1.2
  - @protoyard/charts-ui@1.1.2
  - @protoyard/ui@1.1.2

## 1.1.1

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.1.1
  - @protoyard/analytics@1.1.1
  - @protoyard/blueprint@1.1.1
  - @protoyard/renderer-svelte@1.1.1
  - @protoyard/views@1.1.1
  - @protoyard/views-ui@1.1.1
  - @protoyard/analytics-ui@1.1.1
  - @protoyard/charts-ui@1.1.1
  - @protoyard/ui@1.1.1

## 1.1.0

### Minor Changes

- dfdf50e: Forms render through Texuli's `SchemaForm` (`@texuli/forms`): generated entity forms (`EntityForm`, mapped by the new `entityFormModel`), page and doc form blocks, and the SaaS kit's notification preferences and member invite. Texuli checks required and range rules before the service runs; every submission still goes through the entity, form-response or SaaS service, whose issues show inline. Relation, datetime, geo, avatar and file fields keep Protoyard controls. `EntityForm` gains optional `title` and `showTitle`.
- dfdf50e: Motion comes from Texuli: the renderer wraps every prototype in `MotionProvider` with its reduced-motion setting, and theme motion reaches the `--tx-motion-*` tokens. Blueprints of every kind take an optional, closed `motion: { level: "full" | "subtle" | "none" }`, a ceiling on every Texuli animation and on a deck's own transitions (reduced motion still wins); a blueprint without it parses and hashes as before.
- dfdf50e: New lazy views: `@protoyard/views-ui/sheet` (`SheetView`, a spreadsheet with formulas, CSV download and import, over `@texuli/sheets`) and `@protoyard/views-ui/canvas` (`CanvasView`, an infinite canvas with frames, sticky notes, connectors and SVG export, over `@texuli/canvas`). Both persist through a service callback and validate stored data as untrusted input. Blueprints gain `sheet` and `canvas` screen types (`@protoyard/crud/screens/sheet` and `/screens/canvas`), and `@protoyard/views/scenarios` gains `generateSheetWorkbook` and `generateCanvasBoard`.

### Patch Changes

- Updated dependencies [dfdf50e]
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
  - @protoyard/blueprint@1.1.0
  - @protoyard/views-ui@1.1.0
  - @protoyard/analytics-ui@1.1.0
  - @protoyard/renderer-svelte@1.1.0
  - @protoyard/views@1.1.0
  - @protoyard/ui@1.1.0
  - @protoyard/analytics@1.1.0
  - @protoyard/charts-ui@1.1.0
