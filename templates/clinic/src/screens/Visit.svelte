<script lang="ts">
import { ArrowLeft, FileQuestion } from '@lucide/svelte';
import {
  can,
  isValidationError,
  Link,
  liveQuery,
  type RouteProps,
  runService,
  useClock,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Skeleton,
  Textarea,
} from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import StatusBadge from '../components/StatusBadge.svelte';
import { checkInBlocker, patientName, waitMinutes } from '../domain/clinic.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { NOTE_MAX_LENGTH } from '../domain/validation.ts';
import { useClinic } from '../lib/context.ts';
import { formatSpan, formatStamp, formatTime } from '../lib/format.ts';

let { params }: RouteProps = $props();
const { db, services } = useClinic();
const clock = useClock();
const principal = usePrincipal();

const id = () => params.id ?? '';
const visit = liveQuery(
  async () => {
    const appointment = await db.appointments.get(id());
    if (!appointment) return null;
    const [patient, provider, note] = await Promise.all([
      db.patients.get(appointment.patientId),
      db.providers.get(appointment.providerId),
      db.notes.where('appointmentId').equals(appointment.id).first(),
    ]);
    return { appointment, patient, provider, note };
  },
  { initial: undefined, deps: id }
);

let body = $state('');
let noteError = $state<string | undefined>(undefined);
let cancelReason = $state('');
let cancelError = $state<string | undefined>(undefined);
let loadedFor = $state('');
$effect(() => {
  // Load the stored draft once per visit; typing is never overwritten by a live update.
  const current = visit.current;
  if (current && loadedFor !== current.appointment.id) {
    loadedFor = current.appointment.id;
    body = current.note?.body ?? '';
    noteError = undefined;
    cancelReason = '';
    cancelError = undefined;
  }
});

const treating = $derived(
  visit.current?.provider?.personaId != null &&
    visit.current.provider.personaId === principal.current?.persona.id
);
const canWrite = $derived(
  can(CAPABILITIES.notesWrite) &&
    treating &&
    !visit.current?.note?.signedAt &&
    (visit.current?.appointment.status === 'checked-in' ||
      visit.current?.appointment.status === 'completed')
);

const save = () =>
  runService(() => services.notes.save(id(), { body }), { success: 'Draft saved' }).then((r) => {
    noteError = !r.ok && isValidationError(r.error) ? r.error.issues.body : undefined;
  });
const sign = async () => {
  // Signing saves what is typed first, so the signed note is exactly what is on screen.
  const saved = await runService(() => services.notes.save(id(), { body }));
  if (!saved.ok) {
    noteError = isValidationError(saved.error) ? saved.error.issues.body : undefined;
    return;
  }
  const r = await runService(() => services.notes.sign(id()), { success: 'Note signed' });
  noteError = !r.ok && isValidationError(r.error) ? r.error.issues.body : undefined;
};
const checkIn = () =>
  runService(() => services.appointments.checkIn(id()), { success: 'Patient checked in' });
const cancel = () =>
  runService(() => services.appointments.cancel(id(), { reason: cancelReason }), {
    success: 'Appointment cancelled',
  }).then((r) => {
    cancelError = !r.ok && isValidationError(r.error) ? r.error.issues.reason : undefined;
  });
</script>

<Link href="/" class="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
  <LucideIcon icon={ArrowLeft} class="size-4" />Front desk
</Link>

{#if visit.current === undefined}
  <Skeleton class="h-40 w-full" />
{:else if visit.current === null}
  <EmptyState icon={FileQuestion} title="Appointment not found" description="This appointment does not exist in the loaded scenario.">
    {#snippet action()}<Button href="#/" variant="outline">Front desk</Button>{/snippet}
  </EmptyState>
{:else}
  {@const { appointment: a, patient, provider, note } = visit.current}
  {@const blocker = checkInBlocker(a, clock.now)}
  {@const cancellable = a.status === 'scheduled' && Date.parse(a.end) > clock.now.getTime()}
  <header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div class="min-w-0">
      <h1 class="text-2xl font-semibold tracking-tight">{a.reason}: {patientName(patient)}</h1>
      <p class="mt-1 text-sm text-muted-foreground">{formatSpan(a.start, a.end)} · {provider?.name} · {provider?.room}</p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <StatusBadge status={a.status} />
      {#if can(CAPABILITIES.appointmentsManage) && blocker === null}
        <Button onclick={checkIn}>Check in</Button>
      {/if}
    </div>
  </header>

  <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
    <Card class="p-4">
      <h2 class="mb-3 font-semibold">Appointment</h2>
      <dl class="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2 text-sm">
        <dt class="text-muted-foreground">Patient</dt>
        <dd><Link href="/patients/{a.patientId}" class="hover:underline">{patientName(patient)}</Link> <span class="text-muted-foreground tabular-nums">{patient?.mrn}</span></dd>
        <dt class="text-muted-foreground">Provider</dt>
        <dd>{provider?.name} · {provider?.specialty}</dd>
        <dt class="text-muted-foreground">Checked in</dt>
        <dd>
          {a.checkedInAt ? formatTime(a.checkedInAt) : '—'}
          {#if waitMinutes(a, clock.now) > 0}<span class="text-muted-foreground"> · waiting {waitMinutes(a, clock.now)} min</span>{/if}
        </dd>
        {#if a.cancelReason}
          <dt class="text-muted-foreground">Cancel reason</dt>
          <dd>{a.cancelReason}</dd>
        {/if}
      </dl>
      {#if can(CAPABILITIES.appointmentsManage) && blocker !== null && a.status === 'scheduled'}
        <p class="mt-3 text-xs text-muted-foreground">{blocker}.</p>
      {/if}
      {#if can(CAPABILITIES.appointmentsManage) && cancellable}
        <div class="mt-4 grid gap-2">
          <FormField label="Cancel reason (optional)" error={cancelError}>
            {#snippet children(control)}
              <Input {...control.props} bind:value={cancelReason} maxlength={200} placeholder="Patient rescheduled" />
            {/snippet}
          </FormField>
          <div><Button variant="destructive" onclick={cancel}>Cancel appointment</Button></div>
        </div>
      {/if}
    </Card>

    <Card class="p-4" aria-labelledby="note-heading">
      <div class="mb-3 flex items-center justify-between gap-2">
        <h2 id="note-heading" class="font-semibold">Visit note</h2>
        {#if note && can(CAPABILITIES.notesRead)}
          <Badge variant={note.signedAt ? 'secondary' : 'outline'}>{note.signedAt ? `Signed ${formatStamp(note.signedAt)}` : 'Draft'}</Badge>
        {/if}
      </div>
      {#if !can(CAPABILITIES.notesRead)}
        <p class="text-sm text-muted-foreground" role="note">Visit notes are visible to clinicians and admins only.</p>
      {:else if canWrite}
        <div class="grid gap-3">
          <FormField label="Note (plain text)" error={noteError} description="Fictional notes only. Markup is kept as typed and never rendered.">
            {#snippet children(control)}
              <Textarea {...control.props} bind:value={body} rows={9} maxlength={NOTE_MAX_LENGTH} placeholder={'Subjective:\nObjective:\nAssessment:\nPlan:'} />
            {/snippet}
          </FormField>
          <div class="flex flex-wrap gap-2">
            <Button variant="outline" onclick={save}>Save draft</Button>
            <Button onclick={sign}>Sign note</Button>
          </div>
        </div>
      {:else if note}
        <!-- Plain text: shown exactly as typed, never as HTML. -->
        <p class="whitespace-pre-wrap text-sm" data-note-body="">{note.body}</p>
      {:else}
        <p class="text-sm text-muted-foreground">
          {a.status === 'scheduled' ? 'The note can be written once the patient checks in.' : 'No note for this visit.'}
          {#if can(CAPABILITIES.notesWrite) && !treating}Only {provider?.name} can write it.{/if}
        </p>
      {/if}
    </Card>
  </div>
{/if}
