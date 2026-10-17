<script lang="ts">
import type { BadgeVariant } from '@protoyard/ui';
import { Badge } from '@protoyard/ui';
import type { CustomerStatus, OrderStatus } from '../database/schema.ts';
import { ORDER_STATUS_LABELS } from '../domain/services.ts';

/** One badge for both customer and order statuses, so colors stay consistent. */
let { status }: { status: CustomerStatus | OrderStatus } = $props();

const VARIANTS: Record<CustomerStatus | OrderStatus, BadgeVariant> = {
  trial: 'info',
  active: 'success',
  paused: 'warning',
  churned: 'outline',
  pending: 'warning',
  paid: 'info',
  fulfilled: 'success',
  refunded: 'secondary',
  cancelled: 'outline',
};

const label = $derived(
  status in ORDER_STATUS_LABELS
    ? ORDER_STATUS_LABELS[status as OrderStatus]
    : status.charAt(0).toUpperCase() + status.slice(1)
);
</script>

<Badge variant={VARIANTS[status]}>{label}</Badge>
