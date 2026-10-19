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

## Components

| Group | Components |
| --- | --- |
| Forms | `Button` (+ `buttonVariants`), `Input`, `Textarea`, `Label`, `FormField`, `Checkbox`, `RadioGroup` / `RadioGroupItem`, `Switch`, `Select`, `Combobox`, `UserPicker`, `FileDropzone` |
| Overlays | `Dialog`, `AlertDialog`, `DetailPanel`, `BottomSheet`, `DropdownMenu`, `Popover`, `Tooltip` |
| Disclosure | `Tabs`, `Accordion` |
| Feedback | `Toaster` + `toast`, `Progress`, `Spinner`, `Skeleton`, `EmptyState`, `ErrorState`, `LoadingState` |
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
| `FormField` | `label`, `description`, `error`, `required`, `hideLabel`, `id`; `children({ id, describedBy, invalid, required, props })` |
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
| `Accordion` | `items: { value, title, content?, disabled? }[]`, `type` single·multiple, `bind:value`, `content(item)` snippet, `headingLevel` |
| `Toaster` / `toast` | see *Toasts* below |
| `Progress` | `value` (`null` = indeterminate), `max`, `label` or `ariaLabel`, `showValue`, `tone`, `size` |
| `Spinner` / `Skeleton` | size / `class` for shape |
| `EmptyState` / `ErrorState` / `LoadingState` | `title`, `description`, `icon`, `action` snippet; `ErrorState.onRetry`; `LoadingState.label` |
| `Badge` | `variant` default·secondary·outline·success·warning·destructive·info |
| `Avatar` | `name` (initials + deterministic color), `src?`, `size` xs·sm·md·lg, `decorative` |
| `Card` + parts | `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` |
| `Separator` / `Kbd` | `orientation` / children |
| `StatCard` | `label`, `value`, `delta`, `trend` up·down·neutral, `positive`, `hint`, `icon` |
| `DataTable` | `columns: { key, header, cell?, accessor?, sortable?, align?, hideBelow? }[]`, `rows`, `getRowId`, `bind:sort`, `bind:search`, `searchKeys`/`searchFn`, `pageSize` (0 = off), `bind:page`, `onRowClick` + `rowLabel`, `loading`, `empty`, `filters`, `toolbar`, `caption` |
| `FilterBar` | `fields: { id, label, kind: enum·date-range·boolean·relation, options?, multiple?, key?, accessor? }[]`, `bind:values` (plain JSON for the hash query), chips + reset; pair with pure `applyFilters(rows, fields, values)` |
| `Pagination` | `bind:page`, `pageCount` or `total` + `pageSize` |
| `Kanban` | `columns: { id, title }[]`, `items`, `getColumn`, `getItemId`, `getItemLabel`, `onMove(item, columnId)` (async ok), `canMove`, `card` snippet; HTML5 drag and drop + a keyboard "Move to…" menu per card |
| `AppShell` | `sidebar`, `header`, `bottomNav`, children, `bind:sidebarOpen` (mobile drawer, auto-closes at `lg`), `sidebarClass`, `mainClass`, `mainId`, `mainElement` (`div` when nested in another `<main>`), skip link; frame uses `min-h-app` / sidebar column `h-app` (`--py-app-height`) so framed shells match the device screen |
| `LayoutHost` | `layout: LayoutId`, routed screen snippet, `class`; measures its own container, applies the core layout fallback below its breakpoint, and lazy-loads the registered module with a skeleton while loading. Layout modules call `mountScreen(target)` to place the stable routed-screen outlet without remounting its local state. Unregistered layouts leave the screen in the host's default content frame. |
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

Wrap the routed screen in `LayoutHost` when a prototype opts into a shared
layout. The host uses the measured container width and the core `LAYOUTS`
catalog's fallback rules, so a shell's inner screen width drives the choice.
Each registered layout is loaded through its own relative dynamic import in
`src/layouts/registry.ts`. A layout provides a target with `mountScreen(target)`;
the host moves one stable screen outlet between targets, preserving the route's
component state while the layout chrome changes. While the selected module is
loading, the current screen stays mounted under a chrome skeleton. Until a
layout has registered its loader, the screen renders in the host's default
content frame.

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
