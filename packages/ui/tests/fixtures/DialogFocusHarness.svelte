<script lang="ts">
import { Button, Dialog } from '../../src/index.ts';

let { onCloseAutoFocus }: { onCloseAutoFocus?: (event: { preventDefault(): void }) => void } =
  $props();
let open = $state(true);
</script>

<Dialog bind:open title="Confirm" {onCloseAutoFocus}>
  <Button onclick={() => (open = false)}>Done</Button>
</Dialog>
