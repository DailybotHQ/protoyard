<script lang="ts">
import { Badge } from '@protoyard/ui';
import type { ItemStatus } from '../database/schema.ts';
import { STATUS_LABELS } from '../lib/format.ts';

let { status }: { status: ItemStatus } = $props();
const variant = $derived(status === 'done' ? 'success' : status === 'doing' ? 'info' : 'secondary');
</script>

<Badge {variant}>{STATUS_LABELS[status]}</Badge>
