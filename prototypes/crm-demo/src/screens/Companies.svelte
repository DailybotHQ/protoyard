<script lang="ts">
import { can, liveQuery, navigate } from '@protoyard/renderer-svelte';
import { Avatar, Badge, Button, DataTable, type DataTableColumn, Select } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import CompanyDialog from '../components/CompanyDialog.svelte';
import PageHeader from '../components/PageHeader.svelte';
import { type Company, INDUSTRIES, OPEN_STAGES } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useCrm } from '../lib/context.ts';
import { moneyCompact } from '../lib/format.ts';

type Row = Company & { openDeals: number; openValue: number; contacts: number };

const { db, services } = useCrm();
const rows = liveQuery(
  async (): Promise<Row[]> => {
    const [companies, deals, contacts] = await Promise.all([
      db.companies.toArray(),
      db.deals.toArray(),
      db.contacts.toArray(),
    ]);
    return companies.map((c) => {
      const open = deals.filter((d) => d.companyId === c.id && OPEN_STAGES.includes(d.stage));
      return {
        ...c,
        openDeals: open.length,
        openValue: open.reduce((s, d) => s + d.amount, 0),
        contacts: contacts.filter((p) => p.companyId === c.id).length,
      };
    });
  },
  { initial: [] }
);

let industry = $state('all');
let createOpen = $state(false);
const filtered = $derived(
  (rows.current ?? []).filter((c) => industry === 'all' || c.industry === industry)
);

const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Company', sortable: true, cell: nameCell },
  { key: 'industry', header: 'Industry', sortable: true, hideBelow: 'md' },
  { key: 'employees', header: 'Employees', sortable: true, align: 'right', hideBelow: 'lg' },
  { key: 'contacts', header: 'Contacts', sortable: true, align: 'right', hideBelow: 'sm' },
  { key: 'openValue', header: 'Open pipeline', sortable: true, align: 'right', cell: valueCell },
];
</script>

{#snippet nameCell(c: Row)}
  <span class="flex items-center gap-3">
    <Avatar name={c.name} size="sm" decorative />
    <span class="min-w-0">
      <span class="block truncate font-medium">{c.name}</span>
      <span class="flex flex-wrap gap-1 text-xs text-muted-foreground">
        {c.domain}
        {#each c.tags as tag (tag)}<Badge variant="outline">{tag}</Badge>{/each}
      </span>
    </span>
  </span>
{/snippet}
{#snippet valueCell(c: Row)}
  <span class="tabular-nums">{moneyCompact(c.openValue)}</span>
  <span class="block text-xs text-muted-foreground">{c.openDeals} open</span>
{/snippet}

<PageHeader title="Companies" description={`${(rows.current ?? []).length} accounts`}>
  {#snippet actions()}
    {#if can(CAPABILITIES.companiesWrite)}
      <Button onclick={() => (createOpen = true)} disabled={services.isPaywalled()}><Icon icon="plus" class="size-4" /> New company</Button>
    {/if}
  {/snippet}
</PageHeader>

<DataTable
  {columns}
  rows={filtered}
  getRowId={(c) => c.id}
  searchKeys={['name', 'domain', 'city', 'industry']}
  searchPlaceholder="Search companies…"
  pageSize={15}
  loading={rows.loading}
  onRowClick={(c) => navigate(`/companies/${c.id}`)}
  rowLabel={(c) => `Open ${c.name}`}
  emptyTitle="No companies yet"
  emptyDescription="Companies you add appear here."
  sort={{ key: 'openValue', direction: 'desc' }}
  caption="Companies"
>
  {#snippet filters()}
    <Select
      aria-label="Filter by industry"
      class="w-44"
      items={[{ value: 'all', label: 'All industries' }, ...INDUSTRIES.map((i) => ({ value: i, label: i }))]}
      bind:value={industry}
    />
  {/snippet}
</DataTable>

<CompanyDialog bind:open={createOpen} />
