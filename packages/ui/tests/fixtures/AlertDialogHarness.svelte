<script lang="ts">
import AlertDialog from '../../src/components/alert-dialog/AlertDialog.svelte';

interface Props {
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
}

let { onConfirm, onCancel }: Props = $props();
let open = $state(false);
</script>

<button type="button" onclick={() => (open = true)}>Delete project</button>
<p data-testid="state">{open ? 'open' : 'closed'}</p>
<AlertDialog
  bind:open
  title="Delete project?"
  description="This permanently removes the project."
  confirmLabel="Delete"
  destructive
  {onConfirm}
  {onCancel}
/>
