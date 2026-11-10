# @protoyard/core

## 1.9.0

No changes in this release.

## 1.8.1

No changes in this release.

## 1.8.0

### Patch Changes

- b64de1e: Consumer feedback on locked design systems. `check ds` treats text flow the
  same in CSS and utilities: `text-align`, `text-align-last`, `text-overflow`
  and `text-wrap` pass in a stylesheet, as `text-center` and `truncate` already
  did. `protoyard new --dry-run` runs every check (slug, source, destination,
  `--ds` design system and template gate) and writes nothing. Every npm package
  now ships its `CHANGELOG.md`, and `check:packages` requires it.

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

## 1.6.0

No changes in this release.

## 1.5.0

No changes in this release.

## 1.4.3

No changes in this release.

## 1.4.2

No changes in this release.

## 1.4.1

No changes in this release.

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
