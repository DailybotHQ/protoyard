# @protoyard/renderer-svelte

## 1.9.0

### Patch Changes

- Updated dependencies
  - @protoyard/ui@1.9.0
  - @protoyard/review-ui@1.9.0
  - @protoyard/avatars@1.9.0
  - @protoyard/core@1.9.0
  - @protoyard/devtools@1.9.0
  - @protoyard/offline@1.9.0
  - @protoyard/runtime@1.9.0
  - @protoyard/themes@1.9.0

## 1.8.1

### Patch Changes

- @protoyard/avatars@1.8.1
  - @protoyard/core@1.8.1
  - @protoyard/devtools@1.8.1
  - @protoyard/offline@1.8.1
  - @protoyard/review-ui@1.8.1
  - @protoyard/runtime@1.8.1
  - @protoyard/themes@1.8.1
  - @protoyard/ui@1.8.1

## 1.8.0

### Patch Changes

- Updated dependencies [b64de1e]
- Updated dependencies
  - @protoyard/core@1.8.0
  - @protoyard/ui@1.8.0
  - @protoyard/avatars@1.8.0
  - @protoyard/devtools@1.8.0
  - @protoyard/offline@1.8.0
  - @protoyard/review-ui@1.8.0
  - @protoyard/runtime@1.8.0
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
  - @protoyard/runtime@1.7.0
  - @protoyard/devtools@1.7.0
  - @protoyard/themes@1.7.0
  - @protoyard/ui@1.7.0
  - @protoyard/avatars@1.7.0
  - @protoyard/offline@1.7.0
  - @protoyard/review-ui@1.7.0

## 1.6.0

### Patch Changes

- Updated dependencies [61fd849]
- Updated dependencies [10e69ef]
  - @protoyard/ui@1.6.0
  - @protoyard/review-ui@1.6.0
  - @protoyard/avatars@1.6.0
  - @protoyard/core@1.6.0
  - @protoyard/devtools@1.6.0
  - @protoyard/offline@1.6.0
  - @protoyard/runtime@1.6.0
  - @protoyard/themes@1.6.0

## 1.5.0

### Patch Changes

- e9af874: Adopt Texuli 0.14.2 (every Texuli dependency pinned exactly). `Select` forwards Texuli's `block` (through `fullWidth` or `block`) and the trigger `variant` (`'ghost'` per instance), and drops its full-width wrapper. `ChipGroup` takes `required`: in single mode the selected chip stays selected (Texuli's `deselectable={false}`). `TimelineView` forwards `initialDate` and `formatTick`; without `initialDate` the axis opens at the simulated today when it falls inside the plan. Texuli fixes come along: dialogs mounted open show their backdrop, controlled toggles render their prop, side sheets and drawers fill their height. The layout host initial cap is re-measured at 4,175 B gzip (cap 4,280 B).
- Updated dependencies [e9af874]
  - @protoyard/ui@1.5.0
  - @protoyard/review-ui@1.5.0
  - @protoyard/avatars@1.5.0
  - @protoyard/core@1.5.0
  - @protoyard/devtools@1.5.0
  - @protoyard/offline@1.5.0
  - @protoyard/runtime@1.5.0
  - @protoyard/themes@1.5.0

## 1.4.3

### Patch Changes

- 64c1a28: Device and window frames paint theme tokens only (Dailybot G-062). The stage, bezel, edge and shadow use the theme's `muted`, `foreground` (`background` in dark mode), `border-strong` and `shadow` tokens. Frame controls use elevated surface tokens, and no frame uses palette utilities, literal colors or opacity modifiers, so a computed-color check against the compiled theme passes inside a phone, tablet or desktop frame.
- @protoyard/review-ui@1.4.3
  - @protoyard/avatars@1.4.3
  - @protoyard/core@1.4.3
  - @protoyard/devtools@1.4.3
  - @protoyard/offline@1.4.3
  - @protoyard/runtime@1.4.3
  - @protoyard/themes@1.4.3
  - @protoyard/ui@1.4.3

## 1.4.2

### Patch Changes

- e09e5f4: Final-review fixes for PLAN_010 to 012. `gallery build --out` and `sweep --out` go through the output guard, so they never empty the workspace or its sources. `FilePreview` no longer stays on "Loading preview…" after leaving a pending load. The phone calendar falls back to the month view when its agenda chunk cannot load. `SsoButtons` ignores engine `scenarios` under `provideSaas({ ports })` (new `hasSaasRuntime`). The offline plugin resets per build in watch mode. A failed full-screen switch no longer leaves the hint pending.
- Updated dependencies [e09e5f4]
  - @protoyard/offline@1.4.2
  - @protoyard/review-ui@1.4.2
  - @protoyard/avatars@1.4.2
  - @protoyard/core@1.4.2
  - @protoyard/devtools@1.4.2
  - @protoyard/runtime@1.4.2
  - @protoyard/themes@1.4.2
  - @protoyard/ui@1.4.2

## 1.4.1

### Patch Changes

- a14a4f7: The demo badge keeps clear of pinned edge chrome (a `fixed` or `sticky` bar or rail, even a plain element), and `EmojiPicker`'s trigger name includes its visible prompt or emoji when a Field labels it.
- c399afd: Consumer batch 7. The compact demo badge keeps a 16 px disc on theme surface tokens (its touch target may still grow to 44 px) and clears every top-level heading on phones. A type scale ratio no longer shrinks `text-xs` and `text-sm` below 12 px and 13 px. The Texuli adoption check flags a scoped style rule for a class the markup only passes to a component (`component-scoped-class`), which Svelte never applies.
- Updated dependencies [a14a4f7]
- Updated dependencies [c399afd]
  - @protoyard/ui@1.4.1
  - @protoyard/themes@1.4.1
  - @protoyard/review-ui@1.4.1
  - @protoyard/devtools@1.4.1
  - @protoyard/runtime@1.4.1
  - @protoyard/avatars@1.4.1
  - @protoyard/core@1.4.1
  - @protoyard/offline@1.4.1

## 1.4.0

### Minor Changes

- Universal gaps from Corag's register: kits and wrappers resolve their words through the prototype dictionary, renderer, deck, design-system, tooling and budget additions, Texuli 0.14.1.

### Patch Changes

- Updated dependencies
  - @protoyard/ui@1.4.0
  - @protoyard/runtime@1.4.0
  - @protoyard/offline@1.4.0
  - @protoyard/themes@1.4.0
  - @protoyard/review-ui@1.4.0
  - @protoyard/devtools@1.4.0
  - @protoyard/avatars@1.4.0
  - @protoyard/core@1.4.0

## 1.3.0

### Patch Changes

- Kit screens on domain adapters (ADR-046): ports for saas-ui, flows-ui, gamification-ui and pages-ui forms; board, calendar, files and timeline gaps in views-ui; voice session callbacks; Texuli 0.14.0.
- Updated dependencies
  - @protoyard/ui@1.3.0
  - @protoyard/review-ui@1.3.0
  - @protoyard/avatars@1.3.0
  - @protoyard/core@1.3.0
  - @protoyard/devtools@1.3.0
  - @protoyard/offline@1.3.0
  - @protoyard/runtime@1.3.0
  - @protoyard/themes@1.3.0

## 1.2.4

### Patch Changes

- Fixes from the consumers' gap batches 3 and 4: `sweep` forces each shot's mode, hides DevTools and takes several slugs; `defineDesignSystemTheme(compiled, { fontFiles })` for fonts in a production build; `designSystemFromTheme` no longer copies `primary` into `sidebarPrimary`; `WeekdayPicker` names start with the visible text; `Dialog` forwards `onCloseAutoFocus`; floating placement probes at most 240 points and re-places at most every 500 ms on busy pages.
- Updated dependencies
  - @protoyard/themes@1.2.4
  - @protoyard/ui@1.2.4
  - @protoyard/devtools@1.2.4
  - @protoyard/runtime@1.2.4
  - @protoyard/review-ui@1.2.4
  - @protoyard/avatars@1.2.4
  - @protoyard/core@1.2.4
  - @protoyard/offline@1.2.4

## 1.2.3

### Patch Changes

- @protoyard/avatars@1.2.3
  - @protoyard/core@1.2.3
  - @protoyard/devtools@1.2.3
  - @protoyard/offline@1.2.3
  - @protoyard/review-ui@1.2.3
  - @protoyard/runtime@1.2.3
  - @protoyard/themes@1.2.3
  - @protoyard/ui@1.2.3

## 1.2.2

### Patch Changes

- Updated dependencies
  - @protoyard/ui@1.2.2
  - @protoyard/review-ui@1.2.2
  - @protoyard/avatars@1.2.2
  - @protoyard/core@1.2.2
  - @protoyard/devtools@1.2.2
  - @protoyard/offline@1.2.2
  - @protoyard/runtime@1.2.2
  - @protoyard/themes@1.2.2

## 1.2.1

### Patch Changes

- @protoyard/avatars@1.2.1
  - @protoyard/core@1.2.1
  - @protoyard/devtools@1.2.1
  - @protoyard/offline@1.2.1
  - @protoyard/review-ui@1.2.1
  - @protoyard/runtime@1.2.1
  - @protoyard/themes@1.2.1
  - @protoyard/ui@1.2.1

## 1.2.0

### Minor Changes

- Texuli 0.13.0 across every package, and `mountPrototype({ i18n: { labels, locale } })`, which wraps the app in Texuli's `LabelsProvider` so every Texuli component uses the prototype's labels.
- Configurable runtime chrome. The manifest and `mountPrototype` take `devtools.launcher` (`hidden`, `offset`, `tone`) and `demoBadge` as `boolean | { layer, avoid, phone }`, and the compact phone badge stays clear of headings and the bottom navigation.

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @protoyard/themes@1.2.0
  - @protoyard/runtime@1.2.0
  - @protoyard/core@1.2.0
  - @protoyard/devtools@1.2.0
  - @protoyard/avatars@1.2.0
  - @protoyard/offline@1.2.0
  - @protoyard/review-ui@1.2.0
  - @protoyard/ui@1.2.0

## 1.1.3

### Patch Changes

- @protoyard/avatars@1.1.3
  - @protoyard/core@1.1.3
  - @protoyard/devtools@1.1.3
  - @protoyard/offline@1.1.3
  - @protoyard/review-ui@1.1.3
  - @protoyard/runtime@1.1.3
  - @protoyard/themes@1.1.3
  - @protoyard/ui@1.1.3

## 1.1.2

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.1.2
  - @protoyard/avatars@1.1.2
  - @protoyard/devtools@1.1.2
  - @protoyard/offline@1.1.2
  - @protoyard/review-ui@1.1.2
  - @protoyard/runtime@1.1.2
  - @protoyard/themes@1.1.2
  - @protoyard/ui@1.1.2

## 1.1.1

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.1.1
  - @protoyard/avatars@1.1.1
  - @protoyard/devtools@1.1.1
  - @protoyard/offline@1.1.1
  - @protoyard/review-ui@1.1.1
  - @protoyard/runtime@1.1.1
  - @protoyard/themes@1.1.1
  - @protoyard/ui@1.1.1

## 1.1.0

### Minor Changes

- dfdf50e: Motion comes from Texuli: the renderer wraps every prototype in `MotionProvider` with its reduced-motion setting, and theme motion reaches the `--tx-motion-*` tokens. Blueprints of every kind take an optional, closed `motion: { level: "full" | "subtle" | "none" }`, a ceiling on every Texuli animation and on a deck's own transitions (reduced motion still wins); a blueprint without it parses and hashes as before.
- dfdf50e: Move every Texuli dependency to the exact npm version 0.9.0. Every `@protoyard/ui` component export takes Texuli's uniform contract: `bind:ref` gives its root element, rest attributes land on the root or its focusable control, and a caller's handlers run first. Additive API: `ref` and rest props everywhere, `CommandPalette` `bind:open`, `FileDropzone` `id` and `TabItem.badgeLabel`. Overlays, toasts, date fields, tags, Kanban and avatars drop their gap adapters for Texuli's fixes.

### Patch Changes

- Updated dependencies [dfdf50e]
- Updated dependencies [085df93]
- Updated dependencies [dfdf50e]
- Updated dependencies [085df93]
- Updated dependencies [dfdf50e]
  - @protoyard/core@1.1.0
  - @protoyard/themes@1.1.0
  - @protoyard/devtools@1.1.0
  - @protoyard/ui@1.1.0
  - @protoyard/avatars@1.1.0
  - @protoyard/offline@1.1.0
  - @protoyard/review-ui@1.1.0
  - @protoyard/runtime@1.1.0
