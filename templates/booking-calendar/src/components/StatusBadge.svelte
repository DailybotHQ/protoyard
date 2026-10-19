<script lang="ts">
import { Badge } from '@protoyard/ui';
import type { BookingStatus } from '../database/schema.ts';
import { STATUS_LABELS } from '../domain/booking.ts';

let { status }: { status: BookingStatus } = $props();
const VARIANT: Record<BookingStatus, 'secondary' | 'outline' | 'destructive' | 'default'> = {
  confirmed: 'default',
  completed: 'secondary',
  cancelled: 'outline',
  'no-show': 'destructive',
};
</script>

<Badge variant={VARIANT[status]}>{STATUS_LABELS[status]}</Badge>
