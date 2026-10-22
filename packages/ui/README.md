# @protoyard/ui

The component kit shared by every Protoyard prototype, template and the DevTools panel.
Svelte 5 (runes + snippets), [Bits UI](https://bits-ui.com) primitives, Tailwind CSS 4 utilities on
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

`cn(...inputs)` (re-exported from `@protoyard/ui`) is `clsx` plus an extended
`tailwind-merge`. It knows Protoyard utilities from `@protoyard/themes/base.css`
so a consumer class reliably overrides a component default:

| Group | Examples that merge correctly |
| --- | --- |
| Shadows | `shadow-soft`, `shadow-float`, `shadow-none`, `shadow-md` |
| Heights | `min-h-touch`, `min-h-app`, `h-app`, `max-h-app` |
| Surfaces | `bg-surface`, `bg-elevated`, `bg-muted`, … |
| Text | `text-muted-foreground`, `text-sm` / `text-lg`, … |
| Safe area | `pt-safe`, `px-safe`, … |

```ts
import { cn } from '@protoyard/ui';
cn('shadow-soft', 'shadow-none'); // → "shadow-none"
```

## Components

| Group | Components |
| --- | --- |
| Forms | `Button` (+ `buttonVariants`), `Input`, `Textarea`, `Label`, `FormField`, `Checkbox`, `RadioGroup` / `RadioGroupItem`, `Switch`, `Select`, `Combobox`, `UserPicker`, `FileDropzone` |
| Form utilities | `TagEmailInput`, `EmojiPicker`, `PasswordStrengthMeter`, `TextCounter` (+ email and password-score helpers) |
| Scheduling | `TimeZoneSelect`, `WeekdayPicker`, `TimeInput`, `DatePicker`, `DateRangePicker`, `Calendar` (+ pure date, time, weekday and zone helpers) |
| Forms | `Button` (+ `buttonVariants`), `Input`, `Textarea`, `Label`, `FormField`, `Checkbox`, `RadioGroup` / `RadioGroupItem`, `Switch`, `Select`, `Combobox`, `UserPicker`, `FileDropzone`, `ImageInput` |
| Overlays | `Dialog`, `AlertDialog`, `DetailPanel`, `BottomSheet`, `DropdownMenu`, `Popover`, `Tooltip` |
| Disclosure | `Tabs`, `Accordion`, `Carousel` |
| Feedback | `Toaster` + `toast`, `Progress`, `Spinner`, `Skeleton`, `EmptyState`, `ErrorState`, `LoadingState` |
| Display | `Badge` (+ `badgeVariants`), `Avatar`, `ActorRow`, `Card` / `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter`, `Separator`, `Kbd`, `StatCard` |
| Overlays | `Dialog`, `AlertDialog`, `Drawer`, `DetailPanel`, `BottomSheet`, `AdaptiveOverlay`, `DropdownMenu`, `Popover`, `Tooltip`, `overlayStack` / `useOverlayLayer` |
| Disclosure | `Tabs`, `Accordion` |
| Feedback | `Toaster` + `toast`, `UndoToaster` + `undoToast`, `Progress`, `Spinner`, `Skeleton`, `EmptyState`, `ErrorState`, `LoadingState` |
| Display | `Badge` (+ `badgeVariants`), `Avatar`, `Card` / `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter`, `Separator`, `Kbd`, `StatCard` |
| Data | `DataTable`, `FilterBar` (+ `applyFilters`), `Pagination`, `Kanban` |
| Layout | `LayoutHost`, `AppShell`, `Sidebar`, `Header`, `Breadcrumb`, `CardGrid` |
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
| `Label` | `for` |
| `FileDropzone` | `accept`, `maxSize`, `maxFiles`, `multiple`, `bind:files` (`DropzoneFile[]` with real `File`s), `bind:rejects`, drag-and-drop + keyboard file input, image previews via `URL.createObjectURL` (revoked on remove/destroy), per-file `Progress`, inline limit errors. Never reads file contents as HTML. |
| `ImageInput` | Labeled local image picker (`label`, `hint`, `accept`, `multiple`, `required`, `onFilesSelected`). Raster previews only via object URLs (`image/jpeg|png|gif|webp|avif`); SVG/HTML never become markup. Every object URL is revoked on replace, clear and unmount. Persistence and upload stay in the caller service. |
| `FormField` | `label`, `description`, `error`, `required`, `hideLabel`, `id`; `children({ id, describedBy, invalid, required, props })` |
| `TagEmailInput` | `bind:value` (`string[]`), Enter/Space/comma/semicolon commit, paste split, Backspace removes last; format-only email check (`ignoreValidation` for free tags) |
| `EmojiPicker` | `bind:value` (one emoji), searchable grouped grid, arrow keys + Home/End, Enter picks, Escape closes |
| `PasswordStrengthMeter` | `value` (display-only score 0–5), never stores or sends the password; optional `onScore` / `onFeedback` |
| `TextCounter` | `bind:value`, `maxlength`, countdown while focused once `showAfter` chars remain; `tag="input"\|"textarea"` |
| `Checkbox` | `bind:checked`, `bind:indeterminate`, `label`, `description` |
| `RadioGroup` / `RadioGroupItem` | `items: { value, label, description?, disabled? }[]`, `bind:value` (Bits props pass through) |
| `Switch` | `bind:checked`, `label`, `description` |
| `Select` | `items: { value, label, disabled? }[]`, `bind:value`, `bind:open`, `placeholder`, `name` (hidden input). Name comes from your label/`aria-label`; the selected value is exposed via `aria-describedby` |
| `Combobox` | like `Select` + `filter`, `emptyText`; external `value` changes are mirrored into the input (unless a search is open) |
| `UserPicker` | `users: { id, name, subtitle? }[]`, `bind:value`, `variant` popover·inline |
| `Dialog` | `bind:open`, `title`, `description`, `size` sm·md·lg·xl, `trigger`, `footer`, `hideClose` |
| `AlertDialog` | `bind:open`, `title`, `description`, `confirmLabel`, `cancelLabel`, `destructive`, `onConfirm` (async → spinner, closes on resolve, shows the error on reject), `trigger` |
| `DetailPanel` | right sheet (full-height bottom sheet on phones): `bind:open`, `title`, `description`, `footer`, `trigger` |
| `BottomSheet` | `bind:open`, `title`, `description`, `hideTitle`, `footer`, `trigger`, `swipeToDismiss` (default true: drag/flick the handle down; Esc and backdrop always close; reduced-motion aware) |
| `DropdownMenu` | `items: (action \| { type: 'separator' } \| { type: 'label' })[]` with `label`, `icon`, `onSelect`, `destructive`, `disabled`; `trigger` |
| `Popover` | `bind:open`, `trigger`, `side`, `align`, children |
| `Tooltip` | `content` (string or snippet), `children` is the trigger, `side`, `delayDuration` |
| `Tabs` | `items: { value, label, icon?, badge?, disabled? }[]`, `bind:value`, `content(item)` snippet, `variant`, `label` |
| `Carousel` | `items: { id, label }[]`, `bind:index`, `label`, `children(item, index)` snippet, `showControls`, `showDots`, `loop`, `swipeThreshold`; region with `aria-roledescription="carousel"`, arrow keys, swipe, reduced motion |
| `Accordion` | `items: { value, title, content?, disabled? }[]`, `type` single·multiple, `bind:value`, `content(item)` snippet, `headingLevel` |
| `Toaster` / `toast` | see *Toasts* below |
| `Progress` | `value` (`null` = indeterminate), `max`, `label` or `ariaLabel`, `showValue`, `tone`, `size` |
| `Spinner` / `Skeleton` | size / `class` for shape |
| `EmptyState` / `ErrorState` / `LoadingState` | `title`, `description`, `icon`, `action` snippet; `ErrorState.onRetry`; `LoadingState.label` |
| `Badge` | `variant` default·secondary·outline·success·warning·destructive·info |
| `Avatar` | `name` (initials + deterministic color), `src?`, `srcset?`, `size` xs·sm·md·lg, `decorative`. The image is lazy, async-decoded and fixed-size; an unsafe `src` (any scheme but https, `//host`) or a load error shows the initials. Persona faces: `<Avatar name={p.name} {...avatarImage(p.avatar)} />` (`avatarImage` from `@protoyard/renderer-svelte`) |
| `ActorRow` | `actor: { name, kind: 'person'·'agent', role?, avatarUrl?, avatarSrcset? }`, optional `handledBy` with the same shape, `class`. Displays an accessible identity, a visible Person or Agent · simulated label, and an optional “Handled by …” badge. Resolve fictional avatar ids with `avatarImage()` from `@protoyard/renderer-svelte` before passing the image fields. |
| `Card` + parts | `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` |
| `Separator` / `Kbd` | `orientation` / children |
| `StatCard` | `label`, `value`, `delta`, `trend` up·down·neutral, `positive`, `hint`, `icon` |
| `DataTable` | `columns: { key, header, cell?, accessor?, sortable?, align?, hideBelow? }[]`, `rows`, `getRowId`, `bind:sort`, `bind:search`, `searchKeys`/`searchFn`, `pageSize` (0 = off), `bind:page`, `onRowClick` + `rowLabel`, `loading`, `empty`, `filters`, `toolbar`, `caption` |
| `FilterBar` | `fields: { id, label, kind: enum·date-range·boolean·relation, options?, multiple?, key?, accessor? }[]`, `bind:values` (plain JSON for the hash query), chips + reset; pair with pure `applyFilters(rows, fields, values)` |
| `Pagination` | `bind:page`, `pageCount` or `total` + `pageSize` |
| `Kanban` | `columns: { id, title }[]`, `items`, `getColumn`, `getItemId`, `getItemLabel`, `onMove(item, columnId)` (async ok), `canMove`, `card` snippet; HTML5 drag and drop + a keyboard "Move to…" menu per card |
| `AppShell` | `sidebar`, `header`, `bottomNav`, children, `bind:sidebarOpen` (mobile drawer, auto-closes at `lg`), `sidebarClass`, `mainClass`, `mainId`, `mainElement` (`div` when nested in another `<main>`), skip link; frame uses `min-h-app` / sidebar column `h-app` (`--py-app-height`) so framed shells match the device screen |
| `LayoutHost` | `layout: LayoutId`, routed screen snippet, `nav` (NavModel), `path`, `options`, `storageKey`, `aside` snippet, `class`; measures its own container, applies the core layout fallback below its breakpoint, and lazy-loads the registered module with a skeleton while loading. Layout modules call `mountScreen(target)` to place the stable routed-screen outlet without remounting its local state. Unregistered layouts leave the screen in the host's default content frame. |
| `MobileAppShell` | Fixed `h-app` flex column with optional `header`, one focusable scrolling `<main>`, optional `stickyFooter`, and an in-flow `bottomNav` snippet. Compose the nav with `<BottomNav fixed={false}>` so it remains visible below the scroll region in any frame. Resets main scroll on hash navigation. |
| `Sidebar` | `items` or `sections: { label?, items: { label, href, icon?, badge?, active? }[] }[]`, `bind:collapsed`, `header`/`footer({ collapsed })` |
| `Header` | `title`, `titleAs` (default `h1`; use `p` when the page has its own `h1`), `description`, `leading`, `actions`, `onMenuClick` (defaults to the AppShell drawer), `sticky` |
| `Breadcrumb` | `items: { label, href? }[]` |
| `CardGrid` | `minItemWidth`, `gap`, `as` |
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

- `variant`, `size` and `class` (merged with `cn`, so your utilities win). Most components spread
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

Layouts render navigation from data, so one prototype works in every layout
(`src/layouts/nav-model.ts`, exported from the package root):

```ts
import { navFromSidebar, resolveNav, type NavModel } from '@protoyard/ui';

// Migrate today's <Sidebar items={nav}> list in one line:
const model: NavModel = navFromSidebar(nav, { brand: { label: 'Pipeline CRM', icon: 'briefcase' } });

// Or write it directly: sections, items (id, label, href, icon, badge, exact, children),
// primary actions and the signed-in user.
const sections = resolveNav(model, location.hash); // exactly one `active` item, parents `inTrail`
```

- **Active state** follows the renderer's `router.isActive`: an item is
  current for its path and its descendants (`#/` and `exact` items only
  exactly), and the deepest match wins.
- **Icons** are Lucide names (`'kanban'`, `'users'`; the `NavIconName` type
  lists them) or any Lucide component. `src/layouts/NavIcon.svelte` maps names
  through a static table. It is not in the package barrel, so only the lazy
  layouts that render it pay for the icons (about 7 KB gzip for the 53 names).
- **Badges** can be a getter (`badge: () => unread.count`), so a live count
  updates wherever a layout reads it.
- **Actions** either navigate (`href`) or run `onSelect`; a returned promise
  drives the layout's pending state.

## Shared layout host

For the complete layout catalog, manifest contract, responsive behavior and
contributor checklist, see [the Layouts guide](../../docs/LAYOUTS.md).

Wrap the routed screen in `LayoutHost` when a prototype opts into a shared
layout. The host uses the measured container width and the core `LAYOUTS`
catalog's fallback rules, so a shell's inner screen width drives the choice.
Each registered layout is loaded through its own relative dynamic import in
`src/layouts/registry.ts`. A layout provides a target with `mountScreen(target)`;
the host moves one stable screen outlet between targets, preserving the route's
component state while the layout chrome changes. While the selected module is
loading, the current screen stays mounted under a chrome skeleton. The registry
currently includes `sidebar`, `rail`, `top-nav`, `dual-sidebar`,
`mobile-tabs`, `mobile-drawer`, `master-detail`, `dashboard-grid`, `docs`,
`marketing`, `wizard` and `auth-split`. Layout modules stay out of the
`@protoyard/ui` barrel, so a
prototype loads a layout only when its host selects it. If a layout has no
registered loader, the screen renders in the host's default content frame.

### Content layouts

Three content layouts are available for product screens that need more than an
application sidebar:

| Component | Content | Responsive behavior |
| --- | --- | --- |
| `MasterDetailLayout` | `list` and `detail` snippets; bind `detailActive` to the selected route | Two panes with a keyboard- and pointer-resizable list on wide containers; one pane at a time on narrow containers. The list stays mounted while details change, and its width is stored in `localStorage` (override the key with `storageKey`). |
| `DashboardGridLayout` | Child widgets; set `data-span="1"` through `data-span="4"` on each direct widget element | Uses one, two, three, then four columns as its container grows. Spans clamp to the current column count. It is a static grid with no drag-and-drop. |
| `DocsLayout` | `navigation` snippet and documentation child content | Shows section navigation, the content, and a generated h2/h3 table of contents. The TOC follows visible headings and refreshes when headings are added or removed. |

These layouts also accept the host's `mountScreen` outlet when selected through
`LayoutHost`; their existing snippet props remain available for standalone use.

`MasterDetailLayout` exposes the splitter as a vertical separator: Left/Right
arrows resize it by 16 pixels, while Home and End select the minimum and maximum
list widths. Bind `detailActive` to route selection so narrow screens show the
matching detail; the built-in Back to list control clears it. The default width
key is scoped to the current app pathname, so callers can pass `storageKey` to
share a preference between routes.

`DocsLayout` assigns stable fragment ids to headings that do not already have
one. It uses `MutationObserver` to rebuild the TOC and `IntersectionObserver`
to mark the current section; when intersection observation is unavailable, the
TOC remains usable as a set of fragment links.
## Desktop layouts

Four desktop navigation layouts are registered (`sidebar`, `rail`,
`top-nav`, `dual-sidebar`), plus the two mobile ones below. Each one is its
own lazy module, measured at 1.3 to 2.8 KB gzip, and they
share one chunk of about 7.5 KB gzip (the drawer, the chrome and the
`NavIcon` table). They all render the `nav` the host passes, follow
`location.hash` unless the host passes `path`, put the screen in a `<main>`
that the **Skip to content** link focuses, and use theme tokens only.
Breakpoints are container queries on the layout itself, so they follow a
shell's inner width. Below its breakpoint a layout shows a menu button that
opens a drawer. Escape, the close button, following a link or any in-app
navigation closes the drawer, and it also closes if the layout grows wide.

```svelte
<LayoutHost layout="sidebar" nav={navFromSidebar(items, { brand: { label: 'Pipeline CRM' } })} storageKey={manifest.storage.namespace}>
  {#snippet children()}<Router {routes} />{/snippet}
</LayoutHost>
```

| Layout | Breakpoint | What it renders |
| `sidebar` | 48rem | `<Sidebar>` column: brand, sections, actions and user in the footer |
| `rail` | 40rem | the same `<Sidebar>` collapsed to icons with tooltips. Its toggle expands it to labels, and the choice is saved per prototype in localStorage (`protoyard:layout:<storageKey or page path>:rail-expanded`, best effort) |
| `top-nav` | 48rem | brand, primary links (the first `options.visibleItems`, default 5) and a **More** menu for the rest, actions and user, then the current item's `children` as secondary tabs |
| `dual-sidebar` | 64rem | a switcher column with one button per nav section (arrow keys, Home and End move between them; it follows the current page until another section is picked), the section's pages with one level of children, and the `aside` snippet as a right context panel |

### Mobile layouts

`mobile-tabs` (2.1 KB gzip of its own) and `mobile-drawer` (1.2 KB, both
plus the shared layout chunk) are where the host falls back for every desktop layout
below its breakpoint. They also work as a prototype's own layout
(`platform: mobile`).

| Layout | What it renders |
| --- | --- |
| `mobile-tabs` | `MobileAppShell` with a `MobileHeader` (the current page's name and compact actions) and a `BottomNav` of the top-level items. Five or fewer fit. With more, the first four stay and a **More** tab opens a `BottomSheet` with the rest and the user; the tab is marked when it holds the current page. |
| `mobile-drawer` | `MobileAppShell` with a `MobileHeader` (the current page's name, actions and a menu button) and the whole nav model (brand, sections, actions, user) in a side drawer. There is no bottom bar. |

The tab bar sits in normal flow below the scroll region, so a screen's
composer stays above it (the layout-fit rule). The header and bar pad for
the safe area (`pt-safe`, `pb-safe`, `px-safe`), and both use `h-app`. On a
wide window the layout is a centred column (`max-w-2xl`), which
`device-frame:max-w-none` lifts inside a phone or tablet frame. Drawers and
sheets open on the device screen inside a frame (`useOverlayPortalTarget`).
The host registry also includes six layouts for other product frames:
`master-detail`, `dashboard-grid` and `docs` for content; `marketing`,
`wizard` and `auth-split` for flow pages. Each is loaded from its own lazy
module and stays out of the package barrel.

Only the exact current page gets `aria-current="page"`. Its parents are
tinted (`data-trail`), and in a collapsed or one-level list the visible
parent carries the mark. `Sidebar` shows one level, so `sidebar` and `rail`
mark the parent of a current child page.

## Form utilities

Tag, emoji, password-strength and character-count controls
(`src/components/form/utilities/`). Theme tokens only; no Dailybot branding.

| Component | Behavior |
| --- | --- |
| `TagEmailInput` | Invite-style tags. Commit with Enter, Space, comma or semicolon; paste splits on the same separators; Backspace on an empty draft removes the last tag. Email checks are format-only (`local@domain`) via `isEmailAddress` — not deliverability. Use `ignoreValidation` for free-form tags. |
| `EmojiPicker` | One emoji from a built-in grouped catalog (`EMOJI_GROUPS`). Search filters by name; the grid is keyboard-roving (arrows, Home/End, Enter). |
| `PasswordStrengthMeter` | Five-segment `role="meter"` under a password field. Rates the string in memory with `passwordScore` (length, case, digit, symbol, tiny fictional common list). **Simulation only:** it never stores, hashes or transmits the value. Pair with `Input type="password"`. |
| `TextCounter` | Input or textarea with `maxlength` and a remaining-character countdown shown while focused once `showAfter` (default 20) characters remain. |

- **Honesty.** Password strength is UX feedback for prototypes, not security. Email validation is shape-only.
- **FormField.** Pass `id`, `aria-describedby` and `aria-invalid` from `control.props` onto these controls the same way as other inputs.

## Scheduling inputs

Typed, keyboard-first controls for schedules (`src/components/form/scheduling/`). Every
value is plain JSON with no `Date` objects, so it validates with zod and persists as is:

| Component | Value | Behavior |
| --- | --- | --- |
| `TimeZoneSelect` | IANA zone (`'America/Bogota'`) | A searchable `Combobox` labelled `(GMT-05:00) America/Bogota`, sorted west to east. A search matches any part of the label or the zone name, and `_` matches a space. Offsets are those in force at `referenceDate`, so pass the scenario clock. `zones` narrows the list. |
| `WeekdayPicker` | `IsoWeekday[]` (1 = Monday … 7 = Sunday, sorted) | Toggle buttons (`aria-pressed`) in one labelled group with a single tab stop. Arrows and Home/End move between days; Space or Enter toggles one. `weekStartsOn`, `locale`, `labelStyle`, and `name` (one hidden input per day). For a single day, use `Select` with `weekdayOptions()`. |
| `TimeInput` | `'HH:mm'` (24-hour) or `null` | Native hour and minute selects, plus AM/PM in `format={12}`. `intervalMinutes` must divide 60, otherwise it falls back to 15. A minute that is off the step stays available as an option. The value is emitted only once both hour and minute are set. |
| `DatePicker` | `'YYYY-MM-DD'` or `null` | A text field plus a `Calendar` popover; Alt+ArrowDown also opens it. Typed text is checked on change. An impossible date (`2026-02-30`), a date outside `min`/`max`, or one that `isDateDisabled` rejects shows an inline message linked through `aria-describedby`, calls `onInvalid(issue, text)`, and leaves the value unchanged. Clearing the field sets `null`. |
| `DateRangePicker` | `{ start, end }` of `'YYYY-MM-DD' \| null` | Start and end fields plus a calendar that picks the range in two clicks; reversed ends are swapped. The value changes only to an empty range or to a complete, valid one. `maxDays`, `min`, `max` and `required` are enforced through `validateDateRange()`. |
| `Calendar` | — | An ARIA grid with a single tab stop. Arrows move a day or a week, Home/End go to the start or end of the week, PageUp/PageDown change the month (with Shift, the year), and Enter or Space picks. Unavailable dates stay focusable with `aria-disabled`; today is marked `aria-current="date"`. The grid always shows six weeks, so its height never jumps. |

- **Deterministic dates.** Pass `today` (`isoDateFromInstant(runtime.clock.now(), zone)`) and
  `referenceDate` from the scenario clock. All arithmetic (`addDays`, `addMonths`, `monthGrid`, …)
  runs on UTC midnights, so the host time zone and DST never move a date. The calendar falls
  back to the real clock only when it is given no date at all.
- **FormField.** Spread `control.props` onto any of them. The label targets the first segment
  (the hour, or the start date), and `aria-required` is treated like `required`.
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

Toasts auto-dismiss (4–8 s depending on kind, configurable with `duration`). The countdown pauses
while the stack is hovered or focused. Messages are announced politely, and errors assertively.
Render one `<Toaster />` near the app root. It sits bottom-right, or bottom-center above the safe
area on phones.

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
close it (`closeOnOutsideClick` overrides either default). Like `Dialog`, it portals into the device
screen when a shell frames the prototype.

Every `Drawer` registers with the shared `overlayStack`:

- Nested drawers paint in open order, each above the one before (z-index from 51 upward).
- Escape closes only the top drawer.
- On close, focus returns to the element that opened the drawer. Focus only moves when it was lost
  with the drawer or was still inside it, so it never steals focus from the page behind a non-modal
  drawer.
- A menu or picker inside an overlay can call `overlayStack.registerDismissibleLayer(el, close)`.
  Escape then closes that layer first, never the drawer and its draft.

A custom overlay joins the same stack with `useOverlayLayer(() => open, { modal: () => modal })`.
It gets its `zIndex` and `restoreFocus(container)`. `Dialog`, `AlertDialog`, `BottomSheet` and
`DetailPanel` also register as modal layers, so a dialog opened inside a drawer paints above it
and Escape closes only the top layer. `UndoToaster` stays above the stack (`useOverlayTopZIndex`)
and remains keyboard-reachable outside a modal drawer's focus trap.

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
visible focus rings and keyboard support (from Bits UI or native elements). They also get 44px
touch targets below the `sm` breakpoint. Motion respects `prefers-reduced-motion` and the
prototype's own reduced-motion toggle.

## Development

```sh
pnpm --filter @protoyard/ui typecheck
pnpm vitest run packages/ui        # root config inlines bits-ui, @lucide/svelte, svelte-toolbelt, runed
```

## Package output

The repository keeps source exports for workspace development. `pnpm build:packages --filter svelte` creates the compiled ESM, declarations and Svelte components under `dist/` that the packed manifest exposes.
