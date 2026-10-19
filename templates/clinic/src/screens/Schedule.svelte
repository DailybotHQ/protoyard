<script lang="ts">
import { can, liveQuery, navigate } from '@protoyard/renderer-svelte';
import { Select } from '@protoyard/ui';
import type { CalendarSeries } from '@protoyard/views/calendar';
import { type CalendarSlot, CalendarView } from '@protoyard/views-ui/calendar';
import AppointmentDialog from '../components/AppointmentDialog.svelte';
import PageHeader from '../components/PageHeader.svelte';
import type { Appointment } from '../database/schema.ts';
import { patientName, STATUS_LABELS } from '../domain/clinic.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useClinic } from '../lib/context.ts';

const { db } = useClinic();

let providerId = $state('all');
const providers = liveQuery(() => db.providers.toArray(), { initial: [] });
// Re-runs when appointments change (services, scenario loads, the timeline) and when the filter changes.
const data = liveQuery(
  async () => {
    const rows = (
      providerId === 'all'
        ? await db.appointments.toArray()
        : await db.appointments.where('providerId').equals(providerId).toArray()
    ).filter((a) => a.status !== 'cancelled');
    const patients = await db.patients.bulkGet([...new Set(rows.map((a) => a.patientId))]);
    return {
      rows,
      names: new Map(patients.filter((p) => p !== undefined).map((p) => [p.id, patientName(p)])),
    };
  },
  { initial: undefined, deps: () => providerId }
);
const providerName = $derived(new Map((providers.current ?? []).map((p) => [p.id, p.name])));
/** Appointments as calendar series (cancelled ones are left out: they free their time). */
const series = {
  get current(): CalendarSeries<Appointment>[] | undefined {
    return data.current?.rows.map((a) => ({ id: a.id, start: a.start, end: a.end, data: a }));
  },
  get loading() {
    return data.loading;
  },
  get error() {
    return data.error;
  },
};

let bookOpen = $state(false);
let draft = $state<{ start: string; end: string; providerId?: string } | null>(null);
const canManage = $derived(can(CAPABILITIES.appointmentsManage));

function create(slot: CalendarSlot) {
  const start = slot.allDay ? `${slot.date}T09:00:00.000Z` : slot.start;
  draft = {
    start,
    end: slot.allDay ? `${slot.date}T09:30:00.000Z` : slot.end,
    ...(providerId !== 'all' ? { providerId } : {}),
  };
  bookOpen = true;
  // The form books the appointment; the calendar must not announce one yet.
  return false;
}

const titleOf = (a: Appointment | undefined) =>
  a
    ? `${data.current?.names.get(a.patientId) ?? 'Patient'} · ${a.reason}${providerId === 'all' ? ` · ${providerName.get(a.providerId) ?? ''}` : ''} (${STATUS_LABELS[a.status]})`
    : 'Appointment';
const toneOf = (a: Appointment | undefined) =>
  !a
    ? 'neutral'
    : a.status === 'no-show'
      ? 'danger'
      : a.status === 'completed'
        ? 'success'
        : a.status === 'checked-in'
          ? 'warning'
          : 'primary';
</script>

<PageHeader title="Schedule" description="Provider schedules in UTC. Click a free slot to book; open an appointment to see the visit.">
  {#snippet actions()}
    <label class="grid gap-1 text-xs text-muted-foreground">
      Provider
      <Select
        aria-label="Provider"
        items={[{ value: 'all', label: 'All providers' }, ...(providers.current ?? []).map((p) => ({ value: p.id, label: p.name }))]}
        bind:value={providerId}
      />
    </label>
  {/snippet}
</PageHeader>

<CalendarView
  query={series}
  label="Provider schedule"
  timeZone="UTC"
  getTitle={(o) => titleOf(o.data)}
  getTone={(o) => toneOf(o.data)}
  onCreate={canManage ? create : undefined}
  onOpen={(o) => {
    if (o.data) navigate(`/visits/${o.data.id}`);
  }}
/>

<AppointmentDialog bind:open={bookOpen} providers={providers.current ?? []} initial={draft} />
