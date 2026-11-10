# @protoyard/gallery

## 1.8.0

### Patch Changes

- Updated dependencies [b64de1e]
- Updated dependencies
  - @protoyard/core@1.8.0
  - @protoyard/ui@1.8.0
  - @protoyard/blueprint@1.8.0
  - @protoyard/player@1.8.0
  - @protoyard/themes@1.8.0

## 1.7.0

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.7.0
  - @protoyard/themes@1.7.0
  - @protoyard/ui@1.7.0
  - @protoyard/blueprint@1.7.0
  - @protoyard/player@1.7.0

## 1.6.0

### Patch Changes

- 41058fc: Corag consumer gap (1.5.0). In a consumer workspace the gallery reads the catalog blueprints indexed from the installed `@protoyard/templates` package (hoisted or under pnpm's `.pnpm` store) instead of omitting each one as an invalid entry, so the showcase home no longer reports "52 folders have an invalid protoyard.json" and the build no longer warns "Omitted registry record". The same no-symlink, inside-the-workspace and size checks apply; other `node_modules` paths are still refused.
- Updated dependencies [61fd849]
- Updated dependencies [10e69ef]
  - @protoyard/ui@1.6.0
  - @protoyard/player@1.6.0
  - @protoyard/blueprint@1.6.0
  - @protoyard/core@1.6.0
  - @protoyard/themes@1.6.0

## 1.5.0

### Patch Changes

- Updated dependencies [e9af874]
  - @protoyard/ui@1.5.0
  - @protoyard/player@1.5.0
  - @protoyard/blueprint@1.5.0
  - @protoyard/core@1.5.0
  - @protoyard/themes@1.5.0

## 1.4.3

### Patch Changes

- @protoyard/player@1.4.3
  - @protoyard/blueprint@1.4.3
  - @protoyard/core@1.4.3
  - @protoyard/themes@1.4.3
  - @protoyard/ui@1.4.3

## 1.4.2

### Patch Changes

- @protoyard/player@1.4.2
  - @protoyard/blueprint@1.4.2
  - @protoyard/core@1.4.2
  - @protoyard/themes@1.4.2
  - @protoyard/ui@1.4.2

## 1.4.1

### Patch Changes

- Updated dependencies [a14a4f7]
- Updated dependencies [c399afd]
  - @protoyard/ui@1.4.1
  - @protoyard/themes@1.4.1
  - @protoyard/player@1.4.1
  - @protoyard/blueprint@1.4.1
  - @protoyard/core@1.4.1

## 1.4.0

### Patch Changes

- Updated dependencies
  - @protoyard/ui@1.4.0
  - @protoyard/themes@1.4.0
  - @protoyard/player@1.4.0
  - @protoyard/blueprint@1.4.0
  - @protoyard/core@1.4.0

## 1.3.0

### Patch Changes

- Updated dependencies
  - @protoyard/ui@1.3.0
  - @protoyard/player@1.3.0
  - @protoyard/blueprint@1.3.0
  - @protoyard/core@1.3.0
  - @protoyard/themes@1.3.0

## 1.2.4

### Patch Changes

- Updated dependencies
  - @protoyard/themes@1.2.4
  - @protoyard/ui@1.2.4
  - @protoyard/blueprint@1.2.4
  - @protoyard/player@1.2.4
  - @protoyard/core@1.2.4

## 1.2.3

### Patch Changes

- @protoyard/player@1.2.3
  - @protoyard/blueprint@1.2.3
  - @protoyard/core@1.2.3
  - @protoyard/themes@1.2.3
  - @protoyard/ui@1.2.3

## 1.2.2

### Patch Changes

- Updated dependencies
  - @protoyard/ui@1.2.2
  - @protoyard/player@1.2.2
  - @protoyard/blueprint@1.2.2
  - @protoyard/core@1.2.2
  - @protoyard/themes@1.2.2

## 1.2.1

### Patch Changes

- @protoyard/blueprint@1.2.1
  - @protoyard/core@1.2.1
  - @protoyard/player@1.2.1
  - @protoyard/themes@1.2.1
  - @protoyard/ui@1.2.1

## 1.2.0

### Minor Changes

- A first-class consumer workspace (`npm create protoyard`). `generate`, `blueprint new --from-brief --generate`, `quick promote` and `new --from` write the installed Protoyard version instead of `workspace:*`, and keep a consumer's own `workspace:` packages. `protoyard.workspace.json` accepts local `templates` and a `showcase.templates` default. New commands: `validate --all [--build]`, `check texuli` (the Texuli adoption rules for any workspace), `sweep <slug>` (light/dark × desktop/phone PNGs), and `gallery build` / `gallery preview`. `protoyard/capture` and `protoyard/static-server` are public subpaths. The catalog blueprints ship in `@protoyard/templates`, the gallery ships its guides, and `showcase` copies the published player build.

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @protoyard/themes@1.2.0
  - @protoyard/blueprint@1.2.0
  - @protoyard/core@1.2.0
  - @protoyard/player@1.2.0
  - @protoyard/ui@1.2.0

## 1.1.3

### Patch Changes

- @protoyard/blueprint@1.1.3
  - @protoyard/core@1.1.3
  - @protoyard/player@1.1.3
  - @protoyard/themes@1.1.3
  - @protoyard/ui@1.1.3

## 1.1.2

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.1.2
  - @protoyard/blueprint@1.1.2
  - @protoyard/player@1.1.2
  - @protoyard/themes@1.1.2
  - @protoyard/ui@1.1.2

## 1.1.1

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.1.1
  - @protoyard/blueprint@1.1.1
  - @protoyard/player@1.1.1
  - @protoyard/themes@1.1.1
  - @protoyard/ui@1.1.1

## 1.1.0

### Patch Changes

- Updated dependencies [dfdf50e]
- Updated dependencies [085df93]
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
  - @protoyard/themes@1.1.0
  - @protoyard/blueprint@1.1.0
  - @protoyard/player@1.1.0
  - @protoyard/ui@1.1.0
