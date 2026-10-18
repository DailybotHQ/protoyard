<script lang="ts">
import { Badge } from '@protoyard/ui';

/** One badge vocabulary for tenant, subscription and user states. */
let { status }: { status: string } = $props();

const VARIANTS: Record<
  string,
  'success' | 'warning' | 'destructive' | 'info' | 'outline' | 'secondary'
> = {
  active: 'success',
  trialing: 'info',
  suspended: 'destructive',
  churned: 'outline',
  past_due: 'warning',
  canceled: 'outline',
  disabled: 'destructive',
};
const LABELS: Record<string, string> = { past_due: 'Past due' };
const label = $derived(LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1));
</script>

<Badge variant={VARIANTS[status] ?? 'secondary'}>{label}</Badge>
