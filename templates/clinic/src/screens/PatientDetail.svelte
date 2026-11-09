<script lang="ts">
import { ArrowLeft, CalendarPlus, Eye, EyeOff, FileQuestion, Pencil } from '@lucide/svelte';
import { can, liveQuery, type RouteProps, runService, useClock } from '@protoyard/renderer-svelte';
import { Badge, Button, Card, EmptyState, Skeleton } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Heading, Text } from 'texuli/typography';
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

<Button variant="ghost" size="sm" href="#/patients" class="mb-4 -ml-2">
  <LucideIcon icon={ArrowLeft} class="size-4" />Patients
</Button>

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
      <Heading level={1} size="xl">{patientName(p)}</Heading>
      <Text size="sm" tone="muted" tabular class="mt-1">{p.mrn} · fictional patient</Text>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      {#if can(CAPABILITIES.patientsReveal)}
        {#if revealed}
          <Button variant="outline" onclick={() => (revealed = null)}><LucideIcon icon={EyeOff} class="size-4" />Hide sensitive details</Button>
        {:else}
          <Button variant="outline" onclick={reveal}><LucideIcon icon={Eye} class="size-4" />Reveal sensitive details</Button>
        {/if}
      {/if}
      {#if can(CAPABILITIES.patientsManage)}
        <Button variant="outline" onclick={edit}><LucideIcon icon={Pencil} class="size-4" />Edit</Button>
      {/if}
      {#if can(CAPABILITIES.appointmentsManage)}
        <Button onclick={book}><LucideIcon icon={CalendarPlus} class="size-4" />Book appointment</Button>
      {/if}
    </div>
  </header>

  <div class="patient-grid grid gap-6">
    <Card class="p-4">
      <Heading level={2} size="sm" class="mb-3">Details</Heading>
      <dl class="patient-dl grid gap-x-4 gap-y-2" data-patient-details="">
        <dt><Text as="span" size="sm" tone="muted">Email</Text></dt>
        <dd class="break-all"><Text as="span" size="sm">{p.email}</Text></dd>
        {#each [['dateOfBirth', 'Date of birth'], ['phone', 'Phone'], ['allergies', 'Allergies'], ['insuranceId', 'Insurance id']] as const as [field, label] (field)}
          <dt><Text as="span" size="sm" tone="muted">{label}</Text> <Badge variant="outline" class="ml-1">Sensitive</Badge></dt>
          <dd data-sensitive={field}>
            <Text as="span" size="sm" tone={revealed ? 'default' : 'muted'}>
              {#if !revealed}<span class="sr-only">Hidden. </span>{/if}{sensitive(field)}
              {#if revealed && field === 'dateOfBirth'}<Text as="span" size="sm" tone="muted"> (age {ageOn(revealed.dateOfBirth, clock.now)})</Text>{/if}
            </Text>
          </dd>
        {/each}
      </dl>
      {#if !can(CAPABILITIES.patientsReveal)}
        <Text size="xs" tone="muted" role="note" class="mt-3">Your role cannot reveal sensitive details.</Text>
      {/if}
    </Card>

    <Card class="p-4">
      <Heading level={2} size="sm" class="mb-3">Appointments</Heading>
      {#if (appointments.current ?? []).length === 0}
        <Text size="sm" tone="muted">No appointments yet.</Text>
      {:else}
        <ul class="grid gap-2" aria-label="Appointments">
          {#each (appointments.current ?? []).slice(0, 12) as a (a.id)}
            <li class="flex flex-wrap items-center justify-between gap-2">
              <Button variant="link" size="sm" href="#/visits/{a.id}" class="h-auto min-w-0 shrink justify-start p-0 text-left whitespace-normal">
                <span><Text as="span" size="sm" tabular>{formatSpan(a.start, a.end)}</Text> · {a.reason} · {providerName.get(a.providerId)}</span>
              </Button>
              <StatusBadge status={a.status} />
            </li>
          {/each}
        </ul>
      {/if}
    </Card>
  </div>

  <section class="mt-6" aria-labelledby="notes-heading">
    <Heading level={2} size="md" id="notes-heading" class="mb-3">Visit notes</Heading>
    {#if !can(CAPABILITIES.notesRead)}
      <Box border="default" radius="lg" padding="md" role="note">
        <Text size="sm" tone="muted">Visit notes are visible to clinicians and admins only.</Text>
      </Box>
    {:else if (notes.current ?? []).length === 0}
      <Text size="sm" tone="muted">No visit notes yet.</Text>
    {:else}
      <ul class="grid gap-3">
        {#each notes.current ?? [] as n (n.id)}
          {@const visit = visitOf.get(n.appointmentId)}
          <li>
            <Card class="p-4">
              <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Button variant="link" size="sm" href="#/visits/{n.appointmentId}" class="h-auto min-w-0 shrink justify-start p-0 text-left whitespace-normal">
                  {visit ? `${visit.reason} · ${formatSpan(visit.start, visit.end)}` : 'Visit'}
                </Button>
                <Badge variant={n.signedAt ? 'secondary' : 'outline'}>{n.signedAt ? `Signed by ${personaName.get(n.authorId) ?? n.authorId}` : 'Draft'}</Badge>
              </div>
              <!-- Plain text: shown exactly as typed, never as HTML. -->
              <Text size="sm" class="whitespace-pre-wrap">{n.body}</Text>
            </Card>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if can(CAPABILITIES.auditRead)}
    <section class="mt-6" aria-labelledby="history-heading">
      <Heading level={2} size="md" id="history-heading" class="mb-3">Access and changes</Heading>
      <ul class="grid gap-1" aria-label="Access and changes">
        {#each history.current ?? [] as h (h.id)}
          <li><Text as="span" size="sm"><Text as="span" size="sm" tone="muted" tabular>{formatStamp(h.at)}</Text> · {personaName.get(h.actorId) ?? h.actorId}: {h.summary}</Text></li>
        {:else}
          <li><Text as="span" size="sm" tone="muted">Nothing recorded yet.</Text></li>
        {/each}
      </ul>
    </section>
  {/if}

  <PatientDialog bind:open={editOpen} patientId={p.id} initial={editInitial} />
  <AppointmentDialog bind:open={bookOpen} providers={providers.current ?? []} initial={draft} />
{/if}

<style>
  @media (min-width: 64rem) {
    .patient-grid {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
    }
  }
  .patient-dl {
    grid-template-columns: minmax(7rem, auto) 1fr;
  }
</style>
