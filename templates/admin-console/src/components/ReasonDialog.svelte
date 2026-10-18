<script lang="ts">
import { isValidationError, runService } from '@protoyard/renderer-svelte';
import { Button, Dialog, FormField, Textarea } from '@protoyard/ui';

/**
 * Confirmation for consequential staff actions (suspend, impersonate): asks
 * for a reason that is written to the audit log. The action runs through
 * `runService`, so permission, offline and validation errors are real.
 */
let {
  open = $bindable(false),
  title,
  description,
  confirmLabel,
  destructive = false,
  success,
  action,
  onDone,
}: {
  open?: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  success: string;
  action: (reason: string) => Promise<unknown>;
  onDone?: () => void;
} = $props();

let reason = $state('');
let error = $state<string | null>(null);
let busy = $state(false);

$effect(() => {
  if (open) {
    reason = '';
    error = null;
  }
});

async function confirm() {
  busy = true;
  error = null;
  const result = await runService(() => action(reason), { success });
  busy = false;
  if (result.ok) {
    open = false;
    onDone?.();
  } else if (isValidationError(result.error)) {
    error = result.error.issues.reason ?? result.error.issues.form ?? 'Check the reason.';
  }
}
</script>

<Dialog bind:open {title} {description} size="sm">
  <form
    class="grid gap-4"
    onsubmit={(event) => {
      event.preventDefault();
      void confirm();
    }}
  >
    <FormField label="Reason" required {error} description="Saved in the audit log with your name.">
      {#snippet children(control)}
        <Textarea {...control.props} rows={3} bind:value={reason} placeholder="Customer asked us to reproduce a billing bug" />
      {/snippet}
    </FormField>
    <div class="flex justify-end gap-2">
      <Button variant="outline" type="button" onclick={() => (open = false)}>Cancel</Button>
      <Button type="submit" variant={destructive ? 'destructive' : 'default'} loading={busy}>{confirmLabel}</Button>
    </div>
  </form>
</Dialog>
