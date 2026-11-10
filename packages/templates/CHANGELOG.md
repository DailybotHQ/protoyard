# @protoyard/templates

## 1.9.0

### Patch Changes

- Texuli 0.17.0 (every Texuli dependency pinned exactly at `0.17.0`).
  `check ds --render` loads Texuli's prebuilt host script into its isolated
  world instead of bundling one at run time, pins the attribute it reads to
  `data-tx-component`, and keeps Protoyard's stricter nesting rule (a catalog
  root inside an allowed root is not allowed by that alone). `ds diff` and the
  kit use Texuli's `changesModel` and `kitApproval`. `ds import` leaves
  duplicate library sources to Texuli. `ds new --brief` reads every clause with
  a color itself, and the brand seed survives a generator repair.
  `@protoyard/ui`'s `VirtualListView` takes `bind:ref` and rest attributes, and
  social-feed names each feed article by its author and runs edge to edge.

## 1.8.1

No changes in this release.

## 1.8.0

### Patch Changes

- The design-system lifecycle on Texuli 0.16.1 (every Texuli dependency pinned
  exactly at `0.16.1`): `ds new --from-tokens`, `--from-css`, `--from-logo`
  (SVG) and `--brief` generate a draft from your brand with Texuli's generator,
  with its loss and AA repair reports; `ds kit <id>` writes the kit prototype on
  Texuli's `DesignSystemKit`; `ds approve --release` and `ds release` record
  releases, `ds versions` lists them and `ds diff` compares them; `ds export
  --bundle` and `ds import` move a design system between workspaces, the bundle
  checked as untrusted input; `ds validate` adds Texuli's full check (`--strict`
  fails on it); `check ds --render` checks locked prototypes in Chromium on every
  route, light and dark, phone and desktop, and the build CI template runs it.

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

- A first-class consumer workspace (`npm create protoyard`). `generate`, `blueprint new --from-brief --generate`, `quick promote` and `new --from` write the installed Protoyard version instead of `workspace:*`, and keep a consumer's own `workspace:` packages. `protoyard.workspace.json` accepts local `templates` and a `showcase.templates` default. New commands: `validate --all [--build]`, `check texuli` (the Texuli adoption rules for any workspace), `sweep <slug>` (light/dark × desktop/phone PNGs), and `gallery build` / `gallery preview`. `protoyard/capture` and `protoyard/static-server` are public subpaths. The catalog blueprints ship in `@protoyard/templates`, the gallery ships its guides, and `showcase` copies the published player build.

## 1.1.3

No changes in this release.

## 1.1.2

No changes in this release.

## 1.1.1

No changes in this release.

## 1.1.0

No changes in this release.
