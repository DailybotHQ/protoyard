<script lang="ts">
import { PencilLine } from '@lucide/svelte';
import { can, isValidationError, liveQuery, runService } from '@protoyard/renderer-svelte';
import { Button, Card, Dialog, FormField, Input } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import PageHeader from '../components/PageHeader.svelte';
import type { AvailabilityRule } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useBooking } from '../lib/context.ts';
import { formatMinute, WEEKDAYS } from '../lib/format.ts';

const { db, services } = useBooking();
const data = liveQuery(
  async () => {
    const [resources, rules] = await Promise.all([
      db.resources.toArray(),
      db.availability.toArray(),
    ]);
    return resources.map((r) => ({
      resource: r,
      rules: rules.filter((x) => x.resourceId === r.id).sort((a, b) => a.weekday - b.weekday),
    }));
  },
  { initial: undefined }
);

let editing = $state<AvailabilityRule | null>(null);
let open = $state(false);
let form = $state({ start: '', end: '' });
let errors = $state<Record<string, string>>({});
let saving = $state(false);
const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

function edit(rule: AvailabilityRule) {
  editing = rule;
  form = { start: formatMinute(rule.startMinute), end: formatMinute(rule.endMinute) };
  errors = {};
  open = true;
}

async function submit(event: SubmitEvent) {
  event.preventDefault();
  if (!editing) return;
  const rule = editing;
  saving = true;
  const result = await runService(
    () =>
      services.availability.update(rule.id, {
        startMinute: toMinutes(form.start),
        endMinute: toMinutes(form.end),
      }),
    { success: 'Opening hours saved' }
  );
  saving = false;
  if (result.ok) open = false;
  else if (isValidationError(result.error)) errors = result.error.issues;
}
</script>

<PageHeader title="Resources" description="Rooms and people, and the weekly hours they can be booked (UTC). Changing hours keeps existing bookings." />

<div class="grid gap-4 md:grid-cols-2" aria-busy={data.current === undefined}>
  {#each data.current ?? [] as { resource, rules } (resource.id)}
    <Card class="p-5">
      <h2 class="font-semibold">{resource.name}</h2>
      <p class="text-sm text-muted-foreground">{resource.description} · {resource.kind === 'room' ? `up to ${resource.capacity} people` : 'one client at a time'}</p>
      <table class="mt-3 w-full text-sm">
        <caption class="sr-only">Opening hours of {resource.name}</caption>
        <thead class="text-left text-xs text-muted-foreground">
          <tr><th scope="col" class="py-1 font-medium">Day</th><th scope="col" class="py-1 font-medium">Hours (UTC)</th><th scope="col"><span class="sr-only">Actions</span></th></tr>
        </thead>
        <tbody>
          {#each rules as rule (rule.id)}
            <tr class="border-t border-border">
              <th scope="row" class="py-1.5 text-left font-normal">{WEEKDAYS[rule.weekday]}</th>
              <td class="py-1.5 tabular-nums">{formatMinute(rule.startMinute)}–{formatMinute(rule.endMinute)}</td>
              <td class="py-1 text-right">
                {#if can(CAPABILITIES.availabilityManage)}
                  <Button variant="ghost" size="sm" onclick={() => edit(rule)}><LucideIcon icon={PencilLine} class="size-4" /><span class="sr-only">Edit {WEEKDAYS[rule.weekday]} hours of {resource.name}</span></Button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </Card>
  {/each}
</div>

<Dialog bind:open title="Opening hours" description={editing ? `${WEEKDAYS[editing.weekday]}, in UTC` : undefined}>
  <form id="hours-form" class="grid grid-cols-2 gap-4" onsubmit={submit} novalidate>
    <FormField label="Opens" required error={errors.startMinute}>
      {#snippet children(control)}<Input {...control.props} type="time" step={900} bind:value={form.start} />{/snippet}
    </FormField>
    <FormField label="Closes" required error={errors.endMinute}>
      {#snippet children(control)}<Input {...control.props} type="time" step={900} bind:value={form.end} />{/snippet}
    </FormField>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button type="submit" form="hours-form" loading={saving}>Save hours</Button>
  {/snippet}
</Dialog>
