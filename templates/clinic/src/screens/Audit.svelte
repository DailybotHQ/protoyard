<script lang="ts">
import { ShieldCheck } from '@lucide/svelte';
import { can, liveQuery } from '@protoyard/renderer-svelte';
import { DataTable, type DataTableColumn, EmptyState } from '@protoyard/ui';
import PageHeader from '../components/PageHeader.svelte';
import type { AuditEntry } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useClinic } from '../lib/context.ts';
import { formatStamp } from '../lib/format.ts';

const { db } = useClinic();
const data = liveQuery(
  async () => {
    const [entries, personas] = await Promise.all([
      db.audit.orderBy('at').reverse().toArray(),
      db.table('py_personas').toArray() as Promise<{ id: string; name: string }[]>,
    ]);
    return { entries, names: new Map(personas.map((p) => [p.id, p.name])) };
  },
  { initial: undefined }
);
let search = $state('');

const ACTION_LABELS: Record<AuditEntry['action'], string> = {
  'patient.created': 'Patient registered',
  'patient.updated': 'Patient updated',
  'patient.revealed': 'Sensitive details viewed',
  'appointment.booked': 'Appointment booked',
  'appointment.checked_in': 'Checked in',
  'appointment.cancelled': 'Appointment cancelled',
  'note.saved': 'Note saved',
  'note.signed': 'Note signed',
};
const columns: DataTableColumn<AuditEntry>[] = [
  { key: 'at', header: 'When (UTC)', accessor: (e) => e.at, cell: whenCell, sortable: true },
  {
    key: 'actor',
    header: 'Who',
    accessor: (e) => data.current?.names.get(e.actorId) ?? e.actorId,
    sortable: true,
  },
  {
    key: 'action',
    header: 'Action',
    accessor: (e) => ACTION_LABELS[e.action],
    sortable: true,
    hideBelow: 'sm',
  },
  { key: 'summary', header: 'Summary', accessor: (e) => e.summary, cell: summaryCell },
];
</script>

{#snippet whenCell(e: AuditEntry)}<span class="whitespace-nowrap tabular-nums">{formatStamp(e.at)}</span>{/snippet}
{#snippet summaryCell(e: AuditEntry)}
  <span>{e.summary}</span>
  {#if e.changes.length > 0}
    <ul class="mt-1 grid gap-0.5 text-xs text-muted-foreground" aria-label="Changed fields">
      {#each e.changes as c (c.field)}
        <li><span class="font-medium">{c.field}</span>: {c.from ?? '—'} → {c.to ?? '—'}</li>
      {/each}
    </ul>
  {/if}
{/snippet}

<PageHeader title="Audit log" description="Every change and every view of sensitive details, newest first. Sensitive values are never stored here: they read [redacted]." />

{#if !can(CAPABILITIES.auditRead)}
  <EmptyState icon={ShieldCheck} title="Admins and reviewers only" description="Your role cannot open the audit log. Switch to the admin or the read-only reviewer persona." />
{:else}
  <DataTable
    caption="Audit log"
    rows={data.current?.entries ?? []}
    {columns}
    getRowId={(e) => e.id}
    bind:search
    searchFn={(e, q) => `${e.summary} ${ACTION_LABELS[e.action]} ${data.current?.names.get(e.actorId) ?? ''}`.toLowerCase().includes(q.toLowerCase())}
    searchPlaceholder="Search the log"
    pageSize={25}
    loading={data.current === undefined}
    emptyTitle={search ? 'Nothing matches' : 'Nothing recorded yet'}
  />
{/if}
