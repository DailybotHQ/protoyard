<script lang="ts">
import { ScrollText, SearchX } from '@lucide/svelte';
import { liveQuery } from '@protoyard/renderer-svelte';
import { DataTable, type DataTableColumn, EmptyState, ErrorState, Select } from '@protoyard/ui';
import PageHeader from '../components/PageHeader.svelte';
import { AUDIT_LABELS, type AuditEvent, type AuditType } from '../domain/services.ts';
import { useAdmin } from '../lib/context.ts';
import { formatDateTime, plural } from '../lib/format.ts';
import { auditLog } from '../lib/queries.ts';

type Row = AuditEvent & { actor: string; label: string; message: string; reason: string };

const { db } = useAdmin();
const personas = liveQuery(
  () => db.table<{ id: string; name: string }, string>('py_personas').toArray(),
  { initial: [] }
);
const events = liveQuery(() => auditLog(db), { initial: [] });
const rows = $derived.by((): Row[] => {
  const names = new Map((personas.current ?? []).map((p) => [p.id, p.name]));
  return (events.current ?? []).map((e) => ({
    ...e,
    actor: names.get(e.actorId ?? '') ?? 'System',
    label: AUDIT_LABELS[e.type as AuditType] ?? e.type,
    message: e.payload.message,
    reason: e.payload.reason ?? '',
  }));
});
let type = $state('all');
const filtered = $derived(rows.filter((r) => type === 'all' || r.type === type));

const columns: DataTableColumn<Row>[] = [
  { key: 'at', header: 'When', sortable: true, accessor: (r) => formatDateTime(r.at) },
  { key: 'label', header: 'Action', sortable: true },
  { key: 'message', header: 'Details', cell: detailsCell },
  { key: 'actor', header: 'Staff', sortable: true, hideBelow: 'md' },
  {
    key: 'source',
    header: 'Source',
    hideBelow: 'lg',
    accessor: (r) => (r.source === 'user' ? 'This session' : 'Seed history'),
  },
];
</script>

{#snippet detailsCell(r: Row)}
  <span class="min-w-0">
    <span class="block">{r.message}</span>
    {#if r.reason}<span class="block text-xs text-muted-foreground">Reason: {r.reason}</span>{/if}
  </span>
{/snippet}

<PageHeader title="Audit log" description={`${plural(rows.length, 'entry', )} · written in the same transaction as each staff action`} />

{#if events.error}
  <ErrorState title="Could not load the audit log" message={String(events.error)} />
{:else}
  <DataTable
    {columns}
    rows={filtered}
    getRowId={(r) => r.id}
    searchKeys={['message', 'actor', 'label', 'reason']}
    searchPlaceholder="Search actions, people, reasons…"
    pageSize={20}
    loading={events.loading}
    sort={{ key: 'at', direction: 'desc' }}
    caption="Audit log"
  >
    {#snippet empty({ query })}
      <EmptyState
        size="sm"
        icon={query ? SearchX : ScrollText}
        title={query ? `Nothing matches “${query.trim()}”` : 'No audit entries yet'}
        description={query ? 'Try another search or action type.' : 'Staff actions are recorded here as they happen.'}
      />
    {/snippet}
    {#snippet filters()}
      <Select
        aria-label="Filter by action"
        class="w-full sm:w-56"
        items={[{ value: 'all', label: 'All actions' }, ...Object.entries(AUDIT_LABELS).map(([value, label]) => ({ value, label }))]}
        bind:value={type}
      />
    {/snippet}
  </DataTable>
{/if}
