<script lang="ts">
import { NumberStepper } from '@protoyard/ui';

let guests = $state(2);
let qty = $state(5);
</script>

<div class="grid max-w-sm gap-6">
  <NumberStepper label="Guests" bind:value={guests} min={1} max={12} unit="people" />
  <NumberStepper label="Quantity" bind:value={qty} min={0} max={20} step={5} />
  <NumberStepper label="Seats (disabled)" value={4} min={1} max={8} disabled />
</div>
