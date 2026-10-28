<script lang="ts">
import { isValidationError, liveQuery, runService } from '@protoyard/renderer-svelte';
import { Button, Dialog, FormField, Input, Select } from '@protoyard/ui';
import { type Provider, VISIT_REASONS } from '../database/schema.ts';
import { patientName } from '../domain/clinic.ts';
import { useClinic } from '../lib/context.ts';
import { formatSpan } from '../lib/format.ts';

/**
 * The front desk books an appointment: a patient (searched by name or MRN),
 * a provider, a time and a reason. Validation and conflict errors render
 * inline; others toast.
 */
let {
  open = $bindable(false),
  providers,
  initial,
}: {
  open?: boolean;
  providers: readonly Provider[];
  /** The slot clicked (start/end ISO), and a provider or patient to preselect. */
  initial: { start: string; end: string; providerId?: string; patientId?: string } | null;
} = $props();

const { db, services } = useClinic();
const DURATIONS = [15, 30, 45, 60, 90, 120].map((m) => ({
  value: String(m),
  label: m < 60 ? `${m} min` : m === 60 ? '1 h' : `${m / 60} h`,
}));
const REASONS = VISIT_REASONS.map((r) => ({ value: r, label: r }));
let form = $state({
  patientId: '',
  providerId: '',
  reason: 'Follow-up',
  date: '',
  time: '',
  minutes: '30',
});
let search = $state('');
let errors = $state<Record<string, string>>({});
let saving = $state(false);

$effect(() => {
  if (!open || !initial) return;
  const minutes = Math.max(
    15,
    Math.round((Date.parse(initial.end) - Date.parse(initial.start)) / 60_000)
  );
  form = {
    patientId: initial.patientId ?? '',
    providerId: initial.providerId ?? providers[0]?.id ?? '',
    reason: 'Follow-up',
    date: initial.start.slice(0, 10),
    time: initial.start.slice(11, 16),
    minutes: String(DURATIONS.some((d) => d.value === String(minutes)) ? minutes : 30),
  };
  search = '';
  errors = {};
});

/** At most six matches by name or MRN, so 2,000 patients never render at once. */
const matches = liveQuery(
  () => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return db.patients
      .filter(
        (p) =>
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
          p.mrn.toLowerCase().includes(q)
      )
      .limit(6)
      .toArray();
  },
  { initial: [], deps: () => search }
);
const chosen = liveQuery(() => (form.patientId ? db.patients.get(form.patientId) : undefined), {
  deps: () => form.patientId,
});

const start = $derived(form.date && form.time ? `${form.date}T${form.time}:00.000Z` : '');
const end = $derived(
  start ? new Date(Date.parse(start) + Number(form.minutes) * 60_000).toISOString() : ''
);

async function submit(event: SubmitEvent) {
  event.preventDefault();
  saving = true;
  const result = await runService(
    () =>
      services.appointments.book({
        patientId: form.patientId,
        providerId: form.providerId,
        reason: form.reason,
        start,
        end,
      }),
    { success: 'Appointment booked' }
  );
  saving = false;
  if (result.ok) open = false;
  else if (isValidationError(result.error)) errors = result.error.issues;
}
</script>

<Dialog bind:open title="Book appointment" description={start && end && !Number.isNaN(Date.parse(start)) ? formatSpan(start, end) : 'Times are in UTC.'} size="lg">
  <form id="appointment-form" class="grid gap-4 sm:grid-cols-2" onsubmit={submit} novalidate>
    <div class="grid gap-2 sm:col-span-2">
      <FormField label="Patient" required error={errors.patientId} description={chosen.current ? `${patientName(chosen.current)} · ${chosen.current.mrn}` : 'Search by name or MRN.'}>
        {#snippet children(control)}
          <Input {...control.props} type="search" bind:value={search} placeholder="Type at least two letters" autocomplete="off" />
        {/snippet}
      </FormField>
      {#if (matches.current ?? []).length > 0}
        <ul class="grid gap-1" aria-label="Matching patients">
          {#each matches.current ?? [] as p (p.id)}
            <li>
              <Button
                variant={form.patientId === p.id ? 'secondary' : 'ghost'}
                size="sm"
                class="w-full justify-between"
                aria-pressed={form.patientId === p.id}
                onclick={() => {
                  form.patientId = p.id;
                  search = '';
                }}
              >
                <span>{patientName(p)}</span><span class="text-xs text-muted-foreground tabular-nums">{p.mrn}</span>
              </Button>
            </li>
          {/each}
        </ul>
      {:else if search.trim().length >= 2}
        <p class="text-sm text-muted-foreground">No patient matches “{search.trim()}”.</p>
      {/if}
    </div>
    <FormField label="Provider" required error={errors.providerId}>
      {#snippet children(control)}
        <Select {...control.props} items={providers.map((p) => ({ value: p.id, label: `${p.name} · ${p.specialty}` }))} bind:value={form.providerId} />
      {/snippet}
    </FormField>
    <FormField label="Reason" required error={errors.reason}>
      {#snippet children(control)}
        <Select {...control.props} items={REASONS} bind:value={form.reason} />
      {/snippet}
    </FormField>
    <FormField label="Date (UTC)" required error={errors.start}>
      {#snippet children(control)}
        <Input {...control.props} type="date" bind:value={form.date} />
      {/snippet}
    </FormField>
    <div class="grid grid-cols-2 gap-3">
      <FormField label="Start (UTC)" required>
        {#snippet children(control)}
          <Input {...control.props} type="time" step={900} bind:value={form.time} />
        {/snippet}
      </FormField>
      <FormField label="Length" required error={errors.end}>
        {#snippet children(control)}
          <Select {...control.props} items={DURATIONS} bind:value={form.minutes} />
        {/snippet}
      </FormField>
    </div>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button type="submit" form="appointment-form" loading={saving}>Book appointment</Button>
  {/snippet}
</Dialog>
