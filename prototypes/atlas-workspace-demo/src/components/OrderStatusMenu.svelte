<script lang="ts">
import { ChevronDown } from '@lucide/svelte';
import { can, runService } from '@protoyard/renderer-svelte';
import { Button, DropdownMenu } from '@protoyard/ui';
import type { Order } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { ORDER_STATUS_LABELS, ORDER_TRANSITIONS } from '../domain/services.ts';
import { useDashboard } from '../lib/context.ts';
import StatusBadge from './StatusBadge.svelte';

/**
 * Status badge that becomes a menu of the allowed next statuses for people
 * who may update orders. Final statuses (refunded, cancelled) stay a badge.
 */
let { order }: { order: Order } = $props();
const { services } = useDashboard();

const next = $derived(ORDER_TRANSITIONS[order.status]);
const editable = $derived(next.length > 0 && can(CAPABILITIES.ordersUpdate));
const items = $derived(
  next.map((status) => ({
    label: `Mark as ${ORDER_STATUS_LABELS[status].toLowerCase()}`,
    destructive: status === 'refunded' || status === 'cancelled',
    onSelect: () => {
      void runService(() => services.orders.setStatus(order.id, status), {
        success: `${order.reference} marked as ${ORDER_STATUS_LABELS[status].toLowerCase()}`,
      });
    },
  }))
);
</script>

{#if editable}
  <DropdownMenu {items}>
    {#snippet trigger({ props })}
      <Button
        {...props}
        variant="ghost"
        size="sm"
        class="-mx-2 gap-1 px-2"
        aria-label={`Change status of ${order.reference} (currently ${ORDER_STATUS_LABELS[order.status]})`}
      >
        <StatusBadge status={order.status} />
        <ChevronDown class="size-3.5 text-muted-foreground" aria-hidden="true" />
      </Button>
    {/snippet}
  </DropdownMenu>
{:else}
  <StatusBadge status={order.status} />
{/if}
