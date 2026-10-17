<script lang="ts">
import { Button, toast } from '@protoyard/ui';
import { wait } from './nav.ts';

let archived = $state(0);
let saving = $state(false);

function archiveWithUndo(): void {
  archived += 1;
  toast.info('Conversation archived', {
    description: `${archived} archived so far.`,
    action: {
      label: 'Undo',
      onClick: () => {
        archived = Math.max(0, archived - 1);
        toast.success('Restored');
      },
    },
  });
}

async function saveWithProgress(): Promise<void> {
  saving = true;
  const id = toast.info('Saving…', { duration: 0 });
  await wait(1200);
  toast.success('Saved', { id, description: 'The same toast was updated in place.' });
  saving = false;
}
</script>

<div class="grid gap-4">
  <div class="flex flex-wrap gap-3">
    <Button
      variant="outline"
      onclick={() => toast.success('Invoice sent', { description: 'billing@example.com' })}
    >
      Success
    </Button>
    <Button
      variant="outline"
      onclick={() => toast.error('Payment failed', { description: 'The card was declined.' })}
    >
      Error
    </Button>
    <Button variant="outline" onclick={() => toast.info('New version available')}>Info</Button>
    <Button
      variant="outline"
      onclick={() => toast.warning('Storage almost full', { description: '92% of 10 GB used.' })}
    >
      Warning
    </Button>
  </div>
  <div class="flex flex-wrap gap-3">
    <Button onclick={archiveWithUndo}>Archive with Undo</Button>
    <Button variant="secondary" loading={saving} onclick={saveWithProgress}>Save (updates in place)</Button>
    <Button variant="ghost" onclick={() => toast.dismiss()}>Dismiss all</Button>
  </div>
  <p class="text-xs text-muted-foreground">
    Toasts auto-dismiss; hover or focus the stack to pause. Errors are announced assertively.
  </p>
</div>
