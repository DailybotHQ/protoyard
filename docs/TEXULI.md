# Texuli in Protoyard

Protoyard is adopting [Texuli](https://www.npmjs.com/package/texuli), the
standalone MIT Svelte 5 component library extracted from `@protoyard/ui`.
Protoyard installs the **published npm packages**, and new UI comes from
Texuli first ([the adoption check](#texuli-first-the-adoption-check)).

**Status:** this is the local `texuli-adoption` branch. It is not on `main`
and has not been pushed. Themes come from `@texuli/tokens`; the simple,
floating and dialog-family `@protoyard/ui` controls run on
`@texuli/primitives`; and the generic styled components are re-exported
from `texuli` (below). Later adoption tasks move packages over one at a
time.

## How it is linked

Protoyard installs Texuli **from npm**, at exact versions. No Texuli checkout is
needed, and no manifest uses `link:` or `file:` for Texuli (a test in
`tests/adoption/` fails if one does).

| Package | Version | Declared by |
| --- | --- | --- |
| `texuli` | `0.3.0` | the root and every UI package, template and prototype |
| `@texuli/core`, `@texuli/primitives`, `@texuli/date`, `@texuli/chat`, `@texuli/data` | `0.3.0` | the root and `@protoyard/ui` |
| `@texuli/tokens` | `0.3.0` | the root, `themes`, `charts` and the gallery |
| `@texuli/charts` | `0.3.0` | the root, `charts`, `charts-ui`, `blocks-ui` and `analytics-ui` |
| `@texuli/data` | `0.3.0` | `views`, `views-ui`, `blocks-ui` and `analytics-ui` |
| `@texuli/blocks` | `0.3.0` | the root, `blocks`, `blocks-ui` and `pages-ui` |
| `@texuli/workflows` | `0.3.0` | the root and `flows-ui` |
| `@texuli/drag` | `0.3.0` | the root and `views-ui` |
| `@texuli/astro` | `0.3.0` | the root and the gallery |
| `@texuli/catalog`, `@texuli/media` | `0.3.0` | the root |

- **What Protoyard compiles.** The npm tarballs ship built `dist/` files
  (JavaScript, Svelte components and `.d.ts` types). `svelte-check` checks
  Protoyard against those published types. With the old `link:` setup it
  never type-checked the linked sources, so some mismatches went unnoticed
  (see gap G2 in the adoption plan).
- **The release-age guard.** `pnpm-workspace.yaml` keeps
  `minimumReleaseAge: 4320` (3 days) for every dependency except `texuli` and
  `@texuli/*` (`minimumReleaseAgeExclude`). Texuli is Dailybot's own library,
  released by the same owner, and Protoyard adopts a release the day it ships.
- **Updating.** Bump every Texuli specifier to the same released version in
  one change. Run `pnpm install`, then `pnpm check`.

## Texuli first: the adoption check

`pnpm exec tsx scripts/check-texuli-adoption.ts` keeps Protoyard on Texuli.
It scans the Svelte, TypeScript, CSS and Astro sources of `packages/`,
`apps/`, `templates/` and `prototypes/` (tests and build output excluded) for
five rules:

| Rule | Fails on | Use instead |
| --- | --- | --- |
| `legacy-import` | importing `clsx`, `tailwind-merge` or `tailwind-variants` | `cx` from `texuli/cx` |
| `raw-lucide` | a `@lucide/svelte` component rendered directly in markup | `Icon` from `texuli/icons` for its built-in names, otherwise `<LucideIcon icon={Glyph} />` from `texuli/icons/lucide`. Lucide stays the glyph source; Texuli renders it. |
| `py-token` | a `var(--py-…)` read | the `--tx-*` tokens |
| `raw-control` | a native `<button>`, `<input>`, `<select>`, `<textarea>` or `<dialog>` in a Svelte component | the Texuli control |
| `own-component` | a leaf component of a UI package that imports nothing from Texuli or Protoyard and draws its own UI | compose Texuli |

- **Pending lists.** Known violations are listed per unit in
  `tests/adoption/pending/<unit>.json`. The default run is a ratchet: it
  fails only on a violation those lists do not cover, and `pnpm test` runs it.
- **`--scope <path> --strict`** fails on every violation in scope.
- **`--allow-gaps`** (used with `--strict`) still accepts a pending entry that
  cites an open Texuli gap from `tests/adoption/texuli-gaps.json`.
- **`--prune`** removes the entries that are fixed. It never adds one.
- **Exceptions.** `tests/adoption/texuli-exceptions.json` is the closed list
  of files that stay Protoyard's (device frames, browser and window chrome,
  scenario and honesty UI, Protoyard-only block types). Every entry carries a
  reason.
- **Texuli gaps.** When Texuli lacks something, keep a minimal adapter, cite
  the gap in the pending entry, and report it to the Texuli maintainers.
  Never patch or copy Texuli code.

## Themes come from `@texuli/tokens`

`@protoyard/themes` wraps `@texuli/tokens`; details in
[THEMES.md](THEMES.md#the-theme-library-loaded-on-demand).

- **Tokens.** Every library theme's tokens are built by Texuli and converted
  with `fromTexuliTheme`, through dynamic imports only.
  - **The catalog** is 64 themes, synchronous. Its definitions are kept in
    Protoyard and tested identical to Texuli's port.
  - **The full library** is 204 themes, opt-in with `enableFullThemeLibrary()`
    (`@protoyard/themes/library-full`).
- **Variables.** On a page that calls `enableTexuliAppearance()`
  (`@protoyard/themes/texuli`), `applyAppearance()` also writes Texuli's
  `--tx-*` variables, and every `--py-*` name stays an alias with the same
  value. `toTexuliTheme` completes a Protoyard palette with the 16 roles
  Texuli adds.
- **Prototypes keep their tokens:** `--py-*`, the built-ins, the
  `protoyard.<namespace>.appearance` cache and the Violet default. The
  renderer now calls `enableTexuliAppearance()` in `bindAppearance` (and
  `mountDevtools` does too), so every prototype also gets the `--tx-*`
  variables the re-exported Texuli components read.
- **Why subpaths and dynamic imports.** `@texuli/tokens` declares
  `sideEffects: ["**/*.css"]` and exposes `css`, `contract` and `library`
  subpaths, which Protoyard imports. Its root barrel re-exports the whole
  library, so a static import of the root would ship the library in every
  prototype's initial chunk.


## Charts from `@texuli/charts`

`@protoyard/charts` re-exports math from `@texuli/charts/math`. Palettes use
`@texuli/tokens/palette` `deriveChartTokens` (with `--py-chart*` CSS helpers).
`@protoyard/charts-ui` re-exports every Texuli chart family (`cartesian`,
`part-whole`, `matrix`, `compact`, `canvas`, `geo`, `flow`, `interaction`) with
thin adapters for Protoyard props (`seriesFromRows`, `emptyMessage`, funnel
`count`, scatter series shape).

See `packages/charts/docs/texuli-math.md` and `packages/charts-ui/docs/texuli-charts.md`.



## Content blocks from `@texuli/blocks`

`@protoyard/blocks` re-exports code tokenization, diagram layout, limits and
safety from `@texuli/blocks`. Zod block schemas, interactive host and catalog stay adapters.
Formula engine is `@texuli/blocks/formula` (Zod schemas remain adapters).

`@protoyard/blocks-ui` every Texuli family renders through
`@texuli/blocks/*/renderers` with thin shape adapters (ChartSpec→chart series,
map tones, embed start labels). Protoyard-only types (people, timeline, steps,
comparison, icon, form, counter, chart-controls, reveal) register as extensions.

See `packages/blocks/docs/texuli-blocks.md` and
`packages/blocks-ui/docs/texuli-blocks.md`.


## Simple controls run on `@texuli/primitives`

These `@protoyard/ui` components keep their props, classes and behavior, and
render Texuli's headless primitives, imported by subpath
(`@texuli/primitives/<name>`):

| Component | Texuli primitive |
| --- | --- |
| `Separator` | `separator` (`SeparatorRoot`) |
| `Progress` | `progress` |
| `Checkbox` | `checkbox` (`CheckboxRoot`) |
| `Switch` | `switch` (`Root`, `Thumb`) |
| `RadioGroup`, `RadioGroupItem` | `radio-group` |
| `Tabs` | `tabs` |
| `Accordion` | `accordion` |

- **Bindable `ref`.** Texuli's checkbox, switch, radio group and tabs roots
  do not expose their element. The wrappers fill `ref` through an attachment
  (`refAttachment`, `packages/ui/src/lib/ref.ts`) that the primitive spreads
  on its element.
- **Protoyard's defaults are kept:**
  - separators are decorative (`role="none"`) unless `decorative={false}`;
  - arrow keys wrap around the tabs (`loop`);
  - inactive tab panels are not mounted (`forceMount={false}`).
- **Accordion animation.** The collapse keyframes read Texuli's
  `--tx-accordion-content-height`.
- **Resolution.** `@protoyard/ui` imports `@texuli/primitives` through the
  root `link:` dev dependency. Its own manifest declares no link, so
  `pnpm check:packages` stays clean.
- **Tests:** `pnpm vitest run packages/ui` (`simple-primitives.test.ts`
  covers the seams above, and requires the selected radio or tab to be the
  only tab stop, per the WAI-ARIA APG).

## Floating controls run on `@texuli/primitives`

These components also keep their props and classes:

| Component | Texuli primitive |
| --- | --- |
| `Tooltip` | `tooltip` |
| `Popover` | `popover` |
| `DropdownMenu` | `menu` |
| `Select` | `select` |
| `Combobox` | `combobox` |
| `CommandPalette` (`@protoyard/ui`), the commands palette (`@protoyard/views-ui`), `UserPicker` | `command` (and `popover`) |

- **No portals.** Popover, menu, select and combobox content opens in the
  browser's top layer. Tooltip content is positioned `fixed`. Both stay
  above clipping ancestors without moving in the DOM.
- **Widths.** The select and combobox lists match their field's width. The
  `UserPicker` list is `w-72`.
- **`Popover` takes `initialFocus`.** It is an element, or a getter for one,
  that takes focus when the content opens; otherwise the first control does.
  The date pickers use it for the calendar's focused date.
- **Combobox.**
  - `filter` replaces the default label match. The chosen label in the
    input is not a search, so opening the list shows every option.
  - `name` and `required` submit and validate the chosen value through
    Texuli's form bridge.
- **Command lists.**
  - The first result starts highlighted. ArrowDown moves to the next one,
    and Enter runs it.
  - `UserPicker` searches the name (the item label) and the subtitle (its
    keyword).
  - A running command marks the palette `aria-busy`.
- **Menus** open on click or with Enter, Space or ArrowDown on the trigger.
- **Tests:** `floating-primitives.test.ts` covers labels through a consumer
  `id`, the combobox filter and form value, the tooltip, the menu, the
  popover's `ref` and `initialFocus`, and people search.

## The dialog family runs on `@texuli/primitives`

| Component | Texuli primitive |
| --- | --- |
| `Dialog`, `BottomSheet`, `DetailPanel`, the `AppShell` and layout navigation drawers, both command palettes | `dialog` |
| `AlertDialog` | `alert-dialog` |
| `Drawer` | `sheet` (`Sheet.Content`, modal or not) |

- **Where they open.**
  - On the page, overlays open in the browser's top layer.
  - Inside a framed device (the shell sets the overlay target), they open in
    Texuli's `contained` mode: the device screen holds them and bounds the
    inert page, focus trap and scroll lock.
  - `useOverlayPortalTarget()` gives each overlay its `mode` and `container`.
- **Protoyard's stack still decides closing.**
  - Every overlay still registers with `overlayStack`.
  - `overlayDismissHandler` (`components/overlay/dismiss.ts`) applies its
    rules through the primitive's `onDismissRequest`: only the top overlay
    closes, a layer inside it takes Escape first, the undo toaster is never
    outside, and `closeOnEscape` and `closeOnOutsideClick` hold.
  - Focus returns to the opener through the stack. A non-modal drawer
    restores focus itself, since it has no focus scope.
- **Non-modal drawers** pass `closeOnOutsideClick` and `closeOnEscape` to
  the sheet (`dismissOutside`, `closeOnEscape`).
- **AlertDialog.**
  - Cancel takes focus when the alert opens (`initialFocus`).
  - Escape cancels and calls `onCancel`.
  - It stays open, with a busy confirm button, until `onConfirm` settles.
  - `EntityList` now waits for its delete before the dialog closes.
- **The undo toaster.**
  - It is a Texuli inert exemption: a modal never makes it inert, and a
    press on it is never outside.
  - On the page it re-enters the top layer after each overlay that opens
    there, so it paints above them. In a frame, its z-index stays above
    every overlay.
  - F6 focuses the newest Undo. Tab stays inside a modal, per WAI-ARIA APG.
- **Tests:** `dialog-family.test.ts` covers the toaster under a modal and F6,
  containment in a device screen, and Escape on an alert. The overlay and
  adaptive-overlay suites cover the stack, nesting, focus return and
  outside presses.

## Generic styled components come from `texuli`

`@protoyard/ui` re-exports these from Texuli's styled `texuli` package, and its
own copies are gone. Import them from `@protoyard/ui` as before:

| `@protoyard/ui` export | From |
| --- | --- |
| `Button`, `buttonVariants`, `ButtonVariant`, `ButtonSize` (`ButtonProps` is `ComponentProps<typeof Button>`) | `texuli/button` |
| `Badge`, `BadgeVariant`, `badgeVariants` (Texuli's `badgeClass`) | `texuli/badge` |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `CardGrid` | `texuli/card` |
| `Checkbox`, `Switch`, `RadioGroup`, `RadioGroupItem` (Texuli's `Radio`), `RadioOption` | `texuli/choice` |
| `Label` | `texuli/field` |
| `Textarea` | `texuli/input` |
| `Accordion`, `AccordionItem` (Texuli's `AccordionItemDef`) | `texuli/tabs-accordion` |
| `Tooltip` | `texuli/tooltip` |
| `Separator` | `texuli/separator-aspect` |
| `Progress`, `Skeleton` | `texuli/feedback` |
| `Kbd` | `texuli/kbd-code` |
| `ErrorState` | `texuli/empty` |
| `Stepper`, `StepperStep`, `Wizard` | `texuli/stepper` |
| `Carousel`, `CarouselItem` | `texuli/carousel` |
| `Breadcrumb`, `BreadcrumbItem` | `texuli/navigation` |

- **Their look is Texuli's.** Each component imports its own stylesheet
  (`tx-*` classes in `@layer tx.components`), colored by the `--tx-*`
  variables.
  - The renderer calls `enableTexuliAppearance()` in `bindAppearance`, so
    every appearance write sets `--tx-*` next to `--py-*`. They have the same
    values, and the no-flash cache replays both.
  - `@protoyard/themes/texuli` now imports `@texuli/tokens/css` and
    `@texuli/tokens/contract`, not the package root, so the theme library
    never enters the initial chunk.
- **Stylesheet imports type-check** through `packages/ui/src/css.d.ts`. The
  barrel references it, and a package that imports `@protoyard/ui` sources
  by path adds it to its `tsconfig` `include` (`devtools` does).
- **`@protoyard/ui` keeps:**
  - the prototype pieces: frames and shells, `ScenarioSwitcher`, the
    honesty tags, actors and layouts;
  - its overlay stack and undo toaster;
  - the components in the follow-up list below, as wrappers on
    `@texuli/primitives`.

### Follow-ups: components that stay Protoyard wrappers

Their APIs differ from Texuli's styled components. Each needs a Texuli
change, a Protoyard wrapper, or both, before it can be re-exported:

| Component | Gap | Proposed change |
| --- | --- | --- |
| `Select` (73 importers), `Combobox` | One component with `items` and `placeholder` versus compound parts | A Texuli items-driven `Select` and `Combobox` (or a thin Protoyard wrapper over the styled parts) |
| `DropdownMenu` | `items[]` with `trigger` versus compound menu parts | An items-driven `DropdownMenu` in Texuli |
| `Popover` | One component with a `trigger` snippet versus Root, Trigger and Content | A one-piece styled `Popover` in Texuli |
| `Dialog`, `AlertDialog`, `Drawer`, `DetailPanel`, `BottomSheet` | Protoyard's overlay `stack` (nesting order, dismissible layers, focus return) and device-frame containment | Texuli's layer stack covers nesting; drop `stack` once Protoyard's overlays need only it |
| `Tabs` | Variant names (`segmented`/`underline` versus `line`/`pills`/`enclosed`), item `icon` | Map the variants in a wrapper; Texuli `TabItem.icon` |
| `Input` | `value` binds numbers too; Texuli's is a string | Texuli `Input` with number binding for `type="number"` |
| `FormField` (75 importers) | One-piece field with label, hint and error versus compound `Field` | A one-piece `FormField` over Texuli's `Field` parts |
| `EmptyState`, `Notice`, `StatCard`, `Sidebar` | An `icon` component prop versus a snippet | Accept an icon component in Texuli, or wrap |
| `Avatar` | `srcset` | Texuli `Avatar` `srcset` |
| `Spinner` | Numeric `size` versus `sm`/`md`/`lg` | Map in a wrapper |
| `Pagination`, `NumberStepper`, `OtpInput`, `StarRating`, `ChipGroup`, `FileDropzone`, `TagEmailInput` | Different props or compound parts | One wrapper each, or Texuli one-piece variants |
| `Calendar`, `DatePicker`, `DateRangePicker` | `IsoDate` strings and `min`/`max` versus `CalendarDate` and `minValue`/`maxValue`; Texuli requires `label` | A date adapter in a wrapper |
| `CommandPalette` | Inline palette versus Texuli's modal palette | Keep Protoyard's, or a Texuli inline mode |
| `Toaster` and `toast` (39 importers) | A different toast store singleton | Move every `toast` import with the `Toaster` |
| `DataTable` | No Texuli counterpart (Texuli has table markup only) | Keep Protoyard's on Texuli table parts later |

## Layouts come from `texuli/layouts`

- **The host.** `@protoyard/ui`'s `LayoutHost` wraps texuli's `LayoutHost`.
  - It resolves the layout with Protoyard's catalog (`layoutForWidth` from
    `@protoyard/core`), starting from the real width.
  - It keeps the `data-py-layout-host` and `data-layout` hooks, and mirrors
    the layout on screen as `data-py-layout="<id>"`, set only once that
    layout has loaded.
  - Texuli renders the chrome and keeps the one routed screen outlet.
- **The registry** is texuli's (`registerProtoyardLayouts`,
  `packages/ui/src/layouts/register.ts`): texuli's `registerAppLayouts`,
  `registerMobileLayouts` (after the app ones) and
  `registerAuthSettingsLayouts`, plus `dashboard-grid` and `marketing`. Each
  is one lazy import per layout.
- **`docs` stays Protoyard's.** Its contract differs from texuli's docs
  layout: a `navigation` snippet rather than the nav model, and it is wide
  only (900 px), falling back to mobile-drawer, where texuli's has no width
  rule. `pages-ui` and `blocks` follow its heading ids.
- **The nav model** (`NavModel`, `resolveNav`, `navPath`, …) is texuli's,
  re-exported from `@protoyard/ui`. `navFromSidebar` stays Protoyard's.
- **Re-exported and removed:** `SplitView` comes from
  `texuli/layouts/app/split-view`, and `@protoyard/ui/layouts/marketing` is
  texuli's `MarketingLayout`. Protoyard's own sidebar, rail, top-nav,
  dual-sidebar, mobile, master-detail, dashboard-grid, marketing, wizard and
  auth-split layouts are deleted, with their chrome (`LayoutChrome`,
  `LayoutDrawer`, `NavIcon`, `layout-kit`).
- **Device frames** stay Protoyard's (texuli has none). The layout host
  bridges the frame to texuli's tokens: `--tx-app-height` follows
  `--py-app-height`, and `--tx-safe-top`, `--tx-safe-right`,
  `--tx-safe-bottom` and `--tx-safe-left` follow the page's safe areas and
  the frame's `--py-safe-*`.
- **Markers** in tests and E2E: texuli's (`data-tx-app-layout="sidebar"`,
  `data-tx-layout="mobile-tabs"`, …) or the host's `data-py-layout`;
  `docs` keeps `data-py-docs-layout`.

## The dev server

`devFsAllow` (`@protoyard/renderer-svelte`) is the list of folders a
prototype's dev server may serve through `/@fs`.
- It also includes the real folder of each `link:` dependency the root
  declares (`linkedPackageRoots`), and only that folder.
- Texuli now comes from npm (inside `node_modules`), so for this workspace
  the list adds nothing. The function stays for consumers that link a
  local package.
- A link that doesn't resolve adds nothing.

## Using a Texuli package

Import Texuli packages by name. For texels, use the subpath, never the
`@texuli/core` root barrel:

```svelte
<script lang="ts">
import { safeHref } from '@texuli/core/url-policy';
import { Button } from 'texuli/button';
</script>
```

## Verified

| Command | What it proves |
| --- | --- |
| `pnpm vitest run packages/renderer-svelte/tests/texuli-link.test.ts` | **Test.** Every Texuli package resolves to its published version in the pnpm store, with a `dist/`. A Protoyard screen mounts Texuli's `Button`, which works on click, and blocks a `javascript:` link through `@texuli/core/url-policy`. A Texuli library theme applies to the document |
| `pnpm vitest run packages/renderer-svelte/tests/texuli-link-build.test.ts` | **Dev and build**, through the real `defineProtoyardConfig`. A dev server on port 4962 serves the published `Button.svelte` over `/@fs`. A production build bundles the Texuli Button into the prototype |
| `pnpm vitest run packages/renderer-svelte/tests/vite.test.ts` | `linkedPackageRoots`: links resolve to real folders; duplicates, missing links, non-link specifiers and an unreadable manifest add nothing. This workspace, on npm Texuli, adds no roots |
| `pnpm vitest run tests/adoption` | The adoption check's rules, ratchet, `--strict`, `--allow-gaps`, exceptions and `--prune`; every manifest pins Texuli to one exact npm version; the repository has no violation outside the pending lists |
| `pnpm vitest run packages/ui/tests/simple-primitives.test.ts` | The Texuli-backed controls: bindable refs, states, tab stops, wrapping tabs and unmounted inactive panels, the accordion's size variable, separator and progress semantics |
| `pnpm vitest run packages/ui/tests/floating-primitives.test.ts` | The Texuli-backed floating controls: labels through a consumer id, the combobox filter and form value, tooltip, menu, popover ref and initial focus, people search |
| `pnpm vitest run packages/ui/tests/dialog-family.test.ts packages/ui/tests/overlay.test.ts packages/ui/tests/adaptive-overlay.test.ts packages/ui/tests/alert-dialog.test.ts` | The Texuli-backed dialog family: the undo toaster under a modal and F6, device-screen containment, alert Escape, stacking, nesting, focus return, outside presses |
| `pnpm vitest run packages/ui/tests/layout-host.test.ts packages/ui/tests/layouts-desktop.test.ts packages/ui/tests/layouts-mobile.test.ts packages/ui/tests/layouts-content.test.ts packages/renderer-svelte/tests/bundle-hygiene.test.ts` | LayoutHost on texuli's: registration, lazy loading, fallbacks, the routed screen kept across layouts, one lazy chunk per layout |
| `pnpm check` | Lint, typecheck and the full unit suite stay green |

## Limits

- **Adoption is in progress.** The pending lists in `tests/adoption/pending/`
  record what still duplicates Texuli, and the adoption plan removes them
  package by package. Some entries wait on Texuli APIs that are not
  published yet (`tests/adoption/texuli-gaps.json`).
- **Typecheck reach.** Protoyard type-checks against Texuli's published
  `.d.ts` files. Texuli's own sources are type-checked by Texuli's gates.

## Views from `@texuli/data`

### Engines (`@protoyard/views`)

Board, calendar, timeline, grid, tree, map, activity and files are **thin
re-exports** of `@texuli/data` engine subpaths (`@texuli/data/board/engine`,
`@texuli/data/calendar`, `@texuli/data/grid`, …). Protoyard-only modules stay
local: editor, notifications, settings, states, commands and scenarios.

Texuli view schemas use `DataSchema` (`parse` / `safeParse`), not Zod — bridge
when composing service inputs (see `keel-projects-demo`).

### UI (`@protoyard/views-ui`)

Each rich view is a **thin host adapter** over the matching `@texuli/data`
Svelte entry, plus liveQuery/`runService` where the host API differs:

| Subpath | Texuli source | Adapter notes |
| --- | --- | --- |
| `board` | `@texuli/data` `Board` | `query` → `items`, `onMove` via `runService`, optional `onOpen` |
| `calendar` | `@texuli/data/calendar/view` | `query` → `events`; `onChange` and `onCreate` forwarded |
| `timeline` | `@texuli/data/timeline` | `query` → `tasks`, `onReschedule` via `runService` |
| `grid` | `@texuli/data/grid-core` | `query` → `rows`; host FilterBuilder/SavedViews toolkit kept |
| `tree` | `@texuli/data/tree-view` | `query` → `items`; OutlineEditor stays host-only |
| `map` | `@texuli/data/map` `MapView` | markers/select; routes/fences not on Texuli MapView |
| `files` | `@texuli/data/files` `FileBrowser` | `query` → `entries` |
| `activity` | `@texuli/data/activity` | `query` → `items`; CommentThread stays host-only |
| `virtual-list` | `@texuli/data/virtual-list` | pure re-export |

Replaced Protoyard rendering for those surfaces was deleted. Host-only kits
remain: editor, notifications, settings, states, commands, scenarios,
CommentThread, OutlineEditor, and grid filter/saved-view chrome.

