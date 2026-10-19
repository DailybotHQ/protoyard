<script lang="ts">
import { Badge } from '@protoyard/ui';
import type { AppointmentStatus } from '../database/schema.ts';
import { STATUS_LABELS } from '../domain/clinic.ts';

let { status }: { status: AppointmentStatus } = $props();
const VARIANT: Record<AppointmentStatus, 'secondary' | 'outline' | 'destructive' | 'default'> = {
  scheduled: 'outline',
  'checked-in': 'default',
  completed: 'secondary',
  'no-show': 'destructive',
  cancelled: 'outline',
};
</script>

<Badge variant={VARIANT[status]}>{STATUS_LABELS[status]}</Badge>
