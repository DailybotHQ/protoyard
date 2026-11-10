# @protoyard/themes

## 1.9.4

### Patch Changes

- @protoyard/core@1.9.4

## 1.9.3

### Patch Changes

- @protoyard/core@1.9.3

## 1.9.2

### Patch Changes

- @protoyard/core@1.9.2

## 1.9.1

### Patch Changes

- @protoyard/core@1.9.1

## 1.9.0

### Patch Changes

- @protoyard/core@1.9.0

## 1.8.1

### Patch Changes

- @protoyard/core@1.8.1

## 1.8.0

### Patch Changes

- Updated dependencies [b64de1e]
  - @protoyard/core@1.8.0

## 1.7.0

### Minor Changes

- Locked design systems on Texuli 0.15.0. A design system is a folder
  (`design-systems/<id>/`: document with its allow section and approval, its
  own components with source hashes, requests and kit stories). `ds approve`
  records the approval with the content hash; `ds use --lock` pins a prototype
  to the exact version; `new --ds` and `generate --ds` start locked prototypes;
  `check ds` and `validate` refuse raw controls, visual CSS and utilities,
  inline styles, other UI libraries, local motion and components or values the
  design system does not allow. A locked runtime keeps only its theme, and
  DevTools shows the lock. `ds component request`, `approve-request` and `new`
  add a component only after a human approves it, with the same rules over MCP.
  All 31 templates render through design-system components; social-feed still
  reports two spacer styles until Texuli's VirtualList ships.

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.7.0

## 1.6.0

### Patch Changes

- @protoyard/core@1.6.0

## 1.5.0

### Patch Changes

- @protoyard/core@1.5.0

## 1.4.3

### Patch Changes

- @protoyard/core@1.4.3

## 1.4.2

### Patch Changes

- @protoyard/core@1.4.2

## 1.4.1

### Patch Changes

- c399afd: Consumer batch 7. The compact demo badge keeps a 16 px disc on theme surface tokens (its touch target may still grow to 44 px) and clears every top-level heading on phones. A type scale ratio no longer shrinks `text-xs` and `text-sm` below 12 px and 13 px. The Texuli adoption check flags a scoped style rule for a class the markup only passes to a component (`component-scoped-class`), which Svelte never applies.
- @protoyard/core@1.4.1

## 1.4.0

### Minor Changes

- Universal gaps from Corag's register: kits and wrappers resolve their words through the prototype dictionary, renderer, deck, design-system, tooling and budget additions, Texuli 0.14.1.

### Patch Changes

- @protoyard/core@1.4.0

## 1.3.0

### Patch Changes

- @protoyard/core@1.3.0

## 1.2.4

### Patch Changes

- Fixes from the consumers' gap batches 3 and 4: `sweep` forces each shot's mode, hides DevTools and takes several slugs; `defineDesignSystemTheme(compiled, { fontFiles })` for fonts in a production build; `designSystemFromTheme` no longer copies `primary` into `sidebarPrimary`; `WeekdayPicker` names start with the visible text; `Dialog` forwards `onCloseAutoFocus`; floating placement probes at most 240 points and re-places at most every 500 ms on busy pages.
- @protoyard/core@1.2.4

## 1.2.3

### Patch Changes

- @protoyard/core@1.2.3

## 1.2.2

### Patch Changes

- @protoyard/core@1.2.2

## 1.2.1

### Patch Changes

- @protoyard/core@1.2.1

## 1.2.0

### Minor Changes

- Design systems for every prototype kind. `ds use` wires deck, page and doc prototypes (`brandTheme` and `defaultThemeId`, now accepted by `definePrototypeFromPage` and `definePrototypeFromDoc`), adds `@protoyard/themes` at the right version when a prototype lacks a runtime dependency, and refreshes the generated spec regions. `ds new --from-theme-file <path>` imports a prototype's own theme. `defineDesignSystemTheme(compiled, { fontBase, description })` resolves fonts from a package and carries the document's description.

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.2.0

## 1.1.3

### Patch Changes

- @protoyard/core@1.1.3

## 1.1.2

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.1.2

## 1.1.1

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.1.1

## 1.1.0

### Minor Changes

- dfdf50e: Theme writers emit Texuli's canonical chart variables: `--tx-chart-1` to `--tx-chart-8`, `--tx-chart-sequential-1` to `-9` and `--tx-chart-diverging-1` to `-9` (were `--tx-chart1`, `--tx-seq-N` and `--tx-div-N`). Applying a theme removes the old names. The no-flash boot replays a cached appearance's old names under the new ones for one release. Read the new names in custom CSS.
- 085df93: Design systems from Texuli: `createDesignSystem` builds a Texuli design-system document from a brief or a few inputs (colors, fonts, shape, density, motion, contrast). `designSystemFromTheme` imports any Protoyard theme. `compileDesignSystemDocument` validates and compiles a document at `trust: 'untrusted'` with Texuli's compile-core, and `defineDesignSystemTheme` applies it with `applyDesignSystem`. The CLI gains `protoyard ds new|validate|export|use`, `protoyard mcp` gains `ds_create`, `ds_validate`, `ds_export` and `ds_use`, and Theme Studio gains a Design system panel. The compiler loads only on demand, so a chunked prototype build without a design system does not grow. Quick single-file exports, which ship DevTools inline, grow by about 88 KB raw for the Design system panel.
- dfdf50e: All 204 Texuli library themes are offered by default: the 64-theme catalog plus the 140 expanded themes from `@texuli/tokens/library-expand`, loaded on demand. The `theme` CLI, DevTools' theme browser and Theme Studio, Deck Studio, the player and generated-app settings screens, `?theme=` and every theme id in a manifest, scenario or blueprint resolve them. A single-file export embeds only the expanded theme it uses.
- 085df93: Texuli 0.12.0 from npm (exact pins). Texuli 0.10 to 0.12 closed gaps G100–G136, so their adapters are gone. Theme id lists come from `@texuli/tokens/library-ids`, system tokens from `@texuli/tokens/system.css`, and deck print uses `@texuli/slides/export-core`. `CommandPalette` and `DateRangePicker` use Texuli's styled components.

### Patch Changes

- Updated dependencies [dfdf50e]
  - @protoyard/core@1.1.0
