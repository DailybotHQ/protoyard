<script lang="ts">
import {
  Avatar,
  Badge,
  type BadgeVariant,
  Button,
  DataTable,
  type DataTableColumn,
  type DataTableSort,
  Select,
  toast,
} from '@protoyard/ui';
import { type Member, makeMembers } from './members.ts';
import { wait } from './nav.ts';

const all = makeMembers(28);
let role = $state('all');
let sort = $state<DataTableSort | null>({ key: 'name', direction: 'asc' });
let search = $state('');
let page = $state(1);
let loading = $state(false);
let empty = $state(false);

const rows = $derived(empty ? [] : role === 'all' ? all : all.filter((m) => m.role === role));
const statusTone: Record<Member['status'], BadgeVariant> = {
  active: 'success',
  invited: 'info',
  suspended: 'destructive',
};

const columns: DataTableColumn<Member>[] = [
  { key: 'name', header: 'Name', sortable: true, cell: nameCell },
  { key: 'role', header: 'Role', sortable: true, hideBelow: 'sm' },
  { key: 'status', header: 'Status', sortable: true, cell: statusCell },
  { key: 'projects', header: 'Projects', sortable: true, align: 'right', hideBelow: 'md' },
  {
    key: 'joined',
    header: 'Joined',
    sortable: true,
    align: 'right',
    hideBelow: 'md',
    accessor: (member) => member.joined,
  },
];

async function reload(): Promise<void> {
  loading = true;
  await wait(1200);
  loading = false;
}
</script>

{#snippet nameCell(member: Member)}
  <span class="flex items-center gap-2.5">
    <Avatar name={member.name} size="sm" decorative />
    <span class="grid min-w-0">
      <span class="truncate font-medium">{member.name}</span>
      <span class="truncate text-xs text-muted-foreground">{member.email}</span>
    </span>
  </span>
{/snippet}

{#snippet statusCell(member: Member)}
  <Badge variant={statusTone[member.status]}>{member.status}</Badge>
{/snippet}

<DataTable
  {columns}
  {rows}
  getRowId={(member) => member.id}
  bind:sort
  bind:search
  bind:page
  searchKeys={['name', 'email']}
  searchPlaceholder="Search name or email…"
  pageSize={8}
  {loading}
  caption="Workspace members"
  emptyTitle="No members"
  emptyDescription="Invite people to see them here."
  onRowClick={(member) => toast.info(member.name, { description: `${member.role} · ${member.email}` })}
  rowLabel={(member) => `Show ${member.name}`}
>
  {#snippet filters()}
    <Select
      aria-label="Filter by role"
      class="w-36"
      bind:value={role}
      onValueChange={() => (page = 1)}
      items={[
        { value: 'all', label: 'All roles' },
        { value: 'Owner', label: 'Owner' },
        { value: 'Admin', label: 'Admin' },
        { value: 'Editor', label: 'Editor' },
        { value: 'Viewer', label: 'Viewer' },
      ]}
    />
  {/snippet}
  {#snippet toolbar()}
    <Button size="sm" variant="outline" onclick={() => (empty = !empty)}>
      {empty ? 'Restore rows' : 'Empty'}
    </Button>
    <Button size="sm" variant="outline" onclick={reload} disabled={loading}>Reload</Button>
  {/snippet}
</DataTable>
<p class="mt-2 text-xs text-muted-foreground" aria-live="polite">
  Sort: {sort ? `${sort.key} ${sort.direction}` : 'none'} · page {page} · click a row (or press Enter on it).
</p>
