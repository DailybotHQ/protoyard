# @protoyard/renderer-svelte

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
