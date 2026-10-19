<script lang="ts">
import type { TaskLabel } from '../database/schema.ts';
import { LABEL_NAMES } from '../domain/tasks.ts';

let { label }: { label: TaskLabel } = $props();
</script>

<span
  class={[
    'inline-flex items-center rounded-md border px-1.5 py-px text-[0.7rem] font-medium',
    label === 'bug' || label === 'blocked'
      ? 'border-destructive/30 text-destructive'
      : 'border-border text-muted-foreground',
  ]}
>
  {LABEL_NAMES[label]}
</span>
