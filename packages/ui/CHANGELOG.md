# @protoyard/ui

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
