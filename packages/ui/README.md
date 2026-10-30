# @protoyard/ui

The component kit shared by every Protoyard prototype, template and the DevTools panel.
Svelte 5 (runes + snippets), Texuli components, Tailwind CSS 4 utilities on
the `@protoyard/themes` tokens, and Lucide icons. It ships TypeScript/Svelte source; there is no
build step.

## Usage

It is a workspace package, so there is nothing to install. Add `"@protoyard/ui": "workspace:*"`
to the prototype, then import the styles after Tailwind and the theme tokens:

```css
@import 'tailwindcss';
@import '@protoyard/themes/base.css';
@import '@protoyard/ui/styles.css'; /* motion + registers this package with Tailwind via @source */
```

```svelte
<script lang="ts">
  import { Plus } from '@lucide/svelte';
  import { Button, DataTable, FormField, Input, Toaster, toast, type DataTableColumn } from '@protoyard/ui';

  interface Project { id: string; name: string; updatedAt: Date }
  let { projects }: { projects: Project[] } = $props();
  let name = $state('');

  const columns: DataTableColumn<Project>[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'updatedAt', header: 'Updated', sortable: true, align: 'right' },
  ];
</script>

<FormField label="Project name" error={name ? undefined : 'Required'}>
  {#snippet children({ props })}<Input {...props} bind:value={name} />{/snippet}
</FormField>
<Button onclick={() => toast.success('Project created', { description: name })}>
  <Plus aria-hidden="true" /> Create
</Button>

<DataTable {columns} rows={projects} getRowId={(p) => p.id} searchKeys={['name']} caption="Projects" />
<Toaster />
```

## Class names (`cn`)

`cn(...inputs)` (re-exported from `@protoyard/ui`) is an alias of Texuli's
`cx` (`texuli/cx`): it joins strings, arrays and `{ class: condition }`
objects and drops falsy values. **It no longer resolves Tailwind conflicts**
(it used to run tailwind-merge): `cn('p-4', 'p-2')` keeps both classes, and
the stylesheet decides which wins.

To override a component's look, pass a class that does not collide with its
defaults, or use Tailwind's important modifier (`p-2!`). Texuli's components
keep their styles in `@layer tx.components`, so any Tailwind utility you pass
already wins over them; Protoyard components that set a default you may need
to override (for example `MobileAppShell`'s frame height) keep it in a lower
cascade layer for the same reason.

```ts
import { cn } from '@protoyard/ui';
cn('flex', isOpen && 'gap-2', { hidden: !visible }); // → "flex gap-2"
```

## Built on Texuli

`@protoyard/ui` is Protoyard's kit on top of [Texuli](../../docs/TEXULI.md), the
standalone Svelte 5 component library, consumed from its published npm packages
(`texuli`, `@texuli/*` at `0.5.0`):

- **Re-exported from `texuli`:** the generic styled components (`Button`,
  `Badge`, `Card…`, `Checkbox`, `Switch`, `RadioGroup`, `Label`, `Textarea`,
  `Accordion`, `Tooltip`, `Separator`, `Progress`, `Skeleton`, `Kbd`,
  `ErrorState`, `Stepper`, `Wizard`, `Carousel`, `Breadcrumb`, `SplitView`).
  Import them from `@protoyard/ui` as before; their look is Texuli's (`tx-*`
  classes on the canonical `--tx-*` theme variables and renderer-owned `--py-*` geometry).
  The full mapping is in [TEXULI.md](../../docs/TEXULI.md#generic-styled-components-come-from-texuli).
- **Re-exported from Texuli under Protoyard's names:** `AppShell` (and
  `getAppShellContext`) from `texuli/layouts/shells`, `FormField` (Texuli's
  `Field`, `texuli/field`), `toast` (`texuli/toast`),
  `ChatThread`, `MessageList`, `TypingIndicator` and `groupMessages`
  (`@texuli/chat`), and `resolveTrend`, `trendWord` and `formatDelta`
  (`texuli/stat`).
- **Thin adapters over Texuli's styled components:** `Select`, `Combobox`,
  `DropdownMenu`, `Popover`, `Tabs`, `Sidebar`, `Pagination`, `Notice`
  (`Alert`), `FileDropzone` (`FileUpload`), `CommandPalette`, `UserPicker`,
  `FilterBar`, `DataTable` (`texuli/table`) and the dialog family (`Dialog`,
  `AlertDialog`, `Drawer`, `DetailPanel`, `BottomSheet`). They keep their
  Protoyard props and render Texuli's parts and classes. The sheets use
  Texuli's styled `Sheet`, `Drawer` and `DetailPanel` content (`texuli/sheet`);
  every overlay adds the framed-device container (it opens `contained` inside
  a device screen) and the shared overlay stack (z-order, top-layer dismiss,
  focus return). `Dialog` and `AlertDialog` are Texuli's styled components
  (their only adapter watches the bound `open`, because Texuli's styled
  dialogs skip `onOpenChange` when they close from inside, a tracked Texuli
  gap); `CommandPalette` keeps Texuli's command parts on a dialog root with
  its own search, because Texuli's palette never shows its "Searching…"
  status (gap); `DataTable` stays on Texuli's table
  parts: `DataGrid`'s `mode="table"` gives a row no keyboard path, and its
  search, pager, loading rows and sort shape differ from this API; and the
  styled sheet header, body and footer parts (`overlay/sheet-parts.css`).
  Also thin adapters: `Input` (Texuli's `Input`, numbers for number inputs),
  `TextCounter`, `Spinner`, `StatCard` (`Stat`), `EmptyState`, `StarRating`
  (`Rating`), `NumberStepper` (`NumberField`), `OtpInput` (`PinInput`),
  `ChipGroup` and `WeekdayPicker` (`ToggleGroup`, which submits one entry per
  day), `Composer` (`@texuli/chat`), `StatusChip` and the honesty tags
  (`Badge`), `Avatar` (Texuli's `Avatar`, with `srcset`), `TagEmailInput`
  (`TagsInput`; Space, `,` and `;` also add a tag), `ImageInput`
  (`FileUpload`, with this package's raster-only previews), `PageGrid`
  (`CardGrid` with `maxColumns` and the caller's `gap`), `Calendar`
  (`texuli/date`), `DatePicker`,
  `DateRangePicker` and `TimeInput` (Texuli's date-picker and time-field
  parts with Texuli's field classes, so they fit `FormField`; the styled
  `texuli/date` components give no hook on the bordered control and show no
  invalid state from a Field, both tracked Texuli gaps), `Kanban`
  (`@texuli/data/board`), and `BottomNav`, `MobileHeader` and
  `MobileAppShell` (`texuli/layouts/mobile`). `Toaster` is Texuli's
  `texuli/toast` Toaster (same props); while a shell frame sets the overlay
  portal target it renders `contained` in the framed screen. `UndoToaster`
  draws its toasts with Texuli's `Button`, `IconButton` and `Icon`; its undo
  store stays Protoyard's for the undo pattern Texuli's toast does not carry:
  a countdown bar, F6 to reach Undo from a modal, a "Retry" label after a
  failed undo, at most three pending undos and `replaced`/`evicted` settles.
- **Composed of Texuli parts:** `EmojiPicker` (Button, Input, popover surface,
  form bridge), `PasswordStrengthMeter` (a meter around Texuli's `Progress`),
  `Header` (Texuli's `IconButton`), `BrowserChrome` and `WindowChrome` (device
  chrome; the window's traffic lights and caption buttons stay native on
  purpose).
- **Layouts:** `LayoutHost` wraps `texuli/layouts` ([below](#shared-layout-host)).
- **Protoyard's own:** device frames and shells, `SafeArea`,
  `ScenarioSwitcher`, actors, the overlay stack and the `docs` layout (its
  own navigation contract and heading slugs).

## Components

| Group | Components |
| --- | --- |
| Forms | `Button` (+ `buttonVariants`), `Input`, `Textarea`, `Label`, `FormField`, `Checkbox`, `RadioGroup` / `RadioGroupItem` (`variant="card"`), `Switch`, `Select`, `Combobox`, `UserPicker`, `FileDropzone`, `ImageInput`, `OtpInput`, `StarRating`, `NumberStepper`, `ChipGroup` |
| Form utilities | `TagEmailInput`, `EmojiPicker`, `PasswordStrengthMeter`, `TextCounter` (+ email and password-score helpers) |
| Scheduling | `TimeZoneSelect`, `WeekdayPicker`, `TimeInput`, `DatePicker`, `DateRangePicker`, `Calendar` (+ pure date, time, weekday and zone helpers) |
| Overlays | `Dialog`, `AlertDialog`, `Drawer`, `DetailPanel`, `BottomSheet`, `AdaptiveOverlay`, `DropdownMenu`, `Popover`, `Tooltip`, `overlayStack` / `useOverlayLayer` |
| Disclosure | `Tabs`, `Accordion`, `Carousel` |
| Feedback | `Toaster` + `toast`, `UndoToaster` + `undoToast`, `Progress`, `Spinner`, `Skeleton`, `EmptyState`, `ErrorState`, `LoadingState`, `Notice`, `SimulatedTag`, `ProposalTag`, `StatusChip` |
| Demo | `ScenarioSwitcher` (in-app scenario load + view-as persona; labelled Simulated) |
| Display | `Badge` (+ `badgeVariants`), `Avatar`, `ActorRow`, `Card` / `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter`, `Separator`, `Kbd`, `StatCard` |
| Data | `DataTable`, `FilterBar` (+ `applyFilters`), `Pagination`, `Kanban` |
| Layout | `LayoutHost`, `AppShell`, `Sidebar`, `Header`, `Breadcrumb`, `CardGrid`, `SplitView` |
| Shells | `WindowChrome` |
| Collaboration | `ChatThread`, `MessageList`, `Composer`, `TypingIndicator` |
| Flows | `Stepper`, `Wizard` |
| Search | `CommandPalette` |
| Mobile | `MobileAppShell`, `BottomNav`, `MobileHeader`, `BottomSheet`, `SafeArea` |

## Catalog

Key props per component (all accept `class`; see the source for the full types). A live,
interactive version of this catalog is the `prototypes/ui-kit` prototype
(`pnpm protoyard dev ui-kit`).

| Component | Key props / behavior |
| --- | --- |
| `Button` | `variant` default·secondary·outline·ghost·destructive·link, `size` sm·md·lg·icon (the icon button), `loading` (+`loadingLabel`): spinner over the kept, invisible label so the width never changes, `aria-busy`, disabled. An `onclick` that returns a promise sets `loading` until it settles (`autoLoading={false}` opts out). `href` → `<a>`, `bind:ref` |
| `Input` / `Textarea` | native attributes, `bind:value`, `aria-invalid` styling |
| `OtpInput` | fixed-length one-time code (`length` 2–12, default 6): one real input (one-time-code autofill, paste keeps allowed characters) drawn as cells; `onComplete` exact-once; **simulated UX only** — never SMS or auth |
| `Label` | `for` |
| `FileDropzone` | `accept`, `maxSize`, `maxFiles`, `multiple`, `bind:files` (`DropzoneFile[]` with real `File`s), `bind:rejects`, drag-and-drop + keyboard file input, image previews via `URL.createObjectURL` (revoked on remove/destroy), per-file progress, inline limit errors, `onAdd`/`onRemove`. Renders Texuli's `FileUpload`; `children` shows above the zone and `listClass` is ignored. Never reads file contents as HTML. |
| `ImageInput` | Labeled local image picker (`label`, `hint`, `accept`, `multiple`, `required`, `onFilesSelected`). Raster previews only via object URLs (`image/jpeg|png|gif|webp|avif`); SVG/HTML never become markup. Every object URL is revoked on replace, clear and unmount. Persistence and upload stay in the caller service. |
| `ScenarioSwitcher` | In-app demo control: scenarios grouped by `group`, Load with pending feedback, View as… persona chips on the active world. Always labelled **Simulated**. Props: `scenarios`/`groups`, `activeScenarioId`, `personas`, `activePersonaId`, `onLoadScenario`, `onViewAs`, optional loading ids. Wire via `@protoyard/renderer-svelte` `scenarioSwitcherProps` / `createScenarioSwitcherActions`. |
| `FormField` | `label`, `description`, `error`, `required`, `hideLabel`, `id`; `children({ id, describedBy, invalid, required, props })` |
| `TagEmailInput` | `bind:value` (`string[]`), Enter/Space/comma/semicolon commit, paste split, Backspace removes last; format-only email check (`ignoreValidation` for free tags) |
| `EmojiPicker` | `bind:value` (one emoji), searchable grouped grid, arrow keys + Home/End, Enter picks, Escape closes |
| `PasswordStrengthMeter` | `value` (display-only score 0–5), never stores or sends the password; optional `onScore` / `onFeedback` |
| `TextCounter` | `bind:value`, `maxlength`, countdown while focused once `showAfter` chars remain; `tag="input"\|"textarea"` |
| `Checkbox` | `bind:checked`, `bind:indeterminate`, `label`, `description` |
| `RadioGroup` / `RadioGroupItem` | `items: { value, label, description?, disabled? }[]`, `bind:value`, `variant` `default`·`card` (Bits props pass through) |
| `StarRating` | `bind:value` (0…maxStars), `label`, `maxStars` (2–10, default 5), `disabled`, `onchange`; Texuli's `Rating` radio group |
| `NumberStepper` | `label` (required), `bind:value`, `min`·`max`·`step`, `unit`, `disabled`, `onchange`; Texuli's `NumberField` (steps snap to the `min + n×step` grid) |
| `ChipGroup` | `label`, `items`, `mode` `single`·`multi`, `bind:value` (`string[]`), `size` sm·md, `disabled`, `onchange`; Texuli's `ToggleGroup` (`aria-pressed` chips, one tab stop) |
| `Switch` | `bind:checked`, `label`, `description` |
| `Select` | `items: { value, label, disabled? }[]`, `bind:value`, `bind:open`, `placeholder`, `name` (hidden input). Name comes from your label/`aria-label`; the selected value is exposed via `aria-describedby` |
| `Combobox` | like `Select` + `filter`, `emptyText`; external `value` changes are mirrored into the input (unless a search is open) |
| `UserPicker` | `users: { id, name, subtitle? }[]`, `bind:value`, `variant` popover·inline |
| `Dialog` | `bind:open`, `title`, `description`, `size` sm·md·lg·xl, `trigger`, `footer`, `hideClose` |
| `AlertDialog` | `bind:open`, `title`, `description`, `confirmLabel`, `cancelLabel`, `destructive`, `onConfirm` (async → spinner, closes on resolve, shows the error on reject), `trigger` |
| `DetailPanel` | right sheet (full-height bottom sheet on phones): `bind:open`, `title`, `description`, `footer`, `trigger` |
| `BottomSheet` | `bind:open`, `title`, `description`, `hideTitle`, `footer`, `trigger`, `swipeToDismiss` (default true: drag or flick the sheet down, Texuli's drawer drag; false: it springs back; Esc and backdrop always close) |
| `DropdownMenu` | `items: (action \| { type: 'separator' } \| { type: 'label' })[]` with `label`, `icon`, `onSelect`, `destructive`, `disabled`; `trigger` |
| `Popover` | `bind:open`, `trigger`, `side`, `align`, children |
| `Tooltip` | `content` (string or snippet), `children` is the trigger, `side`, `delayDuration` |
| `Tabs` | `items: { value, label, icon?, badge?, badgeLabel?, disabled? }[]` (the badge, or `badgeLabel`, is part of the tab's name), `bind:value`, `content(item)` snippet, `variant`, `label` |
| `Carousel` | `items: { id, label }[]`, `bind:index`, `label`, `children(item, index)` snippet, `showControls`, `showDots`, `loop`, `swipeThreshold`; region with `aria-roledescription="carousel"`, arrow keys, swipe, reduced motion |
| `Accordion` | `items: { value, title, content?, disabled? }[]`, `type` single·multiple, `bind:value`, `content(item)` snippet, `headingLevel` |
| `Toaster` / `toast` | see *Toasts* below |
| `Progress` | `value` (`null` = indeterminate), `max`, `label` or `ariaLabel`, `showValue`, `tone`, `size` |
| `Spinner` / `Skeleton` | size / `class` for shape |
| `EmptyState` / `ErrorState` / `LoadingState` | `title`, `description`, `icon`, `action` snippet; `ErrorState.onRetry`; `LoadingState.label` |
| `Notice` | `tone` info·success·warning·error·brand, `title`, `text`, `children`, optional `actionLabel` + `onAction` (promise → pending) or `actionHref`; error → role=alert |
| `SimulatedTag` / `ProposalTag` | Honesty labels (default "Simulated" / "Proposal under review"); always a word, never color alone; optional `title` |
| `StatusChip` | Required `label` word, `tone` neutral·success·warning·error·info·brand, optional `icon` |
| `Badge` | `variant` default·secondary·outline·success·warning·destructive·info |
| `Avatar` | `name` (initials + deterministic color), `src?`, `srcset?`, `size` xs·sm·md·lg, `decorative`. The image is lazy, async-decoded and fixed-size; an unsafe `src` (any scheme but https, `//host`) or a load error shows the initials (and sets `data-avatar="initials"`); a loading image is hidden by style, never `[hidden]`. Persona faces: `<Avatar name={p.name} {...avatarImage(p.avatar)} />` (`avatarImage` from `@protoyard/renderer-svelte`) |
| `ActorRow` | `actor: { name, kind: 'person'·'agent', role?, avatarUrl?, avatarSrcset? }`, optional `handledBy` with the same shape, `class`. Displays an accessible identity, a visible Person or Agent · simulated label, and an optional “Handled by …” badge. Resolve fictional avatar ids with `avatarImage()` from `@protoyard/renderer-svelte` before passing the image fields. |
| `Card` + parts | `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` |
| `Separator` / `Kbd` | `orientation` / children |
| `StatCard` | `label`, `value`, `delta`, `trend` up·down·neutral, `positive`, `hint`, `icon` |
| `DataTable` | `columns: { key, header, cell?, accessor?, sortable?, align?, hideBelow? }[]`, `rows`, `getRowId`, `bind:sort`, `bind:search`, `searchKeys`/`searchFn`, `pageSize` (0 = off), `bind:page`, `onRowClick` + `rowLabel`, `loading`, `empty`, `filters`, `toolbar`, `caption` |
| `FilterBar` | `fields: { id, label, kind: enum·date-range·boolean·relation, options?, multiple?, key?, accessor? }[]`, `bind:values` (plain JSON for the hash query), chips + reset; pair with pure `applyFilters(rows, fields, values)` |
| `Pagination` | `bind:page`, `pageCount` or `total` + `pageSize` |
| `Kanban` | `columns: { id, title, description? }[]` (the description sits in the column header and describes its list), `items`, `getColumn`, `getItemId`, `getItemLabel`, `onMove(item, columnId)` (async ok; a throw puts the card back), `canMove`, `card` snippet, `columnFooter`, `headingLevel`; Texuli's `Board`: pointer drag, a keyboard drag handle (Space, arrows, Space) and a "Move to…" menu per card. Moves go between columns only; cards keep the order of `items` |
| `AppShell` | `sidebar`, `header`, `bottomNav`, children, `bind:sidebarOpen` (mobile drawer, auto-closes at `lg`), `sidebarClass`, `mainClass`, `mainId`, `mainElement` (`div` when nested in another `<main>`), skip link, plus Texuli's `commandBar` and `notifications` slots. It is Texuli's shell; it sizes from `--tx-app-height`, which `styles.css` maps to the frame's `--py-app-height`, so framed shells match the device screen |
| `LayoutHost` | `layout: LayoutId`, routed screen snippet, `nav` (NavModel), `path`, `options`, `storageKey`, `aside` snippet, `class`; measures its own container, applies the core layout fallback below its breakpoint, and lazy-loads the registered module with a skeleton while loading. Layout modules call `mountScreen(target)` to place the stable routed-screen outlet without remounting its local state. Unregistered layouts leave the screen in the host's default content frame. |
| `MobileAppShell` | Fixed `h-app` flex column with optional `header`, one focusable scrolling `<main>`, optional `stickyFooter` (rendered as is, with no strip of its own), and an in-flow `bottomNav` snippet. Compose the nav with `<BottomNav fixed={false}>` so it remains visible below the scroll region in any frame. Resets main scroll on hash navigation. |
| `Sidebar` | `items` or `sections: { label?, items: { label, href, icon?, badge?, active? }[] }[]`, `bind:collapsed`, `header`/`footer({ collapsed })` |
| `Header` | `title`, `titleAs` (default `h1`; use `p` when the page has its own `h1`), `description`, `leading`, `actions`, `onMenuClick` (defaults to the AppShell drawer), `sticky` |
| `Breadcrumb` | `items: { label, href? }[]` |
| `CardGrid` | `minItemWidth`, `maxColumns`, `gap`, `as` |
| `ChatThread` | `messages`, `currentUserId`, `typing: string[]`, `bind:draft`, `onSend`, `sending` |
| `MessageList` / `groupMessages` | messages `{ id, author: { id, name }, body, at, status? }`, `role="log"`, auto-scroll |
| `Composer` | `bind:value`, `onSubmit` (return `false`/reject to keep the draft), Enter sends, Shift+Enter newline |
| `TypingIndicator` | `names: string[]`, `showLabel` (sr-only text otherwise; reduced-motion safe) |
| `Stepper` / `Wizard` | `steps: { id, label, description? }[]`, `current`; Stepper `completed`, `orientation`, `onStepClick`; Wizard `bind:current`, `content(step)` snippet, `validate` (false or message), `canAdvance`, `onFinish`, `onStepChange` |
| `CommandPalette` | `search(query)` async source, `recentItems`, `onSelect`; opens with ⌘K / Ctrl+K, groups results, and supports arrow-key selection. Dynamically import and mount it after the first shortcut press to keep it out of the initial bundle. |
| `BottomNav` | `items: { label, href, icon, badge?, active? }[]`, `fixed`, safe-area padding, 44px targets; marked `data-py-bottom-nav` so DevTools lifts its launcher above it |
| `MobileHeader` | `title`, `titleAs`, `subtitle`, `backHref`/`onBack` + `backLabel`, `actions`, `sticky` |
| `SafeArea` | `edges` (or `top`/`right`/`bottom`/`left`) padded with `env(safe-area-inset-*)`, `as` |
| `WindowChrome` | Desktop-app title bar: `variant` mac-like·windows-like, `title`, `bind:state` open·minimized·closed, `bind:maximized`, optional `toolbar` snippet, children. Minimize → restore pill; maximize toggles fill (`aria-pressed`); close → “Window closed” + Reopen. Double-click the title bar toggles maximize. Purely visual (no `-webkit-app-region`). Generic chrome — no OS logos. |

## Conventions

- `variant`, `size` and `class` (joined with `cn`; see *Class names* for overrides). Most components spread
  the remaining attributes onto their root element.
- Two-way state uses `bind:`: `bind:value`, `bind:open`, `bind:checked`, `bind:page`,
  `bind:collapsed`, `bind:sidebarOpen`.
- **Triggers** (`Dialog`, `AlertDialog`, `DetailPanel`, `BottomSheet`, `Popover`, `DropdownMenu`,
  `Tooltip`) take a snippet that receives `{ props }`. Spread those props onto your own focusable
  element: `{#snippet trigger({ props })}<Button {...props}>Open</Button>{/snippet}`.
- **FormField** passes `{ id, describedBy, invalid, required, props }` to `children`. Spread
  `props` (`id`, `aria-describedby`, `aria-invalid`, `aria-required`) onto any control.
- Navigation items (`Sidebar`, `BottomNav`, `Breadcrumb`) render plain `<a href>`. Use hash routes
  such as `#/projects`, because the package does not depend on a router.
- `Tooltip` trigger props include its own `onclick`; if your trigger needs a click handler too,
  call both (`onclick={(e) => { props.onclick?.(e); mine(e); }}`) — a plain `onclick=` after the
  spread replaces it.
- Async callbacks (`AlertDialog.onConfirm`, `ErrorState.onRetry`, `Wizard.validate` / `onFinish`,
  `Composer.onSubmit`, `Kanban.onMove`) show a loading state until they settle.
- `Button` does the same for its own `onclick`. Return the promise
  (`onclick={() => runService(() => save())}`, or `onclick={save}` for an async function),
  and the button spins, sets `aria-busy` and ignores further clicks until it settles. Writing
  `onclick={() => void save()}` throws that feedback away. This applies to icon buttons
  (`size="icon"`) and the `AlertDialog` confirm action too.

## Navigation model

Layouts render navigation from data, so one prototype works in every layout.
The model, its types and its helpers (`resolveNav`, `navPath`,
`isNavPathActive`, `navBadge`) are Texuli's, re-exported from the package
root; `navFromSidebar` is Protoyard's migration helper
(`src/layouts/nav-model.ts`):

```ts
import { navFromSidebar, resolveNav, type NavModel } from '@protoyard/ui';

// Migrate today's <Sidebar items={nav}> list in one line:
const model: NavModel = navFromSidebar(nav, { brand: { label: 'Pipeline CRM', icon: 'briefcase' } });

// Or write it directly: sections, items (id, label, href, icon, badge, exact, children),
// primary actions and the signed-in user.
const sections = resolveNav(model, location.hash); // exactly one `active` item, parents `inTrail`
```

- **Active state:** an item is current for its path and its descendants
  (`#/` and `exact` items only exactly), and the deepest match wins.
- **Icons** are names from the `NavIconName` type or icon components; the
  layouts render them.
- **Badges** can be a getter (`badge: () => unread.count`), so a live count
  updates wherever a layout reads it.
- **Actions** either navigate (`href`) or run `onSelect`; a returned promise
  drives the layout's pending state.

## Shared layout host

For the layout catalog, manifest contract, responsive behavior and tests, see
[the Layouts guide](../../docs/LAYOUTS.md) and
[TEXULI.md](../../docs/TEXULI.md#layouts-come-from-texulilayouts).

Wrap the routed screen in `LayoutHost` when a prototype opts into a shared
layout:

```svelte
<LayoutHost layout="sidebar" nav={navFromSidebar(items, { brand: { label: 'Pipeline CRM' } })} storageKey={manifest.storage.namespace}>
  {#snippet children()}<Router {routes} />{/snippet}
</LayoutHost>
```

- **The host** wraps Texuli's `LayoutHost`. It resolves the layout with the
  core `LAYOUTS` catalog (`layoutForWidth`) from the measured width, so a
  shell's inner width drives the choice. It keeps the `data-py-layout-host`
  and `data-layout` hooks, and sets `data-py-layout="<id>"` once that layout
  has loaded. One routed screen outlet is kept across layout changes.
- **The registry** (`registerProtoyardLayouts`, `src/layouts/register.ts`)
  registers Texuli's layouts, each its own lazy import:
  - app: `sidebar`, `rail`, `top-nav`, `dual-sidebar`, `master-detail`;
  - mobile: `mobile-tabs`, `mobile-drawer`;
  - auth and settings: `wizard`, `auth-split`;
  - `dashboard-grid` and `marketing`.

  `docs` stays Protoyard's (`src/layouts/DocsLayout.svelte`, also exported
  as `@protoyard/ui/layouts/docs`): section navigation from a `navigation`
  snippet, the content, and a generated h2/h3 table of contents.
  `@protoyard/ui/layouts/marketing` is Texuli's `MarketingLayout`.
- **Device frames** stay Protoyard's. The host bridges a frame to Texuli's
  tokens: `--tx-app-height` follows `--py-app-height`, and `--tx-safe-*`
  follow the safe areas.
- **Layout modules stay out of the barrel,** so a prototype loads a layout
  only when its host selects it. A layout with no registered loader renders
  the screen in the host's default content frame.

## Form utilities

Tag, emoji, password-strength and character-count controls
(`src/components/form/utilities/`). Theme tokens only, with no product branding.

| Component | Behavior |
| --- | --- |
| `TagEmailInput` | Invite-style tags. Commit with Enter, Space, comma or semicolon; paste splits on the same separators; Backspace on an empty draft removes the last tag. Email checks are format-only (`local@domain`) via `isEmailAddress` — not deliverability. Use `ignoreValidation` for free-form tags. |
| `EmojiPicker` | One emoji from a built-in grouped catalog (`EMOJI_GROUPS`). Search filters by name; the grid is keyboard-roving (arrows, Home/End, Enter). |
| `PasswordStrengthMeter` | A `role="meter"` (Texuli `Progress` bar inside) under a password field. Rates the string in memory with `passwordScore` (length, case, digit, symbol, tiny fictional common list). **Simulation only:** it never stores, hashes or transmits the value. Pair with `Input type="password"`. |
| `TextCounter` | Input or textarea with `maxlength` and a remaining-character countdown shown while focused once `showAfter` (default 20) characters remain. |

- **Honesty.** Password strength is UX feedback for prototypes, not security. Email validation is shape-only.
- **FormField.** Pass `id`, `aria-describedby` and `aria-invalid` from `control.props` onto these controls the same way as other inputs.

## Scheduling inputs

Typed, keyboard-first controls for schedules (`src/components/form/scheduling/`). Every
value is plain JSON with no `Date` objects, so it validates with zod and persists as is:

| Component | Value | Behavior |
| --- | --- | --- |
| `TimeZoneSelect` | IANA zone (`'America/Bogota'`) | A searchable `Combobox` labelled `(GMT-05:00) America/Bogota`, sorted west to east. A search matches any part of the label or the zone name, and `_` matches a space. Offsets are those in force at `referenceDate`, so pass the scenario clock. `zones` narrows the list. |
| `WeekdayPicker` | `IsoWeekday[]` (1 = Monday … 7 = Sunday, sorted) | Toggle buttons (`aria-pressed`) in one labelled group with a single tab stop. Arrows and Home/End move between days; Space or Enter toggles one. `weekStartsOn`, `locale`, `labelStyle`, and `name` (one form entry per day). For a single day, use `Select` with `weekdayOptions()`. |
| `TimeInput` | `'HH:mm'` (24-hour) or `null` | Texuli's time field: hour and minute segments, plus AM/PM in `format={12}`. `intervalMinutes` (the minute step) must divide 60, otherwise it falls back to 15. The value is emitted only once both hour and minute are set. |
| `DatePicker` | `'YYYY-MM-DD'` or `null` | Texuli's date field (month, day and year segments) plus a calendar popover. A typed date commits when the field is left or on Enter; a calendar pick commits at once. An impossible date, a date outside `min`/`max`, or one that `isDateDisabled` rejects shows an inline message linked through `aria-describedby`, calls `onInvalid(issue, text)`, and leaves the value unchanged. Clearing the field sets `null`. |
| `DateRangePicker` | `{ start, end }` of `'YYYY-MM-DD' \| null` | Texuli's range fields plus a calendar that picks the range in two clicks. The value changes only to an empty range or to a complete, valid one. `maxDays` (a longer calendar range is refused and announced), `min`, `max` and `required` are enforced. |
| `Calendar` | — | Texuli's calendar: an ARIA grid with a single tab stop. Arrows move a day or a week, Home/End go to the start or end of the week, PageUp/PageDown change the month (with Shift, the year), and Enter or Space picks. Unavailable dates are disabled; today (the simulated `today`) is marked `aria-current="date"`. `range`, `maxDays` and `onInvalid` pick a range. |

- **Deterministic dates.** Pass `today` (`isoDateFromInstant(runtime.clock.now(), zone)`) and
  `referenceDate` from the scenario clock. All arithmetic (`addDays`, `addMonths`, `monthGrid`, …)
  runs on UTC midnights, so the host time zone and DST never move a date. The calendar falls
  back to the real clock only when it is given no date at all.
- **FormField.** Spread `control.props` onto any of them. The label names the field's segment
  group, which carries `aria-invalid` and `aria-describedby`; `aria-required` is treated like
  `required`.
- **Helpers:** `parseIsoDate`, `checkDateText`, `validateDateRange`, `parseTimeOfDay`,
  `timeOfDayLabel`, `minuteSteps`, `normalizeWeekdays`, `describeWeekdays`, `timeZoneOptions`,
  `timeZoneOffsetMinutes` and `isValidTimeZone`. They are pure functions, so a service can reuse
  them (for example in a zod `refine`) to check the same values before it writes.
- **Limits.** Typed dates accept only `YYYY-MM-DD`; there is no locale-specific parsing. Zone names
  come from the browser's `Intl.supportedValuesOf('timeZone')`, with a fixed fallback list of
  23 zones. Pickers do not convert between zones: a `TimeInput` value is wall-clock time that
  you pair with a `TimeZoneSelect` value.

## Toasts

```ts
import { toast } from '@protoyard/ui';

const id = toast.info('Saving…', { duration: 0 });
toast.success('Saved', { id, description: 'All changes stored.' }); // replaces the same toast
toast.error('Upload failed', { action: { label: 'Retry', onClick: retry } });
toast.dismiss(id); // or toast.dismiss() for all
```

The toast API and `<Toaster />` are Texuli's (`texuli/toast`), re-exported
here; `toast.promise(promise, { loading, success, error })` is available too.
Toasts auto-dismiss (configurable with `duration`; `0` keeps them), the
countdown pauses while a toast is hovered or focused, and Texuli's Toaster
announces each message. Render one `<Toaster />` near the app root; `position`
picks the edge (default `bottom-end`, centered on phones). To keep toasts above
a bottom nav or a sticky composer, pass `offset` (px or any CSS length,
`<Toaster offset={64} />`) or set `--tx-toast-offset` on the page. Inside a
prototype, the toasts also stay inside the visible right edge
(`--py-fixed-right-edge`, kept current by the renderer; mapped in
`styles.css`).

## Drawers and the overlay stack

```svelte
<script lang="ts">
  import { Button, Drawer } from '@protoyard/ui';
  let open = $state(false);
</script>

<Button onclick={() => (open = true)}>Filters</Button>
<Drawer bind:open title="Filters" placement="right" size="22rem">
  …
  {#snippet footer()}<Button onclick={() => (open = false)}>Apply</Button>{/snippet}
</Drawer>
```

`Drawer` slides in from `right` (default), `left`, `top` or `bottom`. `size` is the width for a
side drawer and the height for a top or bottom one. It accepts a plain CSS length (`22rem`, `40%`,
`320px`, `auto`) or a number of pixels. Anything else falls back to the default (`24rem` for side
drawers, `auto` up to 85% for top and bottom ones), so a size can never inject other styles. It
is **non-modal by default**: the page behind stays usable, outside clicks do not close it, and it
only owns Escape. With `modal`, it dims the page, traps focus and locks scroll, and outside clicks
close it (`closeOnOutsideClick` overrides either default). It renders Texuli's `sheet` primitive with the `tx-sheet` surface from `texuli/sheet`.
Like the rest of the dialog family, it opens in the browser's top layer on the page; inside a
device frame it opens in Texuli's contained mode, held by the device screen, which also bounds its
inert page, focus trap and scroll lock (`useOverlayPortalTarget()` gives each overlay its `mode`
and `container`). The shared Vitest setup resets overlay target and toast state, plus local and
session storage, after each test.

Every `Drawer` registers with the shared `overlayStack`:

- Nested drawers paint in open order, each above the one before.
- Escape closes only the top drawer.
- On close, focus returns to the element that opened the drawer. Focus only moves when it was lost
  with the drawer or was still inside it, so it never steals focus from the page behind a non-modal
  drawer.
- A menu or picker inside an overlay can call `overlayStack.registerDismissibleLayer(el, close)`.
  Escape then closes that layer first, never the drawer and its draft.

A custom overlay joins the same stack with `useOverlayLayer(() => open, { modal: () => modal })`.
It gets its `zIndex` and `restoreFocus(container)`. `Dialog`, `AlertDialog`, `BottomSheet` and
`DetailPanel` also register as modal layers, so a dialog opened inside a drawer paints above it
and Escape closes only the top layer. `UndoToaster` stays above the stack: on the page it re-enters
the top layer after each overlay that opens there, and in a frame its z-index stays above every
overlay. A modal never makes it inert, and it remains keyboard-reachable (F6) outside a modal's
focus trap.

### AdaptiveOverlay

`AdaptiveOverlay` picks a presentation from host/container width (default breakpoint 768 CSS px):
bottom sheet when narrow, centered `Dialog` or `DetailPanel` side panel when wide (`kind`). Pass
`force="sheet" | "dialog" | "side-panel"` to lock a presentation (for example with an in-app
phone/desktop toggle). See [docs/SHELLS.md](../../docs/SHELLS.md#adaptive-overlay-sheet--dialog--side-panel).

## Undo toasts

```ts
import { undoToast } from '@protoyard/ui';

await services.tasks.archive(ids); // the action happens first
undoToast.show({
  message: `Archived ${ids.length} tasks`,
  onUndo: () => services.tasks.restore(ids), // the explicit undo; may return a promise
  onSettle: (reason) => {}, // optional: closed without an undo (expired, dismissed, replaced, evicted)
});
```

Render one `<UndoToaster />` near the app root, next to `<Toaster />`. It sits bottom-left
(bottom-center on phones), above every open drawer, and inside the device frame when a shell sets
one. The undo window is 10 s by default (`duration`, clamped to 1–60 s), shown by a countdown bar
that is hidden when motion is reduced. Hovering or focusing the stack pauses it. While a returned
promise is pending, the Undo button shows the `Button` loading state and the countdown is frozen.
If the undo rejects, the toast stays open with the error text and offers **Retry undo**. Escape
or the close control dismisses a toast. At most three are pending at a time, and the oldest settles
as `evicted`. `onSettle` runs exactly once, and only when the toast closes without a successful
undo. A failed undo can be retried, so `onUndo` must be safe to call again.

## Tokens and accessibility

Components only use the theme tokens (`bg-surface`, `text-muted-foreground`, `bg-primary`,
`border-border`, `ring-ring`, `rounded-lg`, `shadow-soft` / `shadow-float`, `pt-safe`,
`min-h-touch`…), so every theme and dark mode work without overrides. Semantic colors are used as
fills with their foreground pair, which keeps small text at WCAG AA. Interactive elements have
visible focus rings and keyboard support (from Texuli or native elements). They also get 44px
touch targets below the `sm` breakpoint. Motion respects `prefers-reduced-motion` and the
prototype's own reduced-motion toggle.

## Development

```sh
pnpm --filter @protoyard/ui typecheck
pnpm vitest run packages/ui        # root config inlines @lucide/svelte
```

## Package output

The repository keeps source exports for workspace development. `pnpm build:packages --filter svelte` creates the compiled ESM, declarations and Svelte components under `dist/` that the packed manifest exposes.
