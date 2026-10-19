<script lang="ts">
import { SearchX, Users as UsersIcon } from '@lucide/svelte';
import { avatarImage, can, liveQuery, navigate, useClock } from '@protoyard/renderer-svelte';
import {
  Avatar,
  Button,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorState,
  Select,
} from '@protoyard/ui';
import PageHeader from '../components/PageHeader.svelte';
import ReasonDialog from '../components/ReasonDialog.svelte';
import StatusBadge from '../components/StatusBadge.svelte';
import { CAPABILITIES, ROLE_LABELS } from '../domain/policy.ts';
import { useAdmin } from '../lib/context.ts';
import { fromNow, plural } from '../lib/format.ts';
import { type TenantPerson, tenantPeople } from '../lib/queries.ts';

type Row = TenantPerson & {
  id: string;
  name: string;
  email: string;
  tenantName: string;
  state: string;
};

const { db, services } = useAdmin();
const clock = useClock();
const people = liveQuery(
  async (): Promise<Row[]> =>
    (await tenantPeople(db)).map((p) => ({
      ...p,
      id: p.persona.id,
      name: p.persona.name,
      email: p.persona.email ?? '',
      tenantName: p.tenant?.name ?? p.access.tenantId,
      state: p.access.disabled ? 'disabled' : 'active',
    })),
  { initial: [] }
);

let accessFilter = $state('all');
let target = $state<Row | null>(null);
let impersonateOpen = $state(false);
const filtered = $derived(
  (people.current ?? []).filter((p) => accessFilter === 'all' || p.state === accessFilter)
);

function impersonate(row: Row) {
  target = row;
  impersonateOpen = true;
}

const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Person', sortable: true, cell: personCell },
  { key: 'tenantName', header: 'Tenant', sortable: true, hideBelow: 'md' },
  {
    key: 'role',
    header: 'Role',
    hideBelow: 'lg',
    accessor: (p) => ROLE_LABELS[p.membership.role] ?? p.membership.role,
  },
  { key: 'state', header: 'Access', sortable: true, cell: stateCell },
  {
    key: 'lastSeen',
    header: 'Last seen',
    hideBelow: 'lg',
    accessor: (p) => fromNow(p.access.lastSeenAt, clock.now),
  },
  { key: 'actions', header: 'Actions', align: 'right', cell: actionsCell },
];
</script>

{#snippet personCell(p: Row)}
  <span class="flex items-center gap-3">
    <Avatar name={p.name} {...avatarImage(p.persona.avatar)} size="sm" decorative />
    <span class="min-w-0">
      <span class="block truncate font-medium">{p.name}</span>
      <span class="block truncate text-xs text-muted-foreground">{p.email}</span>
    </span>
  </span>
{/snippet}
{#snippet stateCell(p: Row)}<StatusBadge status={p.state} />{/snippet}
{#snippet actionsCell(p: Row)}
  <span class="flex justify-end gap-2">
    <Button size="sm" variant="ghost" onclick={(e: MouseEvent) => { e.stopPropagation(); navigate(`/tenants/${p.access.tenantId}`); }}>Tenant</Button>
    {#if can(CAPABILITIES.usersImpersonate)}
      <Button
        size="sm"
        variant="outline"
        disabled={p.access.disabled}
        aria-label={`Impersonate ${p.name}`}
        onclick={(e: MouseEvent) => { e.stopPropagation(); impersonate(p); }}
      >Impersonate</Button>
    {/if}
  </span>
{/snippet}

<PageHeader title="Users" description={plural((people.current ?? []).length, 'person') + ' across all tenants'} />

{#if people.error}
  <ErrorState title="Could not load people" message={String(people.error)} />
{:else}
  <DataTable
    {columns}
    rows={filtered}
    getRowId={(p) => p.id}
    searchKeys={['name', 'email', 'tenantName']}
    searchPlaceholder="Search name, email, tenant…"
    pageSize={15}
    loading={people.loading}
    sort={{ key: 'name', direction: 'asc' }}
    caption="Users"
  >
    {#snippet empty({ query })}
      <EmptyState
        size="sm"
        icon={query ? SearchX : UsersIcon}
        title={query ? `No people match “${query.trim()}”` : 'No people yet'}
        description={query ? 'Try another search.' : 'People appear when tenants invite their teams.'}
      />
    {/snippet}
    {#snippet filters()}
      <Select
        aria-label="Filter by access"
        class="w-full sm:w-40"
        items={[{ value: 'all', label: 'Any access' }, { value: 'active', label: 'Active' }, { value: 'disabled', label: 'Disabled' }]}
        bind:value={accessFilter}
      />
    {/snippet}
  </DataTable>
{/if}

<ReasonDialog
  bind:open={impersonateOpen}
  title={`Impersonate ${target?.name ?? ''}?`}
  description="You'll see the product as this person (simulated). The reason and every start and stop go to the audit log."
  confirmLabel="Start impersonating"
  success={`Now viewing as ${target?.name ?? ''}`}
  action={(reason) => services.impersonation.start(target?.id ?? '', { reason })}
/>
