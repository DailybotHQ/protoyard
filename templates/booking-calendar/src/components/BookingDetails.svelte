<script lang="ts">
import { can, isValidationError, runService, useClock } from '@protoyard/renderer-svelte';
import { Button, Dialog, FormField, Input } from '@protoyard/ui';
import type { Booking, Resource } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useBooking } from '../lib/context.ts';
import { formatSpan } from '../lib/format.ts';
import StatusBadge from './StatusBadge.svelte';

/** One booking: details, and cancellation for upcoming confirmed bookings (staff and owner). */
let {
  open = $bindable(false),
  booking,
  resource,
}: { open?: boolean; booking: Booking | null; resource: Resource | undefined } = $props();

const { services } = useBooking();
const clock = useClock();
let reason = $state('');
let error = $state<string | undefined>(undefined);

$effect(() => {
  if (open) {
    reason = '';
    error = undefined;
  }
});

const cancellable = $derived(
  booking !== null &&
    booking.status === 'confirmed' &&
    Date.parse(booking.end) > clock.now.getTime() &&
    can(CAPABILITIES.bookingsManage)
);

async function cancel() {
  if (!booking) return;
  const result = await runService(() => services.bookings.cancel(booking.id, { reason }), {
    success: 'Booking cancelled',
  });
  if (result.ok) open = false;
  else if (isValidationError(result.error)) error = result.error.issues.reason;
}
</script>

<Dialog bind:open title={booking?.title ?? 'Booking'} description={booking ? formatSpan(booking.start, booking.end) : undefined}>
  {#if booking}
    <dl class="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
      <dt class="text-muted-foreground">Status</dt>
      <dd><StatusBadge status={booking.status} /></dd>
      <dt class="text-muted-foreground">Resource</dt>
      <dd>{resource?.name ?? booking.resourceId}</dd>
      <dt class="text-muted-foreground">Customer</dt>
      <dd>{booking.customerName} · {booking.customerEmail}</dd>
      <dt class="text-muted-foreground">Booked via</dt>
      <dd>{booking.source === 'public' ? 'Public booking page' : booking.source === 'block' ? 'Recurring block' : 'Staff calendar'}</dd>
      {#if booking.cancelReason}
        <dt class="text-muted-foreground">Cancel reason</dt>
        <dd>{booking.cancelReason}</dd>
      {/if}
    </dl>
    {#if cancellable}
      <div class="mt-4 grid gap-2">
        <FormField label="Reason (optional)" {error}>
          {#snippet children(control)}
            <Input {...control.props} bind:value={reason} maxlength={200} placeholder="Client rescheduled" />
          {/snippet}
        </FormField>
      </div>
    {/if}
  {/if}
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Close</Button>
    {#if cancellable}
      <Button variant="destructive" onclick={cancel}>Cancel booking</Button>
    {/if}
  {/snippet}
</Dialog>
