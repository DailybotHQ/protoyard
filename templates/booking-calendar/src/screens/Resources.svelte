<script lang="ts">
import { PencilLine } from '@lucide/svelte';
import { can, isValidationError, liveQuery, runService } from '@protoyard/renderer-svelte';
import { Button, Card, Dialog, FormField, Input } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'texuli/table';
import { Heading, Text } from 'texuli/typography';
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
      <Heading level={2} size="sm">{resource.name}</Heading>
      <Text size="sm" tone="muted">{resource.description} · {resource.kind === 'room' ? `up to ${resource.capacity} people` : 'one client at a time'}</Text>
      <Table density="compact" wrapperClass="mt-3" class="w-full">
        <TableCaption class="sr-only">Opening hours of {resource.name}</TableCaption>
        <TableHeader>
          <TableRow><TableHead scope="col">Day</TableHead><TableHead scope="col">Hours (UTC)</TableHead><TableHead scope="col"><span class="sr-only">Actions</span></TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {#each rules as rule (rule.id)}
            <TableRow>
              <TableHead scope="row">{WEEKDAYS[rule.weekday]}</TableHead>
              <TableCell><Text as="span" size="sm" tabular>{formatMinute(rule.startMinute)}–{formatMinute(rule.endMinute)}</Text></TableCell>
              <TableCell align="end">
                {#if can(CAPABILITIES.availabilityManage)}
                  <Button variant="ghost" size="sm" onclick={() => edit(rule)}><LucideIcon icon={PencilLine} class="size-4" /><span class="sr-only">Edit {WEEKDAYS[rule.weekday]} hours of {resource.name}</span></Button>
                {/if}
              </TableCell>
            </TableRow>
          {/each}
        </TableBody>
      </Table>
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
