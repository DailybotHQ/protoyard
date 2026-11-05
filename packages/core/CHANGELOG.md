# @protoyard/core

## 1.4.0

No changes in this release.

## 1.3.0

No changes in this release.

## 1.2.4

No changes in this release.

## 1.2.3

No changes in this release.

## 1.2.2

No changes in this release.

## 1.2.1

No changes in this release.

## 1.2.0

### Minor Changes

- Configurable runtime chrome. The manifest and `mountPrototype` take `devtools.launcher` (`hidden`, `offset`, `tone`) and `demoBadge` as `boolean | { layer, avoid, phone }`, and the compact phone badge stays clear of headings and the bottom navigation.

## 1.1.3

No changes in this release.

## 1.1.2

### Patch Changes

- Texuli 0.12.3 and a stricter release check.

## 1.1.1

### Patch Changes

- Texuli 0.12.1 for every Texuli dependency, and npm releases published by CI with Trusted Publishing and provenance.

## 1.1.0

### Minor Changes

- dfdf50e: Theme writers emit Texuli's canonical chart variables: `--tx-chart-1` to `--tx-chart-8`, `--tx-chart-sequential-1` to `-9` and `--tx-chart-diverging-1` to `-9` (were `--tx-chart1`, `--tx-seq-N` and `--tx-div-N`). Applying a theme removes the old names. The no-flash boot replays a cached appearance's old names under the new ones for one release. Read the new names in custom CSS.
