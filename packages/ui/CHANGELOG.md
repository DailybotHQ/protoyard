# @protoyard/ui

## 1.8.0

### Patch Changes

- The design-system lifecycle on Texuli 0.16.0 (every Texuli dependency pinned
  exactly at `0.16.0`): `ds new --from-tokens`, `--from-css`, `--from-logo`
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

### Minor Changes

- 10e69ef: Adopt Texuli 0.14.3. Every Texuli dependency is pinned exactly at `0.14.3`. Re-exported components gain Texuli's new props directly (Checkbox/Radio/Switch `labelContent`, Field `counter`, NumberField `display="output"`, Button/IconButton `iconSize`, BottomNav `emphasis`, MobileHeader `eyebrow`/`leading`/`onClose`, SplitView `listWidth`/`breakpoint`/`context`, Stat `tone`, Composer `layout="row"`/`sendButton="icon"`, `texuli/list-item`, opt-in Spanish catalogs). `@protoyard/ui` `Avatar` forwards the new `tone` and `shape`. The page host's CSS caps rise with Texuli's CSS (initial 7,562 B measured, cap 7,940 B; all CSS 43,139 B, cap 44,218 B).

### Patch Changes

- 61fd849: Consumer batch 9 (Dailybot). The `component-scoped-class` adoption rule now splits selector lists only at top-level commas and removes nested `:global(...)` groups, so a fully global rule such as `:global(:is(.a, .b).tx-button)` no longer counts `.b` as a scoped class. `EmojiPicker` inside a Texuli `Field` is now named by the Field label plus its visible value (the placeholder or the chosen emoji), even when the Field passes no `aria-labelledby`.

## 1.5.0

### Minor Changes

- e9af874: Adopt Texuli 0.14.2 (every Texuli dependency pinned exactly). `Select` forwards Texuli's `block` (through `fullWidth` or `block`) and the trigger `variant` (`'ghost'` per instance), and drops its full-width wrapper. `ChipGroup` takes `required`: in single mode the selected chip stays selected (Texuli's `deselectable={false}`). `TimelineView` forwards `initialDate` and `formatTick`; without `initialDate` the axis opens at the simulated today when it falls inside the plan. Texuli fixes come along: dialogs mounted open show their backdrop, controlled toggles render their prop, side sheets and drawers fill their height. The layout host initial cap is re-measured at 4,175 B gzip (cap 4,280 B).

## 1.4.3

No changes in this release.

## 1.4.2

No changes in this release.

## 1.4.1

### Patch Changes

- a14a4f7: The demo badge keeps clear of pinned edge chrome (a `fixed` or `sticky` bar or rail, even a plain element), and `EmojiPicker`'s trigger name includes its visible prompt or emoji when a Field labels it.

## 1.4.0

### Minor Changes

- Universal gaps from Corag's register: kits and wrappers resolve their words through the prototype dictionary, renderer, deck, design-system, tooling and budget additions, Texuli 0.14.1.

## 1.3.0

### Patch Changes

- Kit screens on domain adapters (ADR-046): ports for saas-ui, flows-ui, gamification-ui and pages-ui forms; board, calendar, files and timeline gaps in views-ui; voice session callbacks; Texuli 0.14.0.

## 1.2.4

### Patch Changes

- Fixes from the consumers' gap batches 3 and 4: `sweep` forces each shot's mode, hides DevTools and takes several slugs; `defineDesignSystemTheme(compiled, { fontFiles })` for fonts in a production build; `designSystemFromTheme` no longer copies `primary` into `sidebarPrimary`; `WeekdayPicker` names start with the visible text; `Dialog` forwards `onCloseAutoFocus`; floating placement probes at most 240 points and re-places at most every 500 ms on busy pages.

## 1.2.3

No changes in this release.

## 1.2.2

### Patch Changes

- Texuli 0.13.1 across every package (an additive patch): icons registered by name (`registerIcons`, `IconsProvider`), an editable `CodeField`, `Image srcDark` and `AvatarGroupGrid`.

## 1.2.1

No changes in this release.

## 1.2.0

No changes in this release.

## 1.1.3

No changes in this release.

## 1.1.2

No changes in this release.

## 1.1.1

No changes in this release.

## 1.1.0

### Minor Changes

- 085df93: Texuli 0.12.0 from npm (exact pins). Texuli 0.10 to 0.12 closed gaps G100–G136, so their adapters are gone. Theme id lists come from `@texuli/tokens/library-ids`, system tokens from `@texuli/tokens/system.css`, and deck print uses `@texuli/slides/export-core`. `CommandPalette` and `DateRangePicker` use Texuli's styled components.
- dfdf50e: Move every Texuli dependency to the exact npm version 0.9.0. Every `@protoyard/ui` component export takes Texuli's uniform contract: `bind:ref` gives its root element, rest attributes land on the root or its focusable control, and a caller's handlers run first. Additive API: `ref` and rest props everywhere, `CommandPalette` `bind:open`, `FileDropzone` `id` and `TabItem.badgeLabel`. Overlays, toasts, date fields, tags, Kanban and avatars drop their gap adapters for Texuli's fixes.
