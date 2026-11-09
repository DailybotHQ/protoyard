<script lang="ts">
import { Input } from '@protoyard/ui';
import { Text } from 'texuli/typography';

let value = $state('');
</script>

<!-- @prop label: string — Visible, persistent name for the input. -->
<!-- @prop required: boolean — Marks a value that must be provided. -->
<div class="grid w-full max-w-xs gap-1.5">
  <Text as="label" for="demo-email" size="sm" weight="medium">Work email</Text>
  <Input id="demo-email" type="email" bind:value placeholder="you@example.com" />
  <Text size="xs" tone="muted">Your address stays in this local preview.</Text>
</div>
