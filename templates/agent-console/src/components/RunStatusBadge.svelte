<script lang="ts">
import { Badge } from '@protoyard/ui';

let { status }: { status: string } = $props();
const variant = $derived(
  status === 'completed'
    ? 'success'
    : status === 'failed'
      ? 'destructive'
      : status === 'awaiting-approval'
        ? 'warning'
        : status === 'running'
          ? 'info'
          : 'secondary'
);
const label = $derived(status === 'awaiting-approval' ? 'Needs approval' : status);
</script>

<Badge {variant} class="capitalize">{label}</Badge>
