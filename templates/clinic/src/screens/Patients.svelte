<script lang="ts">
import { UserPlus } from '@lucide/svelte';
import { can, liveQuery, navigate, useClock } from '@protoyard/renderer-svelte';
import { Button, DataTable, type DataTableColumn } from '@protoyard/ui';
import PageHeader from '../components/PageHeader.svelte';
import PatientDialog from '../components/PatientDialog.svelte';
import type { Patient } from '../database/schema.ts';
import { mask, patientName } from '../domain/clinic.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useClinic } from '../lib/context.ts';
import { fromNow } from '../lib/format.ts';

const { db } = useClinic();
const clock = useClock();
const patients = liveQuery(() => db.patients.orderBy('lastName').toArray(), { initial: undefined });
let search = $state('');
let registerOpen = $state(false);
const canManage = $derived(can(CAPABILITIES.patientsManage));

const columns: DataTableColumn<Patient>[] = [
  {
    key: 'name',
    header: 'Patient',
    accessor: (p) => `${p.lastName}, ${p.firstName}`,
    cell: nameCell,
    sortable: true,
  },
  { key: 'mrn', header: 'MRN', accessor: (p) => p.mrn, sortable: true, hideBelow: 'sm' },
  { key: 'email', header: 'Email', accessor: (p) => p.email, hideBelow: 'md' },
  { key: 'dob', header: 'Date of birth', accessor: () => '', cell: maskedCell, hideBelow: 'md' },
  {
    key: 'created',
    header: 'Registered',
    accessor: (p) => p.createdAt,
    cell: createdCell,
    sortable: true,
    hideBelow: 'lg',
  },
];
</script>

{#snippet nameCell(p: Patient)}<span class="font-medium">{patientName(p)}</span>{/snippet}
{#snippet maskedCell(p: Patient)}<span class="text-muted-foreground" aria-label="Hidden: sensitive">{mask(p.dateOfBirth)}</span>{/snippet}
{#snippet createdCell(p: Patient)}<span class="text-muted-foreground">{fromNow(p.createdAt, clock.now)}</span>{/snippet}

<PageHeader title="Patients" description="Fictional patients only. Sensitive fields stay masked until revealed on the patient's page, which is audited.">
  {#snippet actions()}
    {#if canManage}
      <Button onclick={() => (registerOpen = true)}><UserPlus class="size-4" aria-hidden="true" />Register patient</Button>
    {/if}
  {/snippet}
</PageHeader>

<DataTable
  caption="Patients"
  rows={patients.current ?? []}
  {columns}
  getRowId={(p) => p.id}
  bind:search
  searchFn={(p, q) => `${p.firstName} ${p.lastName} ${p.mrn} ${p.email}`.toLowerCase().includes(q.toLowerCase())}
  searchPlaceholder="Search by name, MRN or email"
  pageSize={20}
  loading={patients.current === undefined}
  emptyTitle={search ? 'No patient matches' : 'No patients yet'}
  emptyDescription={search ? 'Try a last name or an MRN such as MRN-000012.' : canManage ? 'Register the first fictional patient.' : undefined}
  onRowClick={(p) => navigate(`/patients/${p.id}`)}
  rowLabel={(p) => `Open ${patientName(p)}`}
/>

<PatientDialog bind:open={registerOpen} />
