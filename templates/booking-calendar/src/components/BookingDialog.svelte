<script lang="ts">
import { isValidationError, runService } from '@protoyard/renderer-svelte';
import { Button, Dialog, FormField, Input, Select } from '@protoyard/ui';
import type { Resource } from '../database/schema.ts';
import { useBooking } from '../lib/context.ts';
import { formatSpan } from '../lib/format.ts';

/** Staff books a slot. Validation and conflict errors render inline; others toast. */
let {
  open = $bindable(false),
  resources,
  initial,
}: {
  open?: boolean;
  resources: readonly Resource[];
  /** The calendar slot clicked (start/end ISO) and a resource to preselect. */
  initial: { start: string; end: string; resourceId?: string } | null;
} = $props();

const { services } = useBooking();
const DURATIONS = [30, 60, 90, 120, 180, 240].map((m) => ({
  value: String(m),
  label: m < 60 ? `${m} min` : `${m / 60} h`,
}));
let form = $state({
  resourceId: '',
  title: '',
  customerName: '',
  customerEmail: '',
  date: '',
  time: '',
  minutes: '60',
});
let errors = $state<Record<string, string>>({});
let saving = $state(false);

$effect(() => {
  if (!open || !initial) return;
  const minutes = Math.max(
    30,
    Math.round((Date.parse(initial.end) - Date.parse(initial.start)) / 60_000)
  );
  form = {
    resourceId: initial.resourceId ?? resources[0]?.id ?? '',
    title: '',
    customerName: '',
    customerEmail: '',
    date: initial.start.slice(0, 10),
    time: initial.start.slice(11, 16),
    minutes: String(DURATIONS.some((d) => d.value === String(minutes)) ? minutes : 60),
  };
  errors = {};
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
      services.bookings.create({
        resourceId: form.resourceId,
        title: form.title,
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        start,
        end,
      }),
    { success: 'Booking confirmed' }
  );
  saving = false;
  if (result.ok) open = false;
  else if (isValidationError(result.error)) errors = result.error.issues;
}
</script>

<Dialog bind:open title="New booking" description={start && end && !Number.isNaN(Date.parse(start)) ? formatSpan(start, end) : 'Times are in UTC.'} size="lg">
  <form id="booking-form" class="grid gap-4 sm:grid-cols-2" onsubmit={submit} novalidate>
    <FormField label="Resource" required error={errors.resourceId}>
      {#snippet children(control)}
        <Select {...control.props} items={resources.map((r) => ({ value: r.id, label: r.name }))} bind:value={form.resourceId} />
      {/snippet}
    </FormField>
    <FormField label="Title" required error={errors.title}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={form.title} placeholder="Client workshop" autocomplete="off" maxlength={80} />
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
          <Input {...control.props} type="time" step="900" bind:value={form.time} />
        {/snippet}
      </FormField>
      <FormField label="Length" required error={errors.end}>
        {#snippet children(control)}
          <Select {...control.props} items={DURATIONS} bind:value={form.minutes} />
        {/snippet}
      </FormField>
    </div>
    <FormField label="Customer name" required error={errors.customerName}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={form.customerName} placeholder="Ada Lovelace" autocomplete="off" maxlength={80} />
      {/snippet}
    </FormField>
    <FormField label="Customer email" required error={errors.customerEmail} description="Prototype data: @example.com only.">
      {#snippet children(control)}
        <Input {...control.props} type="email" bind:value={form.customerEmail} placeholder="ada@example.com" autocomplete="off" />
      {/snippet}
    </FormField>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button type="submit" form="booking-form" loading={saving}>Confirm booking</Button>
  {/snippet}
</Dialog>
