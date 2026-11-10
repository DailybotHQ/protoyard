# @protoyard/pages-ui

## 1.8.0

### Patch Changes

- Updated dependencies
  - @protoyard/ui@1.8.0
  - @protoyard/blocks@1.8.0
  - @protoyard/blocks-ui@1.8.0
  - @protoyard/blueprint@1.8.0
  - @protoyard/pages@1.8.0
  - @protoyard/renderer-svelte@1.8.0

## 1.7.0

### Patch Changes

- Updated dependencies
  - @protoyard/renderer-svelte@1.7.0
  - @protoyard/ui@1.7.0
  - @protoyard/blocks@1.7.0
  - @protoyard/blocks-ui@1.7.0
  - @protoyard/blueprint@1.7.0
  - @protoyard/pages@1.7.0

## 1.6.0

### Patch Changes

- 10e69ef: Adopt Texuli 0.14.3. Every Texuli dependency is pinned exactly at `0.14.3`. Re-exported components gain Texuli's new props directly (Checkbox/Radio/Switch `labelContent`, Field `counter`, NumberField `display="output"`, Button/IconButton `iconSize`, BottomNav `emphasis`, MobileHeader `eyebrow`/`leading`/`onClose`, SplitView `listWidth`/`breakpoint`/`context`, Stat `tone`, Composer `layout="row"`/`sendButton="icon"`, `texuli/list-item`, opt-in Spanish catalogs). `@protoyard/ui` `Avatar` forwards the new `tone` and `shape`. The page host's CSS caps rise with Texuli's CSS (initial 7,562 B measured, cap 7,940 B; all CSS 43,139 B, cap 44,218 B).
- Updated dependencies [61fd849]
- Updated dependencies [10e69ef]
  - @protoyard/ui@1.6.0
  - @protoyard/blocks-ui@1.6.0
  - @protoyard/renderer-svelte@1.6.0
  - @protoyard/blocks@1.6.0
  - @protoyard/blueprint@1.6.0
  - @protoyard/pages@1.6.0

## 1.5.0

### Patch Changes

- Updated dependencies [e9af874]
  - @protoyard/ui@1.5.0
  - @protoyard/renderer-svelte@1.5.0
  - @protoyard/blocks-ui@1.5.0
  - @protoyard/blocks@1.5.0
  - @protoyard/blueprint@1.5.0
  - @protoyard/pages@1.5.0

## 1.4.3

### Patch Changes

- Updated dependencies [64c1a28]
  - @protoyard/renderer-svelte@1.4.3
  - @protoyard/blocks-ui@1.4.3
  - @protoyard/blocks@1.4.3
  - @protoyard/blueprint@1.4.3
  - @protoyard/pages@1.4.3
  - @protoyard/ui@1.4.3

## 1.4.2

### Patch Changes

- Updated dependencies [e09e5f4]
  - @protoyard/renderer-svelte@1.4.2
  - @protoyard/blocks-ui@1.4.2
  - @protoyard/blocks@1.4.2
  - @protoyard/blueprint@1.4.2
  - @protoyard/pages@1.4.2
  - @protoyard/ui@1.4.2

## 1.4.1

### Patch Changes

- Updated dependencies [a14a4f7]
- Updated dependencies [c399afd]
  - @protoyard/renderer-svelte@1.4.1
  - @protoyard/ui@1.4.1
  - @protoyard/blocks-ui@1.4.1
  - @protoyard/blueprint@1.4.1
  - @protoyard/blocks@1.4.1
  - @protoyard/pages@1.4.1

## 1.4.0

### Minor Changes

- Universal gaps from Corag's register: kits and wrappers resolve their words through the prototype dictionary, renderer, deck, design-system, tooling and budget additions, Texuli 0.14.1.

### Patch Changes

- Updated dependencies
  - @protoyard/ui@1.4.0
  - @protoyard/renderer-svelte@1.4.0
  - @protoyard/blocks-ui@1.4.0
  - @protoyard/blueprint@1.4.0
  - @protoyard/blocks@1.4.0
  - @protoyard/pages@1.4.0

## 1.3.0

### Minor Changes

- Kit screens on domain adapters (ADR-046): ports for saas-ui, flows-ui, gamification-ui and pages-ui forms; board, calendar, files and timeline gaps in views-ui; voice session callbacks; Texuli 0.14.0.

### Patch Changes

- Updated dependencies
  - @protoyard/ui@1.3.0
  - @protoyard/renderer-svelte@1.3.0
  - @protoyard/blocks-ui@1.3.0
  - @protoyard/blocks@1.3.0
  - @protoyard/blueprint@1.3.0
  - @protoyard/pages@1.3.0

## 1.2.4

### Patch Changes

- Updated dependencies
  - @protoyard/ui@1.2.4
  - @protoyard/renderer-svelte@1.2.4
  - @protoyard/blueprint@1.2.4
  - @protoyard/blocks-ui@1.2.4
  - @protoyard/blocks@1.2.4
  - @protoyard/pages@1.2.4

## 1.2.3

### Patch Changes

- DocApp and DocHost read their labels from Texuli's dictionary (`mountPrototype({ i18n })`): the outline uses `pages.outline`, and the toolbar, notices and document landmark use `protoyard.doc.*` and `protoyard.pages.*` ids, with English as the default. Before, they were fixed English strings.
- @protoyard/blocks@1.2.3
  - @protoyard/blocks-ui@1.2.3
  - @protoyard/blueprint@1.2.3
  - @protoyard/pages@1.2.3
  - @protoyard/renderer-svelte@1.2.3
  - @protoyard/ui@1.2.3

## 1.2.2

### Patch Changes

- Updated dependencies
  - @protoyard/ui@1.2.2
  - @protoyard/blocks-ui@1.2.2
  - @protoyard/renderer-svelte@1.2.2
  - @protoyard/blocks@1.2.2
  - @protoyard/blueprint@1.2.2
  - @protoyard/pages@1.2.2

## 1.2.1

### Patch Changes

- @protoyard/blocks@1.2.1
  - @protoyard/blocks-ui@1.2.1
  - @protoyard/blueprint@1.2.1
  - @protoyard/pages@1.2.1
  - @protoyard/renderer-svelte@1.2.1
  - @protoyard/ui@1.2.1

## 1.2.0

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @protoyard/blueprint@1.2.0
  - @protoyard/renderer-svelte@1.2.0
  - @protoyard/blocks@1.2.0
  - @protoyard/blocks-ui@1.2.0
  - @protoyard/pages@1.2.0
  - @protoyard/ui@1.2.0

## 1.1.3

### Patch Changes

- @protoyard/blocks@1.1.3
  - @protoyard/blocks-ui@1.1.3
  - @protoyard/blueprint@1.1.3
  - @protoyard/pages@1.1.3
  - @protoyard/renderer-svelte@1.1.3
  - @protoyard/ui@1.1.3

## 1.1.2

### Patch Changes

- @protoyard/blocks@1.1.2
  - @protoyard/blocks-ui@1.1.2
  - @protoyard/blueprint@1.1.2
  - @protoyard/pages@1.1.2
  - @protoyard/renderer-svelte@1.1.2
  - @protoyard/ui@1.1.2

## 1.1.1

### Patch Changes

- @protoyard/blocks@1.1.1
  - @protoyard/blocks-ui@1.1.1
  - @protoyard/blueprint@1.1.1
  - @protoyard/pages@1.1.1
  - @protoyard/renderer-svelte@1.1.1
  - @protoyard/ui@1.1.1

## 1.1.0

### Minor Changes

- dfdf50e: Docs can be edited in Texuli's `PageEditor` and downloaded as Word, PDF or Markdown (`@texuli/document`). Applied edits are saved per doc and world in the content-kind runtime's new `docEdits` store (database version 2, `KIND_SCHEMA_VERSION`) and survive a reload; "Reset to the original" removes them, and a viewer persona cannot edit. Saved edits are re-validated on every load and reported as stale when the doc changed.
- dfdf50e: Forms render through Texuli's `SchemaForm` (`@texuli/forms`): generated entity forms (`EntityForm`, mapped by the new `entityFormModel`), page and doc form blocks, and the SaaS kit's notification preferences and member invite. Texuli checks required and range rules before the service runs; every submission still goes through the entity, form-response or SaaS service, whose issues show inline. Relation, datetime, geo, avatar and file fields keep Protoyard controls. `EntityForm` gains optional `title` and `showTitle`.

### Patch Changes

- dfdf50e: A doc's Edit and Reset follow a persona switch without a reload. The sheet view's "Import CSV" accepts a second file after the first.
- Updated dependencies [dfdf50e]
- Updated dependencies [dfdf50e]
- Updated dependencies [dfdf50e]
- Updated dependencies [dfdf50e]
- Updated dependencies [dfdf50e]
- Updated dependencies [085df93]
- Updated dependencies [dfdf50e]
  - @protoyard/pages@1.1.0
  - @protoyard/blueprint@1.1.0
  - @protoyard/renderer-svelte@1.1.0
  - @protoyard/ui@1.1.0
  - @protoyard/blocks@1.1.0
  - @protoyard/blocks-ui@1.1.0
