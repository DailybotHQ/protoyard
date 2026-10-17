import type { Component } from 'svelte';
import type { CatalogDemo } from './types.ts';

// Every demo is its own lazily loaded chunk: the shell (and the snippets
// below) stay small, and a group page fetches only the demos it shows.
const modules = import.meta.glob<{ default: Component }>('../demos/*Demo.svelte');

function demo(name: string): CatalogDemo['load'] {
  const loader = modules[`../demos/${name}.svelte`];
  if (!loader) throw new Error(`Missing demo module ${name}.svelte`);
  return async () => (await loader()).default;
}

/** Live demo, copyable usage and accessibility notes for every catalog id. */
export const DEMOS: Record<string, CatalogDemo> = {
  button: {
    load: demo('ButtonDemo'),
    snippet: `<script lang="ts">
  import { Plus, Settings } from '@lucide/svelte';
  import { Button } from '@protoyard/ui';
  let saving = $state(false);
</script>

<Button onclick={save} loading={saving}>Save</Button>
<Button variant="outline" size="sm"><Plus aria-hidden="true" /> New</Button>
<Button variant="ghost" size="icon" aria-label="Settings"><Settings aria-hidden="true" /></Button>
<Button href="#/projects" variant="link">All projects</Button>`,
    a11y: [
      'Renders a native <button type="button">, or an <a> when href is set; Enter and Space work natively.',
      'loading disables the button, sets aria-busy and shows a spinner; loadingLabel adds screen-reader text.',
      'Icon-only buttons need an aria-label. sm/md/icon sizes grow to 44px touch targets below the sm breakpoint.',
    ],
  },
  input: {
    load: demo('InputDemo'),
    snippet: `<script lang="ts">
  import { Input, Label } from '@protoyard/ui';
  let email = $state('');
</script>

<Label for="email">Email</Label>
<Input id="email" type="email" bind:value={email} autocomplete="email" />
<Input aria-invalid="true" aria-describedby="email-error" />
<Input disabled value="read-only" />`,
    a11y: [
      'A native <input>: pair it with a <Label for> (or use FormField) so it has an accessible name.',
      'aria-invalid switches to the destructive border; describe the error with aria-describedby.',
      'Text is 16px on phones so iOS Safari does not zoom when the field is focused.',
    ],
  },
  textarea: {
    load: demo('TextareaDemo'),
    snippet: `<script lang="ts">
  import { Label, Textarea } from '@protoyard/ui';
  let bio = $state('');
</script>

<Label for="bio">Bio</Label>
<Textarea id="bio" bind:value={bio} maxlength={280} aria-describedby="bio-count" />
<p id="bio-count">{280 - bio.length} characters left</p>`,
    a11y: [
      'A native <textarea> that grows with its content (field-sizing: content where supported).',
      'Label it with <Label for> or FormField; announce counters via aria-describedby.',
    ],
  },
  label: {
    load: demo('LabelDemo'),
    snippet: `<script lang="ts">
  import { Input, Label } from '@protoyard/ui';
</script>

<Label for="title" required>Project title</Label>
<Input id="title" required />`,
    a11y: [
      'A native <label>: clicking it focuses or toggles the associated control.',
      'The required asterisk is aria-hidden; put required on the control itself for semantics.',
    ],
  },
  'form-field': {
    load: demo('FormFieldDemo'),
    snippet: `<script lang="ts">
  import { FormField, Input } from '@protoyard/ui';
  let name = $state('');
  const error = $derived(name.length < 3 ? 'Use at least 3 characters.' : undefined);
</script>

<FormField label="Username" description="Lowercase only." {error} required>
  {#snippet children({ props })}
    <Input {...props} bind:value={name} />
  {/snippet}
</FormField>`,
    a11y: [
      'Wires the label (for/id), description and error into aria-describedby automatically.',
      'Sets aria-invalid while an error is present and aria-required when required is set.',
      'hideLabel keeps the label for assistive tech while hiding it visually.',
    ],
  },
  checkbox: {
    load: demo('CheckboxDemo'),
    snippet: `<script lang="ts">
  import { Checkbox } from '@protoyard/ui';
  let accepted = $state(false);
  let all = $state(false);
  let some = $state(true);
</script>

<Checkbox label="I accept the terms" description="Required." bind:checked={accepted} />
<Checkbox label="Select all" bind:checked={all} bind:indeterminate={some} />`,
    a11y: [
      'Bits UI checkbox (role="checkbox" with aria-checked, including "mixed" when indeterminate); Space toggles.',
      'label renders a real <label for>; description is linked with aria-describedby.',
      'An invisible hit area extends the 16px box to a 44px touch target on phones.',
    ],
  },
  'radio-group': {
    load: demo('RadioGroupDemo'),
    snippet: `<script lang="ts">
  import { RadioGroup } from '@protoyard/ui';
  let plan = $state('team');
</script>

<p id="plan-label">Plan</p>
<RadioGroup
  aria-labelledby="plan-label"
  bind:value={plan}
  items={[
    { value: 'starter', label: 'Starter', description: 'Up to 3 projects' },
    { value: 'team', label: 'Team' },
  ]}
/>`,
    a11y: [
      'role="radiogroup" with roving focus: Tab enters the group, arrow keys move and select.',
      'Give the group a name with aria-labelledby (or aria-label); item labels use <label for>.',
    ],
  },
  switch: {
    load: demo('SwitchDemo'),
    snippet: `<script lang="ts">
  import { Switch } from '@protoyard/ui';
  let digest = $state(true);
</script>

<Switch label="Weekly digest" description="Every Monday." bind:checked={digest} />
<Switch aria-label="Dark sidebar" />`,
    a11y: [
      'role="switch" with aria-checked; Space and Enter toggle it.',
      'label renders a <label for>; without one, pass aria-label.',
    ],
  },
  select: {
    load: demo('SelectDemo'),
    snippet: `<script lang="ts">
  import { Label, Select } from '@protoyard/ui';
  let stage = $state('');
</script>

<Label for="stage">Stage</Label>
<Select
  id="stage"
  bind:value={stage}
  placeholder="Choose a stage"
  items={[{ value: 'lead', label: 'Lead' }, { value: 'won', label: 'Won' }]}
/>`,
    a11y: [
      'Bits UI select: the trigger opens with Enter, Space or arrow keys; type-ahead jumps to options.',
      'The trigger keeps the field label as its name and exposes the current value via aria-describedby.',
      'Pass name to render a hidden input so the value submits with native forms.',
    ],
  },
  combobox: {
    load: demo('ComboboxDemo'),
    snippet: `<script lang="ts">
  import { Combobox, FormField } from '@protoyard/ui';
  let timezone = $state('');
</script>

<FormField label="Time zone">
  {#snippet children({ props })}
    <Combobox {...props} bind:value={timezone} items={zones} emptyText="No matches" />
  {/snippet}
</FormField>`,
    a11y: [
      'role="combobox" input: typing filters the list, arrow keys move, Enter selects and Esc closes.',
      'FormField props (id, aria-describedby, aria-invalid) are spread onto the input.',
      'The toggle button has an accessible name ("Show options").',
    ],
  },
  dialog: {
    load: demo('DialogDemo'),
    snippet: `<script lang="ts">
  import { Button, Dialog } from '@protoyard/ui';
  let open = $state(false);
</script>

<Dialog bind:open title="Rename project" description="Visible to everyone.">
  {#snippet trigger({ props })}<Button {...props}>Rename</Button>{/snippet}
  <p>Dialog body…</p>
  {#snippet footer()}<Button onclick={() => (open = false)}>Save</Button>{/snippet}
</Dialog>`,
    a11y: [
      'role="dialog" with aria-modal, labelled by the title and described by the description.',
      'Focus is trapped inside and returns to the trigger on close; Esc and the backdrop close it.',
      'The close button has a screen-reader label (closeLabel, default "Close").',
    ],
  },
  'alert-dialog': {
    load: demo('AlertDialogDemo'),
    snippet: `<script lang="ts">
  import { AlertDialog, Button } from '@protoyard/ui';
</script>

<AlertDialog
  title="Delete project?"
  description="This cannot be undone."
  confirmLabel="Delete"
  destructive
  onConfirm={async () => await deleteProject()}
>
  {#snippet trigger({ props })}<Button {...props} variant="destructive">Delete</Button>{/snippet}
</AlertDialog>`,
    a11y: [
      'role="alertdialog": the backdrop does not dismiss it, so a choice is required.',
      'An async onConfirm shows a spinner and blocks Esc; a thrown error is shown inline with role="alert".',
    ],
  },
  'dropdown-menu': {
    load: demo('DropdownMenuDemo'),
    snippet: `<script lang="ts">
  import { Pencil, Trash2 } from '@lucide/svelte';
  import { Button, DropdownMenu } from '@protoyard/ui';
</script>

<DropdownMenu
  items={[
    { type: 'label', label: 'Document' },
    { label: 'Rename', icon: Pencil, shortcut: 'F2', onSelect: rename },
    { type: 'separator' },
    { label: 'Delete', icon: Trash2, destructive: true, onSelect: remove },
  ]}
>
  {#snippet trigger({ props })}<Button {...props} variant="outline">Actions</Button>{/snippet}
</DropdownMenu>`,
    a11y: [
      'role="menu" with menuitems: arrow keys move, Enter selects, Esc closes and returns focus.',
      'Headings group items (role="group" with a heading); disabled items are skipped.',
      'Shortcuts are display text only; wire the actual key bindings yourself.',
    ],
  },
  popover: {
    load: demo('PopoverDemo'),
    snippet: `<script lang="ts">
  import { Button, Popover } from '@protoyard/ui';
  let open = $state(false);
</script>

<Popover bind:open align="start">
  {#snippet trigger({ props })}<Button {...props} variant="outline">Filters</Button>{/snippet}
  <p>Any content, including form controls.</p>
</Popover>`,
    a11y: [
      'Non-modal: the trigger gets aria-expanded, Esc or an outside click closes it and focus returns.',
      'Icon-only triggers need an aria-label.',
    ],
  },
  tooltip: {
    load: demo('TooltipDemo'),
    snippet: `<script lang="ts">
  import { Bold } from '@lucide/svelte';
  import { Button, Tooltip } from '@protoyard/ui';
</script>

<Tooltip content="Bold (⌘B)">
  {#snippet children({ props })}
    <Button {...props} size="icon" variant="ghost" aria-label="Bold"><Bold aria-hidden="true" /></Button>
  {/snippet}
</Tooltip>`,
    a11y: [
      'Opens on hover and on keyboard focus, and closes with Esc.',
      'Tooltips supplement, never replace, an accessible name: keep the aria-label on icon buttons.',
      'Trigger props include their own onclick; compose handlers instead of overriding it.',
    ],
  },
  'detail-panel': {
    load: demo('DetailPanelDemo'),
    snippet: `<script lang="ts">
  import { Badge, Button, DetailPanel } from '@protoyard/ui';
  let open = $state(false);
</script>

<DetailPanel bind:open title="Ticket T-1042" description="Opened by mia@example.com">
  {#snippet headerActions()}<Badge variant="info">open</Badge>{/snippet}
  <p>Details…</p>
  {#snippet footer()}<Button onclick={() => (open = false)}>Done</Button>{/snippet}
</DetailPanel>`,
    a11y: [
      'A modal dialog (focus trap, Esc to close, labelled by its title) shown as a side panel.',
      'Becomes a near full-screen bottom sheet on phones; the close button is labelled "Close panel".',
    ],
  },
  'bottom-sheet': {
    load: demo('BottomSheetDemo'),
    snippet: `<script lang="ts">
  import { BottomSheet, Button } from '@protoyard/ui';
  let open = $state(false);
</script>

<BottomSheet bind:open title="Share" description="Choose how to share.">
  {#snippet trigger({ props })}<Button {...props}>Share</Button>{/snippet}
  <ul>…</ul>
  {#snippet footer()}<Button onclick={() => (open = false)}>Done</Button>{/snippet}
</BottomSheet>`,
    a11y: [
      'A modal dialog: focus is trapped and Esc or the backdrop close it.',
      'Swipe-to-dismiss is pointer-only by design; keyboard users close with Esc.',
      'hideTitle keeps the title for screen readers while hiding it visually.',
    ],
  },
  tabs: {
    load: demo('TabsDemo'),
    snippet: `<script lang="ts">
  import { Tabs } from '@protoyard/ui';
  let tab = $state('overview');
</script>

<Tabs
  bind:value={tab}
  label="Project views"
  items={[{ value: 'overview', label: 'Overview' }, { value: 'activity', label: 'Activity', badge: 3 }]}
>
  {#snippet content(item)}<p>{item.label} panel</p>{/snippet}
</Tabs>`,
    a11y: [
      'role="tablist"/"tab"/"tabpanel" with aria-selected; arrow keys move between tabs.',
      'Pass label to name the tab list; disabled tabs are skipped.',
    ],
  },
  accordion: {
    load: demo('AccordionDemo'),
    snippet: `<script lang="ts">
  import { Accordion } from '@protoyard/ui';
  let open = $state<string | string[] | undefined>('trial');
</script>

<Accordion
  bind:value={open}
  headingLevel={3}
  items={[
    { value: 'trial', title: 'How long is the trial?', content: '14 days.' },
    { value: 'export', title: 'Can I export data?', content: 'Yes, as CSV.' },
  ]}
/>`,
    a11y: [
      'Each trigger is a button inside a heading (headingLevel) with aria-expanded and aria-controls.',
      'Enter or Space toggles; type="multiple" lets several sections stay open.',
    ],
  },
  breadcrumb: {
    load: demo('BreadcrumbDemo'),
    snippet: `<script lang="ts">
  import { Breadcrumb } from '@protoyard/ui';
</script>

<Breadcrumb
  items={[
    { label: 'Projects', href: '#/projects' },
    { label: 'Atlas', href: '#/projects/atlas' },
    { label: 'Settings' },
  ]}
/>`,
    a11y: [
      'A <nav aria-label="Breadcrumb"> with an ordered list; separators are aria-hidden.',
      'The last item is plain text marked aria-current="page".',
    ],
  },
  pagination: {
    load: demo('PaginationDemo'),
    snippet: `<script lang="ts">
  import { Pagination } from '@protoyard/ui';
  let page = $state(1);
</script>

<Pagination bind:page total={47} pageSize={10} label="Invoice pages" />
<Pagination bind:page pageCount={8} compact />`,
    a11y: [
      'A labelled <nav>; the current page button has aria-current="page" and each page an aria-label.',
      'Previous/Next are disabled at the ends; ellipses are aria-hidden.',
    ],
  },
  toast: {
    load: demo('ToastDemo'),
    snippet: `<script lang="ts">
  import { Button, toast } from '@protoyard/ui';
  // Render <Toaster /> once near the app root.
</script>

<Button onclick={() => toast.success('Saved', { description: 'All changes stored.' })}>Save</Button>
<Button onclick={() => toast.error('Upload failed', { action: { label: 'Retry', onClick: retry } })}>
  Upload
</Button>`,
    a11y: [
      'Messages go to persistent live regions: polite for most kinds, assertive for errors.',
      'Auto-dismiss pauses while the stack is hovered or focused; each toast has a labelled dismiss button.',
    ],
  },
  progress: {
    load: demo('ProgressDemo'),
    snippet: `<script lang="ts">
  import { Progress } from '@protoyard/ui';
  let value = $state(40);
</script>

<Progress label="Uploading report.pdf" {value} showValue />
<Progress ariaLabel="Syncing" value={null} />
<Progress label="Storage" value={92} tone="warning" size="sm" />`,
    a11y: [
      'role="progressbar" named by the visible label (or ariaLabel), with aria-valuetext as a percentage.',
      'value={null} renders an indeterminate bar announced as "Loading".',
    ],
  },
  skeleton: {
    load: demo('SkeletonDemo'),
    snippet: `<script lang="ts">
  import { Skeleton } from '@protoyard/ui';
</script>

<div aria-busy="true">
  <span class="sr-only">Loading profile…</span>
  <Skeleton class="size-12 rounded-full" />
  <Skeleton class="h-4 w-1/2" />
</div>`,
    a11y: [
      'Skeletons are aria-hidden: announce the loading state separately (sr-only text or LoadingState).',
    ],
  },
  spinner: {
    load: demo('SpinnerDemo'),
    snippet: `<script lang="ts">
  import { Spinner } from '@protoyard/ui';
</script>

<Spinner />
<Spinner class="size-6 text-primary" label="Loading dashboard" />`,
    a11y: [
      'Decorative (aria-hidden) by default; with label it becomes role="status" with sr-only text.',
      'The spin animation only runs when motion is allowed (motion-safe).',
    ],
  },
  'empty-state': {
    load: demo('EmptyStateDemo'),
    snippet: `<script lang="ts">
  import { FolderPlus } from '@lucide/svelte';
  import { Button, EmptyState } from '@protoyard/ui';
</script>

<EmptyState icon={FolderPlus} title="No projects yet" description="Create one to get started.">
  {#snippet action()}<Button onclick={create}>Create project</Button>{/snippet}
</EmptyState>`,
    a11y: [
      'The icon is decorative (aria-hidden); the title is a paragraph, so add a heading nearby if the page outline needs one.',
    ],
  },
  'error-state': {
    load: demo('ErrorStateDemo'),
    snippet: `<script lang="ts">
  import { ErrorState } from '@protoyard/ui';
</script>

<ErrorState
  title="Couldn’t load invoices"
  message="The billing service did not respond."
  onRetry={async () => await reload()}
/>`,
    a11y: [
      'Rendered with role="alert", so it is announced when it appears.',
      'An async onRetry shows a loading button (aria-busy) until it settles.',
    ],
  },
  'loading-state': {
    load: demo('LoadingStateDemo'),
    snippet: `<script lang="ts">
  import { LoadingState } from '@protoyard/ui';
</script>

<LoadingState label="Loading activity…" />
<LoadingState variant="skeleton" rows={4} label="Loading notes…" />`,
    a11y: [
      'role="status" with aria-live="polite"; the label is read in both variants (sr-only for skeletons).',
    ],
  },
  badge: {
    load: demo('BadgeDemo'),
    snippet: `<script lang="ts">
  import { Badge } from '@protoyard/ui';
</script>

<Badge variant="success">Paid</Badge>
<Badge variant="destructive">Overdue</Badge>
<Badge variant="outline">v2.4.0</Badge>
<Badge>3<span class="sr-only"> unread</span></Badge>`,
    a11y: [
      'Plain text in a <span>; semantic variants are filled token pairs that keep small text at AA contrast.',
      'Do not rely on color alone: the text should carry the meaning (add sr-only context for bare counts).',
    ],
  },
  avatar: {
    load: demo('AvatarDemo'),
    snippet: `<script lang="ts">
  import { Avatar } from '@protoyard/ui';
</script>

<Avatar name="Ana Lee" />
<Avatar name="Omar Diaz" src="/avatars/omar.png" size="lg" />
<Avatar name="Kai Moreno" size="sm" decorative />`,
    a11y: [
      'role="img" named by name; decorative hides it when the name is already visible next to it.',
      'Falls back to initials if the image is missing or fails to load.',
    ],
  },
  card: {
    load: demo('CardDemo'),
    snippet: `<script lang="ts">
  import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@protoyard/ui';
</script>

<Card>
  <CardHeader>
    <CardTitle level={2}>Current plan</CardTitle>
    <CardDescription>Up to 3 projects.</CardDescription>
  </CardHeader>
  <CardContent>$0 / month</CardContent>
  <CardFooter><Button>Upgrade</Button></CardFooter>
</Card>`,
    a11y: ['CardTitle renders a real heading; set level so it fits the page outline (default h3).'],
  },
  separator: {
    load: demo('SeparatorDemo'),
    snippet: `<script lang="ts">
  import { Separator } from '@protoyard/ui';
</script>

<Separator class="my-3" />
<div class="flex h-5 items-center gap-3">
  Docs <Separator orientation="vertical" /> Source
</div>`,
    a11y: [
      'Decorative by default (hidden from assistive tech); decorative={false} exposes role="separator" with aria-orientation.',
    ],
  },
  kbd: {
    load: demo('KbdDemo'),
    snippet: `<script lang="ts">
  import { Kbd } from '@protoyard/ui';
</script>

<p>Open the palette with <Kbd>⌘</Kbd> <Kbd>K</Kbd></p>`,
    a11y: [
      'Renders a semantic <kbd> element. Symbols like ⌘ may be read literally, so add words where it matters.',
    ],
  },
  'stat-card': {
    load: demo('StatCardDemo'),
    snippet: `<script lang="ts">
  import { DollarSign } from '@lucide/svelte';
  import { StatCard } from '@protoyard/ui';
</script>

<StatCard label="Revenue" value="$12,480" delta="+8.2%" trend="up" icon={DollarSign} />
<StatCard label="Churn" value="2.1%" delta="-0.4%" trend="down" positive="down" hint="lower is better" />`,
    a11y: [
      'The trend is announced in words ("Increased:", "Decreased:") via sr-only text, not only by color and icon.',
      'positive="down" flips the color meaning for metrics where lower is better.',
    ],
  },
  'card-grid': {
    load: demo('CardGridDemo'),
    snippet: `<script lang="ts">
  import { Card, CardGrid } from '@protoyard/ui';
</script>

<CardGrid as="ul" minItemWidth="14rem" gap="md" aria-label="Templates">
  {#each templates as template (template.id)}
    <li><Card>…</Card></li>
  {/each}
</CardGrid>`,
    a11y: [
      'Use as="ul" with <li> children so screen readers announce the item count.',
      'DOM order equals visual order, so keyboard focus follows the grid naturally.',
    ],
  },
  'data-table': {
    load: demo('DataTableDemo'),
    snippet: `<script lang="ts">
  import { DataTable, type DataTableColumn } from '@protoyard/ui';
  const columns: DataTableColumn<Member>[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'joined', header: 'Joined', sortable: true, align: 'right' },
  ];
</script>

<DataTable
  {columns}
  rows={members}
  getRowId={(m) => m.id}
  searchKeys={['name', 'email']}
  pageSize={8}
  caption="Workspace members"
  onRowClick={(m) => open(m)}
/>`,
    a11y: [
      'A real <table> with a visually hidden caption; sortable headers are buttons and the th carries aria-sort.',
      'Clickable rows are focusable (tabindex 0) and open with Enter or Space; rowLabel names them.',
      'The search box is labelled from the caption and the result count is announced politely.',
    ],
  },
  kanban: {
    load: demo('KanbanDemo'),
    snippet: `<script lang="ts">
  import { Kanban } from '@protoyard/ui';
  let tasks = $state(initialTasks);
</script>

<Kanban
  columns={[{ id: 'todo', title: 'To do' }, { id: 'done', title: 'Done' }]}
  items={tasks}
  getColumn={(t) => t.status}
  getItemId={(t) => t.id}
  getItemLabel={(t) => t.title}
  onMove={(t, to) => (t.status = to)}
>
  {#snippet card(task)}<p>{task.title}</p>{/snippet}
</Kanban>`,
    a11y: [
      'Every card has a "Move … to another column" menu button, so moving never requires drag and drop.',
      'Moves are announced in a polite live region; columns are labelled sections with item counts.',
    ],
  },
  'app-shell': {
    load: demo('AppShellDemo'),
    snippet: `<script lang="ts">
  import { AppShell, Header, Sidebar } from '@protoyard/ui';
  let sidebarOpen = $state(false);
</script>

<AppShell bind:sidebarOpen>
  {#snippet sidebar()}<Sidebar {sections} />{/snippet}
  {#snippet header()}<Header title="Dashboard" />{/snippet}
  <p>Page content</p>
</AppShell>`,
    a11y: [
      'Includes a "Skip to content" link that moves focus to <main> (no hash navigation).',
      'Below lg the sidebar lives in a modal drawer (focus trap, Esc closes) opened by the Header menu button, which reflects aria-expanded.',
    ],
  },
  sidebar: {
    load: demo('SidebarDemo'),
    snippet: `<script lang="ts">
  import { House, Inbox } from '@lucide/svelte';
  import { Sidebar } from '@protoyard/ui';
  let collapsed = $state(false);
</script>

<Sidebar
  bind:collapsed
  sections={[{ label: 'Workspace', items: [
    { label: 'Home', href: '#/', icon: House, active: true },
    { label: 'Inbox', href: '#/inbox', icon: Inbox, badge: 3 },
  ] }]}
/>`,
    a11y: [
      'A labelled <nav> of plain links; the active item has aria-current="page".',
      'Collapsed mode keeps labels as sr-only text and adds tooltips; the toggle reflects aria-expanded.',
    ],
  },
  header: {
    load: demo('HeaderDemo'),
    snippet: `<script lang="ts">
  import { Button, Header } from '@protoyard/ui';
</script>

<Header title="Projects" description="12 active">
  {#snippet actions()}<Button size="sm">New</Button>{/snippet}
</Header>`,
    a11y: [
      'The title renders as an <h1>; use leading content instead of title when the page already has an h1.',
      'The mobile menu button is labelled (menuLabel) and reports aria-expanded inside an AppShell.',
    ],
  },
  'chat-thread': {
    load: demo('ChatThreadDemo'),
    snippet: `<script lang="ts">
  import { ChatThread, type ChatMessage } from '@protoyard/ui';
  const me = { id: 'me', name: 'You' };
  let messages = $state<ChatMessage[]>([]);
  let draft = $state('');
</script>

<ChatThread
  {messages}
  currentUserId="me"
  typing={['Ana Lee']}
  bind:draft
  onSend={(body) => messages.push({ id: String(messages.length + 1), author: me, body, at: new Date() })}
/>`,
    a11y: [
      'Messages live in a focusable role="log" region that announces new messages politely.',
      'The composer is labelled and explains Enter / Shift+Enter in its description.',
    ],
  },
  'message-list': {
    load: demo('MessageListDemo'),
    snippet: `<script lang="ts">
  import { MessageList } from '@protoyard/ui';
</script>

<div class="flex h-80 flex-col">
  <MessageList {messages} currentUserId="me" label="Team messages" />
</div>`,
    a11y: [
      'role="log" with aria-live="polite" and tabindex 0, so keyboard users can scroll the history.',
      'Own messages carry "You" for screen readers; avatars are decorative and author names are text.',
      'Statuses (Sending…, Failed to send) are rendered as text, not only color.',
    ],
  },
  composer: {
    load: demo('ComposerDemo'),
    snippet: `<script lang="ts">
  import { Composer } from '@protoyard/ui';
  let value = $state('');
</script>

<Composer
  bind:value
  onSubmit={async (text) => await post(text)}
  maxLength={500}
  placeholder="Write an update…"
/>`,
    a11y: [
      'A labelled textarea (label, default "Message") with a hidden hint about Enter and Shift+Enter.',
      'Enter is ignored during IME composition; the send button is labelled and shows aria-busy while sending.',
    ],
  },
  'typing-indicator': {
    load: demo('TypingIndicatorDemo'),
    snippet: `<script lang="ts">
  import { TypingIndicator } from '@protoyard/ui';
</script>

<TypingIndicator names={['Ana', 'Omar']} showLabel />`,
    a11y: [
      'A persistent role="status" region announces "Ana is typing"; the dots are aria-hidden.',
      'The dot animation respects reduced motion.',
    ],
  },
  'user-picker': {
    load: demo('UserPickerDemo'),
    snippet: `<script lang="ts">
  import { UserPicker } from '@protoyard/ui';
  let assignee = $state('');
</script>

<UserPicker
  users={[{ id: 'u1', name: 'Ana Lee', subtitle: 'Design' }]}
  bind:value={assignee}
  label="Assignee"
/>
<UserPicker users={people} variant="inline" label="Reviewer" />`,
    a11y: [
      'The trigger is named "<label>: <selected name>"; the list is a searchable command menu (arrow keys + Enter).',
      'The trigger aria-label overrides an external <label for>, so set label to the field name.',
    ],
  },
  stepper: {
    load: demo('StepperDemo'),
    snippet: `<script lang="ts">
  import { Stepper } from '@protoyard/ui';
  let current = $state(1);
</script>

<Stepper
  {current}
  steps={[{ id: 'cart', label: 'Cart' }, { id: 'pay', label: 'Payment' }, { id: 'review', label: 'Review' }]}
  onStepClick={(index) => (current = index)}
/>`,
    a11y: [
      'A labelled <nav> with an ordered list; the current step has aria-current="step".',
      'Each step states "(completed)", "(current step)" or "(not started)" for screen readers.',
    ],
  },
  wizard: {
    load: demo('WizardDemo'),
    snippet: `<script lang="ts">
  import { Wizard } from '@protoyard/ui';
  let current = $state(0);
</script>

<Wizard
  {steps}
  bind:current
  validate={(index) => (index === 0 && !email ? 'Email is required.' : true)}
  onFinish={async () => await createAccount()}
>
  {#snippet content({ step })}<p>{step.label} fields…</p>{/snippet}
</Wizard>`,
    a11y: [
      'Focus moves to the new step panel (labelled "Step n of N: …") on Next and Back.',
      'Validation messages appear in a role="alert" region; the Next button shows a loading state while async checks run.',
    ],
  },
  'bottom-nav': {
    load: demo('BottomNavDemo'),
    snippet: `<script lang="ts">
  import { House, Search } from '@lucide/svelte';
  import { BottomNav } from '@protoyard/ui';
</script>

<BottomNav
  items={[
    { label: 'Home', href: '#/', icon: House, active: true },
    { label: 'Search', href: '#/search', icon: Search, badge: 2 },
  ]}
/>`,
    a11y: [
      'A labelled <nav> of links at least 56px tall; the active tab has aria-current="page".',
      'Pads for the home indicator (pb-safe); pass fixed={false} to place it inside a custom frame.',
    ],
  },
  'mobile-header': {
    load: demo('MobileHeaderDemo'),
    snippet: `<script lang="ts">
  import { MobileHeader } from '@protoyard/ui';
</script>

<MobileHeader title="Ana Lee" subtitle="Designer" onBack={() => history.back()} backLabel="Back to contacts">
  {#snippet actions()}…{/snippet}
</MobileHeader>`,
    a11y: [
      'The back control is a 44px button (or link with backHref) labelled by backLabel.',
      'The title renders as an <h1>, and the header pads for the notch (pt-safe).',
    ],
  },
  'safe-area': {
    load: demo('SafeAreaDemo'),
    snippet: `<script lang="ts">
  import { SafeArea } from '@protoyard/ui';
</script>

<!-- Needs <meta name="viewport" content="..., viewport-fit=cover"> -->
<SafeArea edges={['top', 'bottom']} as="main">
  App content
</SafeArea>`,
    a11y: [
      'Keeps content and touch targets clear of notches and the home indicator; it adds no semantics of its own.',
    ],
  },
  'pattern-dashboard': {
    load: demo('PatternDashboardDemo'),
    snippet: `<script lang="ts">
  import { AppShell, CardGrid, DataTable, DetailPanel, Header, Sidebar, StatCard } from '@protoyard/ui';
</script>

<AppShell bind:sidebarOpen>
  {#snippet sidebar()}<Sidebar {sections} />{/snippet}
  {#snippet header()}<Header title="Overview" />{/snippet}
  <CardGrid minItemWidth="11rem">
    <StatCard label="Open pipeline" value="$214,000" delta="+6%" trend="up" />
  </CardGrid>
  <DataTable {columns} rows={deals} getRowId={(d) => d.id} onRowClick={openDeal} caption="Deals" />
</AppShell>
<DetailPanel bind:open title={deal.company}>…</DetailPanel>`,
    a11y: [
      'Uses a unique mainId so the nested shell does not duplicate the page’s main-content id.',
      'Rows open the detail panel by click or Enter; closing it returns focus to the previously focused element.',
    ],
  },
  'pattern-kanban': {
    load: demo('PatternKanbanDemo'),
    snippet: `<script lang="ts">
  import { DetailPanel, FormField, Kanban, Select } from '@protoyard/ui';
</script>

<Kanban {columns} items={tasks} getColumn={(t) => t.column} getItemId={(t) => t.id}
  getItemLabel={(t) => t.title} onMove={(t, to) => (t.column = to)}>
  {#snippet card(task)}
    <button type="button" onclick={() => open(task)}>{task.title}</button>
  {/snippet}
</Kanban>
<DetailPanel bind:open title={task.title}>
  <FormField label="Status">
    {#snippet children({ props })}<Select {...props} bind:value={task.column} items={statusItems} />{/snippet}
  </FormField>
</DetailPanel>`,
    a11y: [
      'Cards are buttons that open the panel; the per-card move menu works without drag and drop.',
      'Deleting asks for confirmation in an AlertDialog.',
    ],
  },
  'pattern-chat': {
    load: demo('PatternChatDemo'),
    snippet: `<script lang="ts">
  import { ChatThread } from '@protoyard/ui';
</script>

<nav aria-label="Conversations">…conversation buttons…</nav>
<ChatThread
  messages={conversation.messages}
  currentUserId="me"
  typing={conversation.typing}
  bind:draft={conversation.draft}
  onSend={(body) => send(conversation, body)}
/>`,
    a11y: [
      'The conversation list is a labelled nav with aria-current on the open conversation and sr-only unread counts.',
      'On narrow screens the list and thread switch, with a labelled back button.',
    ],
  },
  'pattern-mobile': {
    load: demo('PatternMobileDemo'),
    snippet: `<script lang="ts">
  import { BottomNav, BottomSheet, MobileHeader } from '@protoyard/ui';
</script>

<div class="flex h-dvh flex-col">
  <div class="flex-1 overflow-y-auto">
    <MobileHeader title="Orders" />
    <ul>…order buttons…</ul>
  </div>
  <BottomNav items={tabs} fixed={false} />
</div>
<BottomSheet bind:open title="Order #1042">…</BottomSheet>`,
    a11y: [
      'List rows are full-width buttons with at least 44px touch targets.',
      'The bottom sheet is a modal dialog; Esc, the backdrop or a downward swipe close it.',
    ],
  },
};
