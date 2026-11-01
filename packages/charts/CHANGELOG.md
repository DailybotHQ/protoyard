# @protoyard/charts

## 1.1.0

### Minor Changes

- dfdf50e: Theme writers emit Texuli's canonical chart variables: `--tx-chart-1` to `--tx-chart-8`, `--tx-chart-sequential-1` to `-9` and `--tx-chart-diverging-1` to `-9` (were `--tx-chart1`, `--tx-seq-N` and `--tx-div-N`). Applying a theme removes the old names. The no-flash boot replays a cached appearance's old names under the new ones for one release. Read the new names in custom CSS.

### Patch Changes

- Updated dependencies [dfdf50e]
  - @protoyard/core@1.1.0
