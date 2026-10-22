<script lang="ts">
import { ChipGroup } from '@protoyard/ui';

const topics = [
  { value: 'design', label: 'Design' },
  { value: 'eng', label: 'Engineering' },
  { value: 'ops', label: 'Operations' },
  { value: 'legal', label: 'Legal', disabled: true },
];

let plan = $state<string[]>(['design']);
let tags = $state<string[]>(['eng']);
</script>

<div class="grid max-w-lg gap-6">
  <ChipGroup label="Plan (single)" mode="single" bind:value={plan} items={topics} />
  <ChipGroup label="Topics (multi)" mode="multi" bind:value={tags} items={topics} />
  <p class="text-xs text-muted-foreground" aria-live="polite">
    Plan: {plan.join(', ') || 'none'} · Topics: {tags.join(', ') || 'none'}
  </p>
</div>
