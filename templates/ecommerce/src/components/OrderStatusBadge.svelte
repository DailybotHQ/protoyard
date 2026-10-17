<script lang="ts">
import { Badge, type BadgeVariant } from '@protoyard/ui';
import type { OrderStatus } from '../database/schema.ts';
import { ORDER_STATUS_LABELS } from '../domain/catalog.ts';

let { status }: { status: OrderStatus } = $props();

const variants: Record<OrderStatus, BadgeVariant> = {
  placed: 'info',
  processing: 'secondary',
  shipped: 'default',
  delivered: 'success',
  cancelled: 'destructive',
};
</script>

<Badge variant={variants[status]}>{ORDER_STATUS_LABELS[status]}</Badge>
