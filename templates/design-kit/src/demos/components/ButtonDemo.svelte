<script lang="ts">
import { Button } from '@protoyard/ui';

let clicks = $state(0);
</script>

<!-- @prop variant: 'solid' | 'outline' — Visual emphasis for the action. -->
<!-- @prop disabled: boolean — Prevents activation while unavailable. -->
<div class="demo-row">
  <Button class="primary" onclick={() => clicks++}>Save changes</Button>
  <Button class="secondary">Cancel</Button>
  <Button class="quiet" disabled>Unavailable</Button>
</div>
<p class="demo-caption" aria-live="polite">Saved {clicks} times in this preview.</p>
