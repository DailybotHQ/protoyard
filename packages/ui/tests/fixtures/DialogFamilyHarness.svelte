<script lang="ts">
import Button from '../../src/components/button/Button.svelte';
import Dialog from '../../src/components/dialog/Dialog.svelte';
import UndoToaster from '../../src/components/toast/UndoToaster.svelte';

interface Props {
  /** Mount the dialog already open (as a lazily loaded dialog is). */
  initiallyOpen?: boolean;
}

let { initiallyOpen = false }: Props = $props();
// svelte-ignore state_referenced_locally
let open = $state(initiallyOpen);
</script>

<Dialog bind:open title="Edit deal" description="Change the amount.">
  {#snippet trigger({ props })}<Button {...props}>Edit deal</Button>{/snippet}
  <button type="button">Amount</button>
</Dialog>
<p data-testid="dialog-state">{open ? 'open' : 'closed'}</p>
<UndoToaster />
