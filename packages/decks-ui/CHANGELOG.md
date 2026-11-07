# @protoyard/decks-ui

## 1.4.1

### Patch Changes

- @protoyard/blocks-ui@1.4.1
  - @protoyard/decks@1.4.1
  - @protoyard/blocks@1.4.1

## 1.4.0

### Minor Changes

- Universal gaps from Corag's register: kits and wrappers resolve their words through the prototype dictionary, renderer, deck, design-system, tooling and budget additions, Texuli 0.14.1.

### Patch Changes

- @protoyard/blocks-ui@1.4.0
  - @protoyard/decks@1.4.0
  - @protoyard/blocks@1.4.0

## 1.3.0

### Patch Changes

- @protoyard/blocks-ui@1.3.0
  - @protoyard/blocks@1.3.0
  - @protoyard/decks@1.3.0

## 1.2.4

### Patch Changes

- @protoyard/decks@1.2.4
  - @protoyard/blocks-ui@1.2.4
  - @protoyard/blocks@1.2.4

## 1.2.3

### Patch Changes

- @protoyard/blocks@1.2.3
  - @protoyard/blocks-ui@1.2.3
  - @protoyard/decks@1.2.3

## 1.2.2

### Patch Changes

- @protoyard/blocks-ui@1.2.2
  - @protoyard/blocks@1.2.2
  - @protoyard/decks@1.2.2

## 1.2.1

### Patch Changes

- @protoyard/blocks@1.2.1
  - @protoyard/blocks-ui@1.2.1
  - @protoyard/decks@1.2.1

## 1.2.0

### Patch Changes

- @protoyard/decks@1.2.0
  - @protoyard/blocks@1.2.0
  - @protoyard/blocks-ui@1.2.0

## 1.1.3

### Patch Changes

- @protoyard/blocks@1.1.3
  - @protoyard/blocks-ui@1.1.3
  - @protoyard/decks@1.1.3

## 1.1.2

### Patch Changes

- @protoyard/blocks@1.1.2
  - @protoyard/blocks-ui@1.1.2
  - @protoyard/decks@1.1.2

## 1.1.1

### Patch Changes

- @protoyard/blocks@1.1.1
  - @protoyard/blocks-ui@1.1.1
  - @protoyard/decks@1.1.1

## 1.1.0

### Minor Changes

- dfdf50e: All 204 Texuli library themes are offered by default: the 64-theme catalog plus the 140 expanded themes from `@texuli/tokens/library-expand`, loaded on demand. The `theme` CLI, DevTools' theme browser and Theme Studio, Deck Studio, the player and generated-app settings screens, `?theme=` and every theme id in a manifest, scenario or blueprint resolve them. A single-file export embeds only the expanded theme it uses.

### Patch Changes

- dfdf50e: `DeckApp` runs on `@texuli/slides/stage-core` with a deck already prepared by `prepareDeckV2`, so the stage paints without validating again. The Debug for agents button sits in the stage toolbar's host-tools group, and print preloads its view without Texuli's default renderers.
- Updated dependencies [dfdf50e]
  - @protoyard/decks@1.1.0
  - @protoyard/blocks@1.1.0
  - @protoyard/blocks-ui@1.1.0
