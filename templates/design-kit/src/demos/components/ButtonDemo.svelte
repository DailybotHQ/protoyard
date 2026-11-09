<script lang="ts">
import { Button } from '@protoyard/ui';
import { Text } from 'texuli/typography';

let clicks = $state(0);
</script>

<!-- @prop variant: 'solid' | 'outline' — Visual emphasis for the action. -->
<!-- @prop disabled: boolean — Prevents activation while unavailable. -->
<div class="flex flex-wrap items-center justify-center gap-2">
  <Button onclick={() => clicks++}>Save changes</Button>
  <Button variant="outline">Cancel</Button>
  <Button variant="ghost" disabled>Unavailable</Button>
</div>
<Text size="xs" tone="muted" align="center" class="w-full" aria-live="polite">Saved {clicks} times in this preview.</Text>
