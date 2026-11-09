# @protoyard/devtools

## 1.6.0

### Patch Changes

- @protoyard/core@1.6.0
  - @protoyard/database@1.6.0
  - @protoyard/http@1.6.0
  - @protoyard/themes@1.6.0

## 1.5.0

### Patch Changes

- @protoyard/core@1.5.0
  - @protoyard/database@1.5.0
  - @protoyard/http@1.5.0
  - @protoyard/themes@1.5.0

## 1.4.3

### Patch Changes

- @protoyard/core@1.4.3
  - @protoyard/database@1.4.3
  - @protoyard/http@1.4.3
  - @protoyard/themes@1.4.3

## 1.4.2

### Patch Changes

- @protoyard/core@1.4.2
  - @protoyard/database@1.4.2
  - @protoyard/http@1.4.2
  - @protoyard/themes@1.4.2

## 1.4.1

### Patch Changes

- Updated dependencies [c399afd]
  - @protoyard/themes@1.4.1
  - @protoyard/http@1.4.1
  - @protoyard/core@1.4.1
  - @protoyard/database@1.4.1

## 1.4.0

### Patch Changes

- Updated dependencies
  - @protoyard/themes@1.4.0
  - @protoyard/http@1.4.0
  - @protoyard/core@1.4.0
  - @protoyard/database@1.4.0

## 1.3.0

### Patch Changes

- @protoyard/core@1.3.0
  - @protoyard/database@1.3.0
  - @protoyard/http@1.3.0
  - @protoyard/themes@1.3.0

## 1.2.4

### Patch Changes

- Updated dependencies
  - @protoyard/themes@1.2.4
  - @protoyard/http@1.2.4
  - @protoyard/core@1.2.4
  - @protoyard/database@1.2.4

## 1.2.3

### Patch Changes

- @protoyard/core@1.2.3
  - @protoyard/database@1.2.3
  - @protoyard/http@1.2.3
  - @protoyard/themes@1.2.3

## 1.2.2

### Patch Changes

- @protoyard/core@1.2.2
  - @protoyard/database@1.2.2
  - @protoyard/http@1.2.2
  - @protoyard/themes@1.2.2

## 1.2.1

### Patch Changes

- @protoyard/core@1.2.1
  - @protoyard/database@1.2.1
  - @protoyard/http@1.2.1
  - @protoyard/themes@1.2.1

## 1.2.0

### Minor Changes

- Configurable runtime chrome. The manifest and `mountPrototype` take `devtools.launcher` (`hidden`, `offset`, `tone`) and `demoBadge` as `boolean | { layer, avoid, phone }`, and the compact phone badge stays clear of headings and the bottom navigation.

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @protoyard/themes@1.2.0
  - @protoyard/core@1.2.0
  - @protoyard/http@1.2.0
  - @protoyard/database@1.2.0

## 1.1.3

### Patch Changes

- @protoyard/core@1.1.3
  - @protoyard/database@1.1.3
  - @protoyard/http@1.1.3
  - @protoyard/themes@1.1.3

## 1.1.2

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.1.2
  - @protoyard/database@1.1.2
  - @protoyard/http@1.1.2
  - @protoyard/themes@1.1.2

## 1.1.1

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.1.1
  - @protoyard/database@1.1.1
  - @protoyard/http@1.1.1
  - @protoyard/themes@1.1.1

## 1.1.0

### Minor Changes

- 085df93: Design systems from Texuli: `createDesignSystem` builds a Texuli design-system document from a brief or a few inputs (colors, fonts, shape, density, motion, contrast). `designSystemFromTheme` imports any Protoyard theme. `compileDesignSystemDocument` validates and compiles a document at `trust: 'untrusted'` with Texuli's compile-core, and `defineDesignSystemTheme` applies it with `applyDesignSystem`. The CLI gains `protoyard ds new|validate|export|use`, `protoyard mcp` gains `ds_create`, `ds_validate`, `ds_export` and `ds_use`, and Theme Studio gains a Design system panel. The compiler loads only on demand, so a chunked prototype build without a design system does not grow. Quick single-file exports, which ship DevTools inline, grow by about 88 KB raw for the Design system panel.
- dfdf50e: All 204 Texuli library themes are offered by default: the 64-theme catalog plus the 140 expanded themes from `@texuli/tokens/library-expand`, loaded on demand. The `theme` CLI, DevTools' theme browser and Theme Studio, Deck Studio, the player and generated-app settings screens, `?theme=` and every theme id in a manifest, scenario or blueprint resolve them. A single-file export embeds only the expanded theme it uses.
- dfdf50e: Move every Texuli dependency to the exact npm version 0.9.0. Every `@protoyard/ui` component export takes Texuli's uniform contract: `bind:ref` gives its root element, rest attributes land on the root or its focusable control, and a caller's handlers run first. Additive API: `ref` and rest props everywhere, `CommandPalette` `bind:open`, `FileDropzone` `id` and `TabItem.badgeLabel`. Overlays, toasts, date fields, tags, Kanban and avatars drop their gap adapters for Texuli's fixes.

### Patch Changes

- Updated dependencies [dfdf50e]
- Updated dependencies [085df93]
- Updated dependencies [dfdf50e]
- Updated dependencies [085df93]
  - @protoyard/core@1.1.0
  - @protoyard/themes@1.1.0
  - @protoyard/database@1.1.0
  - @protoyard/http@1.1.0
