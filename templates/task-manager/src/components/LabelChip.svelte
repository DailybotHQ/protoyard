<script lang="ts">
import { Badge } from '@protoyard/ui';
import type { TaskLabel } from '../database/schema.ts';
import { LABEL_NAMES } from '../domain/tasks.ts';

let { label }: { label: TaskLabel } = $props();
</script>

<Badge variant={label === 'bug' || label === 'blocked' ? 'destructive' : 'outline'}>
  {LABEL_NAMES[label]}
</Badge>
