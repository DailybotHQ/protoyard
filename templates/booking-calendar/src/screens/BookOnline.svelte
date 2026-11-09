<script lang="ts">
import { CircleCheck } from '@lucide/svelte';
import {
  can,
  isValidationError,
  liveQuery,
  runService,
  useClock,
} from '@protoyard/renderer-svelte';
import { Button, Card, EmptyState, FormField, Input } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Heading, Text } from 'texuli/typography';
import PageHeader from '../components/PageHeader.svelte';
import type { Booking } from '../database/schema.ts';
import { freeSlots } from '../domain/booking.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useBooking } from '../lib/context.ts';
import { formatDay, formatSpan, formatTime } from '../lib/format.ts';

/**
 * The public booking page: a client picks a resource, a day, a length and a
 * free slot (computed from opening hours minus confirmed bookings), then
 * confirms. The service re-checks the slot inside its transaction, so a slot
 * taken meanwhile is refused with a clear message.
 */
const { db, services } = useBooking();
const clock = useClock();
const DAY = 86_400_000;

const resources = liveQuery(() => db.resources.toArray(), { initial: undefined });
let resourceId = $state<string | null>(null);
let minutes = $state(60);
let day = $state<string | null>(null);
let chosen = $state<{ start: string; end: string } | null>(null);
let form = $state({ customerName: '', customerEmail: '' });
let errors = $state<Record<string, string>>({});
let saving = $state(false);
let confirmed = $state<Booking | null>(null);

const data = liveQuery(
  async () => {
    if (!resourceId) return null;
    const [rules, bookings] = await Promise.all([
      db.availability.where('resourceId').equals(resourceId).toArray(),
      db.bookings.where('resourceId').equals(resourceId).toArray(),
    ]);
    return { rules, bookings };
  },
  { initial: null, deps: () => resourceId }
);
// The next 14 UTC days that have opening hours for this resource.
const days = $derived.by(() => {
  const rules = data.current?.rules ?? [];
  const today = Math.floor(clock.now.getTime() / DAY) * DAY;
  return Array.from({ length: 14 }, (_, i) =>
    new Date(today + i * DAY).toISOString().slice(0, 10)
  ).filter((d) => rules.some((r) => r.weekday === new Date(`${d}T00:00:00.000Z`).getUTCDay()));
});
const slots = $derived(
  data.current && resourceId && day
    ? freeSlots({
        rules: data.current.rules,
        bookings: data.current.bookings,
        resourceId,
        day,
        durationMinutes: minutes,
        now: clock.now,
      })
    : []
);
const resource = $derived((resources.current ?? []).find((r) => r.id === resourceId));
const canBook = $derived(can(CAPABILITIES.bookingsBookPublic));

function pickResource(id: string) {
  resourceId = id;
  day = null;
  chosen = null;
}

async function confirm(event: SubmitEvent) {
  event.preventDefault();
  if (!resourceId || !chosen) return;
  saving = true;
  errors = {};
  const target = chosen;
  const result = await runService(() =>
    services.bookings.bookPublic({ resourceId: resourceId as string, ...form, ...target })
  );
  saving = false;
  if (result.ok) {
    confirmed = result.value;
    chosen = null;
  } else if (isValidationError(result.error)) {
    errors = result.error.issues;
  }
}

function reset() {
  confirmed = null;
  chosen = null;
  form = { customerName: '', customerEmail: '' };
  errors = {};
}
</script>

<PageHeader title="Book online" description="The public booking page. Only free times inside the opening hours are offered (times in UTC)." />

{#if confirmed}
  <Card class="grid max-w-xl gap-3 p-6" role="status">
    <Text size="lg" weight="semibold" class="flex items-center gap-2"><LucideIcon icon={CircleCheck} tone="success" class="size-5" />You're booked</Text>
    <Text>{resource?.name}: {formatSpan(confirmed.start, confirmed.end)}</Text>
    <Text size="sm" tone="muted">A confirmation would go to {confirmed.customerEmail} (simulated: no email is sent).</Text>
    <div><Button variant="outline" onclick={reset}>Book another time</Button></div>
  </Card>
{:else}
  {#if !canBook}
    <Box role="note" border="default" radius="lg" padding="none" class="mb-4 p-3">
      <Text size="sm" tone="muted">Your role can browse free times but not book. Switch to the client or staff persona in DevTools to book.</Text>
    </Box>
  {/if}
  <div class="book-grid grid gap-6">
    <section aria-labelledby="pick-resource" class="grid content-start gap-2">
      <Heading level={2} size="sm" id="pick-resource">1. What would you like to book?</Heading>
      {#each resources.current ?? [] as r (r.id)}
        <Button variant={resourceId === r.id ? 'secondary' : 'outline'} aria-pressed={resourceId === r.id} class="h-auto justify-start py-2 text-left" onclick={() => pickResource(r.id)}>
          <span class="grid">
            <Text as="span" size="sm" weight="medium">{r.name}</Text>
            <Text as="span" size="xs" tone="muted">{r.description}</Text>
          </span>
        </Button>
      {/each}
    </section>

    <div class="grid content-start gap-6">
      {#if !resourceId}
        <EmptyState title="Pick a room or a coach" description="Their free times for the next two weeks appear here." />
      {:else}
        <section aria-labelledby="pick-day" class="grid gap-2">
          <Heading level={2} size="sm" id="pick-day">2. Pick a day and a length</Heading>
          <div class="flex flex-wrap gap-1" role="group" aria-label="Length">
            {#each [30, 60, 90] as m (m)}
              <Button size="sm" variant={minutes === m ? 'secondary' : 'ghost'} aria-pressed={minutes === m} onclick={() => { minutes = m; chosen = null; }}>{m} min</Button>
            {/each}
          </div>
          <div class="flex flex-wrap gap-1" role="group" aria-label="Day">
            {#each days as d (d)}
              <Button size="sm" variant={day === d ? 'secondary' : 'outline'} aria-pressed={day === d} onclick={() => { day = d; chosen = null; }}>{formatDay(`${d}T12:00:00.000Z`)}</Button>
            {/each}
          </div>
        </section>
        {#if day}
          <section aria-labelledby="pick-time" class="grid gap-2">
            <Heading level={2} size="sm" id="pick-time">3. Pick a free time</Heading>
            {#if slots.length === 0}
              <Text size="sm" tone="muted">No free {minutes}-minute times that day. Try another day or a shorter length.</Text>
            {:else}
              <div class="flex flex-wrap gap-1" role="group" aria-label="Free times">
                {#each slots as s (s.start)}
                  <Button size="sm" variant={chosen?.start === s.start ? 'default' : 'outline'} aria-pressed={chosen?.start === s.start} onclick={() => (chosen = s)}>{formatTime(s.start)}</Button>
                {/each}
              </div>
            {/if}
            {#if errors.start}<Text role="alert" size="sm" tone="destructive">{errors.start}</Text>{/if}
          </section>
        {/if}
        {#if chosen}
          <form class="grid max-w-xl gap-4" onsubmit={confirm} novalidate aria-labelledby="your-details">
            <Heading level={2} size="sm" id="your-details">4. Your details · {formatSpan(chosen.start, chosen.end)}</Heading>
            <FormField label="Your name" required error={errors.customerName}>
              {#snippet children(control)}
                <Input {...control.props} bind:value={form.customerName} autocomplete="off" maxlength={80} />
              {/snippet}
            </FormField>
            <FormField label="Email" required error={errors.customerEmail} description="Prototype data: @example.com only.">
              {#snippet children(control)}
                <Input {...control.props} type="email" bind:value={form.customerEmail} placeholder="you@example.com" autocomplete="off" />
              {/snippet}
            </FormField>
            <div><Button type="submit" loading={saving} disabled={!canBook}>Confirm booking</Button></div>
          </form>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<style>
  @media (min-width: 64rem) {
    .book-grid {
      grid-template-columns: 18rem minmax(0, 1fr);
    }
  }
</style>
