# @protoyard/pages

## 1.2.4

### Patch Changes

- @protoyard/blocks@1.2.4
  - @protoyard/core@1.2.4

## 1.2.3

### Patch Changes

- @protoyard/blocks@1.2.3
  - @protoyard/core@1.2.3

## 1.2.2

### Patch Changes

- @protoyard/blocks@1.2.2
  - @protoyard/core@1.2.2

## 1.2.1

### Patch Changes

- @protoyard/blocks@1.2.1
  - @protoyard/core@1.2.1

## 1.2.0

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.2.0
  - @protoyard/blocks@1.2.0

## 1.1.3

### Patch Changes

- @protoyard/blocks@1.1.3
  - @protoyard/core@1.1.3

## 1.1.2

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.1.2
  - @protoyard/blocks@1.1.2

## 1.1.1

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.1.1
  - @protoyard/blocks@1.1.1

## 1.1.0

### Minor Changes

- dfdf50e: Docs can be edited in Texuli's `PageEditor` and downloaded as Word, PDF or Markdown (`@texuli/document`). Applied edits are saved per doc and world in the content-kind runtime's new `docEdits` store (database version 2, `KIND_SCHEMA_VERSION`) and survive a reload; "Reset to the original" removes them, and a viewer persona cannot edit. Saved edits are re-validated on every load and reported as stale when the doc changed.

### Patch Changes

- Updated dependencies [dfdf50e]
  - @protoyard/core@1.1.0
  - @protoyard/blocks@1.1.0
