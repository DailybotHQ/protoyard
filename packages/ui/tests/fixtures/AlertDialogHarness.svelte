<script lang="ts">
import AlertDialog from '../../src/components/alert-dialog/AlertDialog.svelte';

interface Props {
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
  /** The caller closes the alert itself inside onConfirm. */
  closeInConfirm?: boolean;
}

let { onConfirm, onCancel, closeInConfirm = false }: Props = $props();
let open = $state(false);
const confirmed = $derived(
  closeInConfirm
    ? async () => {
        await onConfirm?.();
        open = false;
      }
    : onConfirm
);
</script>

<button type="button" onclick={() => (open = true)}>Delete project</button>
<p data-testid="state">{open ? 'open' : 'closed'}</p>
<AlertDialog
  bind:open
  title="Delete project?"
  description="This permanently removes the project."
  confirmLabel="Delete"
  destructive
  onConfirm={confirmed}
  {onCancel}
/>
