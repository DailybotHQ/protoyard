# Texuli in Protoyard

Protoyard is adopting [Texuli](../../texuli), the standalone MIT Svelte 5
component library extracted from `@protoyard/ui`. This is the first step:
Texuli is **linked**, not copied or installed from a registry, and Protoyard
stays green.

**Status:** this is the local `texuli-adoption` branch. It is not on `main`
and has not been pushed. Themes come from `@texuli/tokens`; the simple,
floating and dialog-family `@protoyard/ui` controls run on
`@texuli/primitives`; and the generic styled components are re-exported
from `texuli` (below). Later adoption tasks move packages over one at a
time.

## How it is linked

The root `package.json` declares ten `link:` dev dependencies. Each path is
relative to the Protoyard root, so the Texuli checkout must sit next to
Protoyard (`../texuli`):

| Package | Link |
| --- | --- |
| `@texuli/core` | `link:../texuli/packages/core` |
| `@texuli/primitives` | `link:../texuli/packages/primitives` |
| `@texuli/tokens` | `link:../texuli/packages/tokens` |
| `texuli` | `link:../texuli/packages/texuli` |
| `@texuli/blocks` | `link:../texuli/packages/blocks` |
| `@texuli/catalog` | `link:../texuli/packages/catalog` |
| `@texuli/charts` | `link:../texuli/packages/charts` |
| `@texuli/chat` | `link:../texuli/packages/chat` |
| `@texuli/data` | `link:../texuli/packages/data` |
| `@texuli/media` | `link:../texuli/packages/media` |

- `pnpm install` links `node_modules/@texuli/*` and `node_modules/texuli` to
  those folders. The lockfile records only the `link:` specifiers, and
  nothing is fetched.
- **Texuli installs its own dependencies.** Run `pnpm install` in `../texuli`
  first. Its packages ship TypeScript and Svelte sources, which Protoyard's
  Vite and Vitest compile like workspace code. Svelte comes from Protoyard:
  the prototype config dedupes `svelte`.
- **Packed packages never carry the links.** They are root dev dependencies
  only, and `pnpm check:packages` refuses `link:` in any packed manifest.
- **A worktree** (for example `tmp/lanes/<lane>`) needs `../texuli` to
  resolve from its own root. Point `tmp/lanes/texuli` at the Texuli checkout
  with a git-ignored symlink.

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
- **Prototypes are unchanged:** they keep `--py-*`, the built-ins, the
  `protoyard.<namespace>.appearance` cache and the Violet default.
- **Why opt-in and dynamic imports.** `@texuli/tokens` declares no
  `sideEffects` and exposes no `css` or `contract` subpath. Its root barrel
  re-exports the whole library, so any static import of it would ship the
  library in every prototype's initial chunk.


## Chart math from `@texuli/charts`

`@protoyard/charts` re-exports scales, shapes, layouts and downsampling from
`@texuli/charts/math`. Chart palettes stay local (`@protoyard/charts/palette`).
`@protoyard/charts-ui` keeps the Protoyard chart shells and data contract; its
math imports resolve through `@protoyard/charts` to Texuli.

See `packages/charts/docs/texuli-math.md` and `packages/charts-ui/docs/texuli-charts.md`.



## Content blocks from `@texuli/blocks`

`@protoyard/blocks` re-exports code tokenization, diagram layout, limits and
safety from `@texuli/blocks`. Zod schemas, formula (until `@texuli/blocks/formula`),
interactive host and catalog stay adapters.

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

## The dev server

`devFsAllow` (`@protoyard/renderer-svelte`) is the list of folders a
prototype's dev server may serve through `/@fs`.
- It now also includes the real folder of each `link:` dependency the root
  declares (`linkedPackageRoots`).
- It allows each linked package folder and nothing around it. The rest of
  the Texuli checkout (its root files, `.dwp/`, other packages) is still
  refused with 403.
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
| `pnpm vitest run packages/renderer-svelte/tests/texuli-link.test.ts` | **Test.** Every linked package resolves into the Texuli checkout, not a copy. A Protoyard screen mounts Texuli's `Button`, which works on click, and blocks a `javascript:` link through `@texuli/core/url-policy`. A Texuli library theme applies to the document |
| `pnpm vitest run packages/renderer-svelte/tests/texuli-link-build.test.ts` | **Dev and build**, through the real `defineProtoyardConfig`. A dev server on port 4962 serves the linked `Button.svelte` over `/@fs` and refuses the Texuli root `package.json` (403). A production build bundles the Texuli Button into the prototype. Without the linked roots in `devFsAllow`, the dev check fails |
| `pnpm vitest run packages/renderer-svelte/tests/vite.test.ts` | `linkedPackageRoots`: links resolve to real folders; duplicates, missing links, non-link specifiers and an unreadable manifest add nothing. This workspace allows exactly the Texuli package folders |
| `pnpm vitest run packages/ui/tests/simple-primitives.test.ts` | The Texuli-backed controls: bindable refs, states, tab stops, wrapping tabs and unmounted inactive panels, the accordion's size variable, separator and progress semantics |
| `pnpm vitest run packages/ui/tests/floating-primitives.test.ts` | The Texuli-backed floating controls: labels through a consumer id, the combobox filter and form value, tooltip, menu, popover ref and initial focus, people search |
| `pnpm vitest run packages/ui/tests/dialog-family.test.ts packages/ui/tests/overlay.test.ts packages/ui/tests/adaptive-overlay.test.ts packages/ui/tests/alert-dialog.test.ts` | The Texuli-backed dialog family: the undo toaster under a modal and F6, device-screen containment, alert Escape, stacking, nesting, focus return, outside presses |
| `pnpm check` | Lint, typecheck and the full unit suite stay green |

## Limits

- **Local only.** The links need a Texuli checkout at `../texuli`. A fresh
  clone of Protoyard alone cannot install this branch until Texuli is
  published or vendored, a later adoption decision.
- **Typecheck reach.** Protoyard's typecheck covers the fixture that imports
  Texuli. The Texuli sources themselves are type-checked by Texuli's own
  gates.

## DevTools panel on Texuli

`@protoyard/devtools` mounts its compact controls on Texuli components
(`texuli/button`, `texuli/choice`, `texuli/badge`, `texuli/alert`). Theme Studio
and the gallery theme shelf already use `@protoyard/themes` → `@texuli/tokens`.
See `packages/devtools/docs/texuli-controls.md`.
