<script lang="ts">
import { ArrowLeft, CalendarPlus, Eye, EyeOff, FileQuestion, Pencil } from '@lucide/svelte';
import {
  can,
  Link,
  liveQuery,
  type RouteProps,
  runService,
  useClock,
} from '@protoyard/renderer-svelte';
import { Badge, Button, Card, EmptyState, Skeleton } from '@protoyard/ui';
import AppointmentDialog from '../components/AppointmentDialog.svelte';
import PatientDialog from '../components/PatientDialog.svelte';
import StatusBadge from '../components/StatusBadge.svelte';
import type { Patient, SensitivePatientField } from '../database/schema.ts';
import { ageOn, mask, patientName } from '../domain/clinic.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import type { PatientInput } from '../domain/validation.ts';
import { useClinic } from '../lib/context.ts';
import { formatSpan, formatStamp } from '../lib/format.ts';

let { params }: RouteProps = $props();
const { db, services } = useClinic();
const clock = useClock();

const id = () => params.id ?? '';
const patient = liveQuery(() => db.patients.get(id()), { deps: id });
const appointments = liveQuery(
  async () => (await db.appointments.where('patientId').equals(id()).sortBy('start')).reverse(),
  { initial: [], deps: id }
);
// Read for everyone, shown only to roles with notes:read (a UX simulation, not access control).
const notes = liveQuery(
  async () => (await db.notes.where('patientId').equals(id()).sortBy('createdAt')).reverse(),
  { initial: [], deps: id }
);
const history = liveQuery(
  async () => (await db.audit.where('patientId').equals(id()).sortBy('at')).reverse().slice(0, 12),
  { initial: [], deps: id }
);
const providers = liveQuery(() => db.providers.toArray(), { initial: [] });
const personas = liveQuery(
  () => db.table('py_personas').toArray() as Promise<{ id: string; name: string }[]>,
  {
    initial: [],
  }
);
const providerName = $derived(new Map((providers.current ?? []).map((p) => [p.id, p.name])));
const personaName = $derived(new Map((personas.current ?? []).map((p) => [p.id, p.name])));
const visitOf = $derived(new Map((appointments.current ?? []).map((a) => [a.id, a])));

/** Revealed values live in memory only, for this patient, until hidden or the page changes. */
let revealed = $state<Pick<Patient, SensitivePatientField> | null>(null);
let revealedFor = $state('');
$effect(() => {
  if (revealedFor !== id()) revealed = null;
});
const reveal = () =>
  runService(() => services.patients.reveal(id())).then((result) => {
    if (result.ok) {
      revealed = result.value;
      revealedFor = id();
    }
  });

let editOpen = $state(false);
let editInitial = $state<PatientInput | null>(null);
async function edit() {
  const p = patient.current;
  if (!p) return;
  // Editing shows the sensitive values, so it reveals them first (and that is audited).
  if (!revealed) await reveal();
  if (!revealed) return;
  editInitial = { firstName: p.firstName, lastName: p.lastName, email: p.email, ...revealed };
  editOpen = true;
}
$effect(() => {
  // After an edit, show the saved values rather than the ones revealed before it.
  const p = patient.current;
  if (p && revealed && revealedFor === p.id) {
    const { dateOfBirth, phone, allergies, insuranceId } = p;
    if (
      JSON.stringify(revealed) !== JSON.stringify({ dateOfBirth, phone, allergies, insuranceId })
    ) {
      revealed = { dateOfBirth, phone, allergies, insuranceId };
    }
  }
});

let bookOpen = $state(false);
let draft = $state<{ start: string; end: string; patientId: string } | null>(null);
function book() {
  const quarter = 15 * 60_000;
  const start = new Date(Math.ceil((clock.now.getTime() + 1) / quarter) * quarter).toISOString();
  draft = { start, end: new Date(Date.parse(start) + 30 * 60_000).toISOString(), patientId: id() };
  bookOpen = true;
}

const sensitive = (field: SensitivePatientField) => (revealed ? revealed[field] || '—' : mask('x'));
</script>

<Link href="/patients" class="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
  <ArrowLeft class="size-4" aria-hidden="true" />Patients
</Link>

{#if patient.current === undefined && patient.loading}
  <Skeleton class="h-40 w-full" />
{:else if !patient.current}
  <EmptyState icon={FileQuestion} title="Patient not found" description="This patient does not exist in the loaded scenario.">
    {#snippet action()}<Button href="#/patients" variant="outline">All patients</Button>{/snippet}
  </EmptyState>
{:else}
  {@const p = patient.current}
  <header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div class="min-w-0">
      <h1 class="text-2xl font-semibold tracking-tight">{patientName(p)}</h1>
      <p class="mt-1 text-sm text-muted-foreground tabular-nums">{p.mrn} · fictional patient</p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      {#if can(CAPABILITIES.patientsReveal)}
        {#if revealed}
          <Button variant="outline" onclick={() => (revealed = null)}><EyeOff class="size-4" aria-hidden="true" />Hide sensitive details</Button>
        {:else}
          <Button variant="outline" onclick={reveal}><Eye class="size-4" aria-hidden="true" />Reveal sensitive details</Button>
        {/if}
      {/if}
      {#if can(CAPABILITIES.patientsManage)}
        <Button variant="outline" onclick={edit}><Pencil class="size-4" aria-hidden="true" />Edit</Button>
      {/if}
      {#if can(CAPABILITIES.appointmentsManage)}
        <Button onclick={book}><CalendarPlus class="size-4" aria-hidden="true" />Book appointment</Button>
      {/if}
    </div>
  </header>

  <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
    <Card class="p-4">
      <h2 class="mb-3 font-semibold">Details</h2>
      <dl class="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2 text-sm" data-patient-details="">
        <dt class="text-muted-foreground">Email</dt>
        <dd class="break-all">{p.email}</dd>
        {#each [['dateOfBirth', 'Date of birth'], ['phone', 'Phone'], ['allergies', 'Allergies'], ['insuranceId', 'Insurance id']] as const as [field, label] (field)}
          <dt class="text-muted-foreground">{label} <Badge variant="outline" class="ml-1">Sensitive</Badge></dt>
          <dd data-sensitive={field} class={revealed ? '' : 'text-muted-foreground'}>
            {#if !revealed}<span class="sr-only">Hidden. </span>{/if}{sensitive(field)}
            {#if revealed && field === 'dateOfBirth'}<span class="text-muted-foreground"> (age {ageOn(revealed.dateOfBirth, clock.now)})</span>{/if}
          </dd>
        {/each}
      </dl>
      {#if !can(CAPABILITIES.patientsReveal)}
        <p class="mt-3 text-xs text-muted-foreground" role="note">Your role cannot reveal sensitive details.</p>
      {/if}
    </Card>

    <Card class="p-4">
      <h2 class="mb-3 font-semibold">Appointments</h2>
      {#if (appointments.current ?? []).length === 0}
        <p class="text-sm text-muted-foreground">No appointments yet.</p>
      {:else}
        <ul class="grid gap-2" aria-label="Appointments">
          {#each (appointments.current ?? []).slice(0, 12) as a (a.id)}
            <li class="flex flex-wrap items-center justify-between gap-2 text-sm">
              <Link href="/visits/{a.id}" class="min-w-0 hover:underline">
                <span class="tabular-nums">{formatSpan(a.start, a.end)}</span> · {a.reason} · {providerName.get(a.providerId)}
              </Link>
              <StatusBadge status={a.status} />
            </li>
          {/each}
        </ul>
      {/if}
    </Card>
  </div>

  <section class="mt-6" aria-labelledby="notes-heading">
    <h2 id="notes-heading" class="mb-3 text-lg font-semibold">Visit notes</h2>
    {#if !can(CAPABILITIES.notesRead)}
      <p class="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground" role="note">
        Visit notes are visible to clinicians and admins only.
      </p>
    {:else if (notes.current ?? []).length === 0}
      <p class="text-sm text-muted-foreground">No visit notes yet.</p>
    {:else}
      <ul class="grid gap-3">
        {#each notes.current ?? [] as n (n.id)}
          {@const visit = visitOf.get(n.appointmentId)}
          <li>
            <Card class="p-4">
              <div class="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <Link href="/visits/{n.appointmentId}" class="font-medium hover:underline">
                  {visit ? `${visit.reason} · ${formatSpan(visit.start, visit.end)}` : 'Visit'}
                </Link>
                <Badge variant={n.signedAt ? 'secondary' : 'outline'}>{n.signedAt ? `Signed by ${personaName.get(n.authorId) ?? n.authorId}` : 'Draft'}</Badge>
              </div>
              <!-- Plain text: shown exactly as typed, never as HTML. -->
              <p class="whitespace-pre-wrap text-sm">{n.body}</p>
            </Card>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if can(CAPABILITIES.auditRead)}
    <section class="mt-6" aria-labelledby="history-heading">
      <h2 id="history-heading" class="mb-3 text-lg font-semibold">Access and changes</h2>
      <ul class="grid gap-1 text-sm" aria-label="Access and changes">
        {#each history.current ?? [] as h (h.id)}
          <li><span class="text-muted-foreground tabular-nums">{formatStamp(h.at)}</span> · {personaName.get(h.actorId) ?? h.actorId}: {h.summary}</li>
        {:else}
          <li class="text-muted-foreground">Nothing recorded yet.</li>
        {/each}
      </ul>
    </section>
  {/if}

  <PatientDialog bind:open={editOpen} patientId={p.id} initial={editInitial} />
  <AppointmentDialog bind:open={bookOpen} providers={providers.current ?? []} initial={draft} />
{/if}
