# @protoyard/views-ui

## 1.9.2

### Patch Changes

- @protoyard/ai@1.9.2
  - @protoyard/core@1.9.2
  - @protoyard/renderer-svelte@1.9.2
  - @protoyard/ui@1.9.2
  - @protoyard/views@1.9.2

## 1.9.1

### Patch Changes

- @protoyard/ai@1.9.1
  - @protoyard/core@1.9.1
  - @protoyard/renderer-svelte@1.9.1
  - @protoyard/ui@1.9.1
  - @protoyard/views@1.9.1

## 1.9.0

### Patch Changes

- Updated dependencies
  - @protoyard/ui@1.9.0
  - @protoyard/renderer-svelte@1.9.0
  - @protoyard/ai@1.9.0
  - @protoyard/core@1.9.0
  - @protoyard/views@1.9.0

## 1.8.1

### Patch Changes

- @protoyard/ai@1.8.1
  - @protoyard/core@1.8.1
  - @protoyard/renderer-svelte@1.8.1
  - @protoyard/ui@1.8.1
  - @protoyard/views@1.8.1

## 1.8.0

### Patch Changes

- Updated dependencies [b64de1e]
- Updated dependencies
  - @protoyard/core@1.8.0
  - @protoyard/ui@1.8.0
  - @protoyard/ai@1.8.0
  - @protoyard/renderer-svelte@1.8.0
  - @protoyard/views@1.8.0

## 1.7.0

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.7.0
  - @protoyard/renderer-svelte@1.7.0
  - @protoyard/ui@1.7.0
  - @protoyard/ai@1.7.0
  - @protoyard/views@1.7.0

## 1.6.0

### Minor Changes

- 78c1cbb: Adopt Texuli 0.14.4. Every Texuli dependency is pinned exactly at `0.14.4`. `TimelineView` holds its opening day as rows load and zoom changes, and exposes `scrollToDate(date)` through `bind:this`.

### Patch Changes

- Updated dependencies [61fd849]
- Updated dependencies [10e69ef]
  - @protoyard/ui@1.6.0
  - @protoyard/renderer-svelte@1.6.0
  - @protoyard/ai@1.6.0
  - @protoyard/core@1.6.0
  - @protoyard/views@1.6.0

## 1.5.0

### Minor Changes

- e9af874: Adopt Texuli 0.14.2 (every Texuli dependency pinned exactly). `Select` forwards Texuli's `block` (through `fullWidth` or `block`) and the trigger `variant` (`'ghost'` per instance), and drops its full-width wrapper. `ChipGroup` takes `required`: in single mode the selected chip stays selected (Texuli's `deselectable={false}`). `TimelineView` forwards `initialDate` and `formatTick`; without `initialDate` the axis opens at the simulated today when it falls inside the plan. Texuli fixes come along: dialogs mounted open show their backdrop, controlled toggles render their prop, side sheets and drawers fill their height. The layout host initial cap is re-measured at 4,175 B gzip (cap 4,280 B).

### Patch Changes

- Updated dependencies [e9af874]
  - @protoyard/ui@1.5.0
  - @protoyard/renderer-svelte@1.5.0
  - @protoyard/ai@1.5.0
  - @protoyard/core@1.5.0
  - @protoyard/views@1.5.0

## 1.4.3

### Patch Changes

- Updated dependencies [64c1a28]
  - @protoyard/renderer-svelte@1.4.3
  - @protoyard/ai@1.4.3
  - @protoyard/core@1.4.3
  - @protoyard/ui@1.4.3
  - @protoyard/views@1.4.3

## 1.4.2

### Patch Changes

- e09e5f4: Final-review fixes for PLAN_010 to 012. `gallery build --out` and `sweep --out` go through the output guard, so they never empty the workspace or its sources. `FilePreview` no longer stays on "Loading preview…" after leaving a pending load. The phone calendar falls back to the month view when its agenda chunk cannot load. `SsoButtons` ignores engine `scenarios` under `provideSaas({ ports })` (new `hasSaasRuntime`). The offline plugin resets per build in watch mode. A failed full-screen switch no longer leaves the hint pending.
- Updated dependencies [e09e5f4]
  - @protoyard/renderer-svelte@1.4.2
  - @protoyard/ai@1.4.2
  - @protoyard/core@1.4.2
  - @protoyard/ui@1.4.2
  - @protoyard/views@1.4.2

## 1.4.1

### Patch Changes

- Updated dependencies [a14a4f7]
- Updated dependencies [c399afd]
  - @protoyard/renderer-svelte@1.4.1
  - @protoyard/ui@1.4.1
  - @protoyard/ai@1.4.1
  - @protoyard/core@1.4.1
  - @protoyard/views@1.4.1

## 1.4.0

### Minor Changes

- Universal gaps from Corag's register: kits and wrappers resolve their words through the prototype dictionary, renderer, deck, design-system, tooling and budget additions, Texuli 0.14.1.

### Patch Changes

- Updated dependencies
  - @protoyard/ui@1.4.0
  - @protoyard/renderer-svelte@1.4.0
  - @protoyard/ai@1.4.0
  - @protoyard/core@1.4.0
  - @protoyard/views@1.4.0

## 1.3.0

### Minor Changes

- Kit screens on domain adapters (ADR-046): ports for saas-ui, flows-ui, gamification-ui and pages-ui forms; board, calendar, files and timeline gaps in views-ui; voice session callbacks; Texuli 0.14.0.

### Patch Changes

- Updated dependencies
  - @protoyard/ai@1.3.0
  - @protoyard/ui@1.3.0
  - @protoyard/renderer-svelte@1.3.0
  - @protoyard/core@1.3.0
  - @protoyard/views@1.3.0

## 1.2.4

### Patch Changes

- Updated dependencies
  - @protoyard/ui@1.2.4
  - @protoyard/renderer-svelte@1.2.4
  - @protoyard/ai@1.2.4
  - @protoyard/core@1.2.4
  - @protoyard/views@1.2.4

## 1.2.3

### Patch Changes

- @protoyard/ai@1.2.3
  - @protoyard/core@1.2.3
  - @protoyard/renderer-svelte@1.2.3
  - @protoyard/ui@1.2.3
  - @protoyard/views@1.2.3

## 1.2.2

### Patch Changes

- Updated dependencies
  - @protoyard/ui@1.2.2
  - @protoyard/renderer-svelte@1.2.2
  - @protoyard/ai@1.2.2
  - @protoyard/core@1.2.2
  - @protoyard/views@1.2.2

## 1.2.1

### Patch Changes

- @protoyard/ai@1.2.1
  - @protoyard/core@1.2.1
  - @protoyard/renderer-svelte@1.2.1
  - @protoyard/ui@1.2.1
  - @protoyard/views@1.2.1

## 1.2.0

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.2.0
  - @protoyard/renderer-svelte@1.2.0
  - @protoyard/ai@1.2.0
  - @protoyard/views@1.2.0
  - @protoyard/ui@1.2.0

## 1.1.3

### Patch Changes

- @protoyard/ai@1.1.3
  - @protoyard/core@1.1.3
  - @protoyard/renderer-svelte@1.1.3
  - @protoyard/ui@1.1.3
  - @protoyard/views@1.1.3

## 1.1.2

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.1.2
  - @protoyard/ai@1.1.2
  - @protoyard/renderer-svelte@1.1.2
  - @protoyard/views@1.1.2
  - @protoyard/ui@1.1.2

## 1.1.1

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.1.1
  - @protoyard/ai@1.1.1
  - @protoyard/renderer-svelte@1.1.1
  - @protoyard/views@1.1.1
  - @protoyard/ui@1.1.1

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
