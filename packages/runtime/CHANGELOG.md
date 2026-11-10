# @protoyard/runtime

## 1.9.3

### Patch Changes

- @protoyard/core@1.9.3
  - @protoyard/database@1.9.3
  - @protoyard/scenarios@1.9.3
  - @protoyard/themes@1.9.3

## 1.9.2

### Patch Changes

- @protoyard/core@1.9.2
  - @protoyard/database@1.9.2
  - @protoyard/scenarios@1.9.2
  - @protoyard/themes@1.9.2

## 1.9.1

### Patch Changes

- @protoyard/core@1.9.1
  - @protoyard/database@1.9.1
  - @protoyard/scenarios@1.9.1
  - @protoyard/themes@1.9.1

## 1.9.0

### Patch Changes

- @protoyard/core@1.9.0
  - @protoyard/database@1.9.0
  - @protoyard/scenarios@1.9.0
  - @protoyard/themes@1.9.0

## 1.8.1

### Patch Changes

- @protoyard/core@1.8.1
  - @protoyard/database@1.8.1
  - @protoyard/scenarios@1.8.1
  - @protoyard/themes@1.8.1

## 1.8.0

### Patch Changes

- Updated dependencies [b64de1e]
  - @protoyard/core@1.8.0
  - @protoyard/database@1.8.0
  - @protoyard/scenarios@1.8.0
  - @protoyard/themes@1.8.0

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
  - @protoyard/themes@1.7.0
  - @protoyard/database@1.7.0
  - @protoyard/scenarios@1.7.0

## 1.6.0

### Patch Changes

- @protoyard/core@1.6.0
  - @protoyard/database@1.6.0
  - @protoyard/scenarios@1.6.0
  - @protoyard/themes@1.6.0

## 1.5.0

### Patch Changes

- @protoyard/core@1.5.0
  - @protoyard/database@1.5.0
  - @protoyard/scenarios@1.5.0
  - @protoyard/themes@1.5.0

## 1.4.3

### Patch Changes

- @protoyard/core@1.4.3
  - @protoyard/database@1.4.3
  - @protoyard/scenarios@1.4.3
  - @protoyard/themes@1.4.3

## 1.4.2

### Patch Changes

- @protoyard/core@1.4.2
  - @protoyard/database@1.4.2
  - @protoyard/scenarios@1.4.2
  - @protoyard/themes@1.4.2

## 1.4.1

### Patch Changes

- Updated dependencies [c399afd]
  - @protoyard/themes@1.4.1
  - @protoyard/core@1.4.1
  - @protoyard/database@1.4.1
  - @protoyard/scenarios@1.4.1

## 1.4.0

### Minor Changes

- Universal gaps from Corag's register: kits and wrappers resolve their words through the prototype dictionary, renderer, deck, design-system, tooling and budget additions, Texuli 0.14.1.

### Patch Changes

- Updated dependencies
  - @protoyard/themes@1.4.0
  - @protoyard/core@1.4.0
  - @protoyard/database@1.4.0
  - @protoyard/scenarios@1.4.0

## 1.3.0

### Patch Changes

- @protoyard/core@1.3.0
  - @protoyard/database@1.3.0
  - @protoyard/scenarios@1.3.0
  - @protoyard/themes@1.3.0

## 1.2.4

### Patch Changes

- Updated dependencies
  - @protoyard/themes@1.2.4
  - @protoyard/core@1.2.4
  - @protoyard/database@1.2.4
  - @protoyard/scenarios@1.2.4

## 1.2.3

### Patch Changes

- @protoyard/core@1.2.3
  - @protoyard/database@1.2.3
  - @protoyard/scenarios@1.2.3
  - @protoyard/themes@1.2.3

## 1.2.2

### Patch Changes

- @protoyard/core@1.2.2
  - @protoyard/database@1.2.2
  - @protoyard/scenarios@1.2.2
  - @protoyard/themes@1.2.2

## 1.2.1

### Patch Changes

- @protoyard/core@1.2.1
  - @protoyard/database@1.2.1
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
  - @protoyard/database@1.2.0
  - @protoyard/scenarios@1.2.0

## 1.1.3

### Patch Changes

- @protoyard/core@1.1.3
  - @protoyard/database@1.1.3
  - @protoyard/scenarios@1.1.3
  - @protoyard/themes@1.1.3

## 1.1.2

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.1.2
  - @protoyard/database@1.1.2
  - @protoyard/scenarios@1.1.2
  - @protoyard/themes@1.1.2

## 1.1.1

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.1.1
  - @protoyard/database@1.1.1
  - @protoyard/scenarios@1.1.1
  - @protoyard/themes@1.1.1

## 1.1.0

### Patch Changes

- Updated dependencies [dfdf50e]
- Updated dependencies [085df93]
- Updated dependencies [dfdf50e]
- Updated dependencies [085df93]
  - @protoyard/core@1.1.0
  - @protoyard/themes@1.1.0
  - @protoyard/database@1.1.0
  - @protoyard/scenarios@1.1.0
