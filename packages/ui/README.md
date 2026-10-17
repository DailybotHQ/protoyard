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
| Forms | `Button` (+ `buttonVariants`), `Input`, `Textarea`, `Label`, `FormField`, `Checkbox`, `RadioGroup` / `RadioGroupItem`, `Switch`, `Select`, `Combobox`, `UserPicker` |
| Overlays | `Dialog`, `AlertDialog`, `DetailPanel`, `BottomSheet`, `DropdownMenu`, `Popover`, `Tooltip` |
| Disclosure | `Tabs`, `Accordion` |
| Feedback | `Toaster` + `toast`, `Progress`, `Spinner`, `Skeleton`, `EmptyState`, `ErrorState`, `LoadingState` |
| Display | `Badge` (+ `badgeVariants`), `Avatar`, `Card` / `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter`, `Separator`, `Kbd`, `StatCard` |
| Data | `DataTable`, `Pagination`, `Kanban` |
| Layout | `AppShell`, `Sidebar`, `Header`, `Breadcrumb`, `CardGrid` |
| Collaboration | `ChatThread`, `MessageList`, `Composer`, `TypingIndicator` |
| Flows | `Stepper`, `Wizard` |
| Mobile | `BottomNav`, `MobileHeader`, `BottomSheet`, `SafeArea` |

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
- Async callbacks (`AlertDialog.onConfirm`, `ErrorState.onRetry`, `Wizard.validate` / `onFinish`,
  `Composer.onSubmit`, `Kanban.onMove`) show a loading state until they settle.

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
pnpm --filter @protoyard/ui test   # uses packages/ui/vitest.config.ts (see the note inside)
```
