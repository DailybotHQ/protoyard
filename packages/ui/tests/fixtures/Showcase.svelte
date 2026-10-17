<script lang="ts">
import { House, Inbox, Trash2 } from '@lucide/svelte';
import {
  Accordion,
  Badge,
  BottomNav,
  BottomSheet,
  Breadcrumb,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardGrid,
  CardHeader,
  CardTitle,
  ChatThread,
  Checkbox,
  Combobox,
  DetailPanel,
  Dialog,
  DropdownMenu,
  EmptyState,
  ErrorState,
  Kbd,
  Label,
  LoadingState,
  MobileHeader,
  Pagination,
  Popover,
  Progress,
  RadioGroup,
  SafeArea,
  Select,
  Separator,
  Skeleton,
  Spinner,
  Stepper,
  Switch,
  Textarea,
  Tooltip,
} from '../../src/index.ts';

let { overlay = 'none' }: { overlay?: 'none' | 'dialog' | 'panel' | 'sheet' } = $props();

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
];
let selectValue = $state('b');
let comboValue = $state('a');
let checked = $state(true);
let on = $state(false);
let radio = $state('a');
let page = $state(3);
let notes = $state('');
let draft = $state('');
</script>

<Badge variant="success">Live</Badge>
<Badge variant="warning">Beta</Badge>
<Kbd>⌘K</Kbd>
<Spinner label="Working" />
<Skeleton class="h-4 w-20" />
<Separator />
<Label for="notes" required>Notes</Label>
<Textarea id="notes" bind:value={notes} />
<Select items={options} bind:value={selectValue} aria-label="Plan" />
<Combobox items={options} bind:value={comboValue} aria-label="Fruit" />
<Checkbox bind:checked label="Accept terms" description="Required to continue" />
<Switch bind:checked={on} label="Notifications" />
<RadioGroup bind:value={radio} items={options} aria-label="Option" />
<Progress value={40} label="Upload" showValue />
<Progress value={null} ariaLabel="Syncing" />
<Pagination bind:page total={95} pageSize={10} />
<Breadcrumb items={[{ label: 'Home', href: '#/' }, { label: 'Projects', href: '#/p' }, { label: 'Atlas' }]} />
<Accordion type="multiple" value={['one']} items={[{ value: 'one', title: 'First', content: 'First body' }, { value: 'two', title: 'Second', content: 'Second body' }]} />
<Stepper steps={[{ id: 's1', label: 'One' }, { id: 's2', label: 'Two' }]} current={1} orientation="vertical" />
<CardGrid as="ul" minItemWidth="12rem">
  <li>
    <Card>
      <CardHeader>
        <CardTitle level={2}>Card title</CardTitle>
        <CardDescription>Card description</CardDescription>
      </CardHeader>
      <CardContent>Card body</CardContent>
      <CardFooter><Button size="sm">Act</Button></CardFooter>
    </Card>
  </li>
</CardGrid>
<EmptyState title="Nothing here" icon={Inbox}>
  {#snippet action()}<Button>Create</Button>{/snippet}
</EmptyState>
<ErrorState message="Boom" onRetry={() => {}} />
<LoadingState variant="skeleton" label="Loading rows" />
<Tooltip content="Helpful">
  {#snippet children({ props })}<Button {...props} size="icon" aria-label="Help">?</Button>{/snippet}
</Tooltip>
<Popover>
  {#snippet trigger({ props })}<Button {...props}>Filters</Button>{/snippet}
  <p>Popover body</p>
</Popover>
<DropdownMenu
  items={[
    { label: 'Edit', shortcut: 'E' },
    { type: 'separator' },
    { label: 'Delete', icon: Trash2, destructive: true },
  ]}
>
  {#snippet trigger({ props })}<Button {...props}>Actions</Button>{/snippet}
</DropdownMenu>
<MobileHeader title="Inbox" backHref="#/" />
<SafeArea edges={['bottom']}><p>Safe</p></SafeArea>
<BottomNav fixed={false} items={[{ label: 'Home', href: '#/', icon: House, active: true, badge: 2 }]} />
<div style="height: 300px">
  <ChatThread
    messages={[{ id: 'm1', author: { id: 'u1', name: 'Ada' }, body: 'Hello', at: new Date(0) }]}
    currentUserId="u2"
    typing={['Ada']}
    bind:draft
    onSend={() => {}}
  />
</div>

<Dialog open={overlay === 'dialog'} title="Edit profile" description="Update details">
  <p>Dialog body</p>
  {#snippet footer()}<Button>Save</Button>{/snippet}
</Dialog>
<DetailPanel open={overlay === 'panel'} title="Ticket #42" description="Opened today">
  <p>Panel body</p>
  {#snippet footer()}<Button>Resolve</Button>{/snippet}
</DetailPanel>
<BottomSheet open={overlay === 'sheet'} title="Share">
  <p>Sheet body</p>
</BottomSheet>
