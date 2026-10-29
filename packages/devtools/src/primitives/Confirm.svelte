<script lang="ts">
import type { Snippet } from 'svelte';
import Btn from './Btn.svelte';
import Spinner from './Spinner.svelte';

/**
 * Inline two-step confirmation for destructive panel actions. A modal on
 * top of a floating panel would fight the app's own dialogs for focus.
 * Actions use Texuli-backed Btn adapters.
 */
let {
  label,
  confirmLabel = 'Confirm',
  message,
  onconfirm,
  busy = false,
  variant = 'outline',
  disabled = false,
  extra,
}: {
  label: string;
  confirmLabel?: string;
  message: string;
  onconfirm: () => void | Promise<void>;
  busy?: boolean;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  disabled?: boolean;
  extra?: Snippet;
} = $props();

let asking = $state(false);

async function confirm() {
  await onconfirm();
  asking = false;
}
</script>

{#if asking}
  <div
    class="w-full rounded-md border border-destructive/40 bg-destructive/5 p-2.5"
    role="group"
    aria-label={label}
  >
    <p class="text-xs text-foreground">{message}</p>
    {#if extra}<div class="mt-2">{@render extra()}</div>{/if}
    <div class="mt-2 flex gap-1.5">
      <Btn variant="danger" {busy} onclick={confirm}>
        {#if busy}<Spinner />Working…{:else}{confirmLabel}{/if}
      </Btn>
      <Btn variant="ghost" disabled={busy} onclick={() => (asking = false)}>Cancel</Btn>
    </div>
  </div>
{:else}
  <Btn {variant} {disabled} onclick={() => (asking = true)}>{label}</Btn>
{/if}
