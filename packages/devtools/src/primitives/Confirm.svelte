<script lang="ts">
import type { Snippet } from 'svelte';
import Btn from './Btn.svelte';

/**
 * Inline two-step confirmation for destructive panel actions. A modal on
 * top of a floating panel would fight the app's own dialogs for focus.
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
let confirmButton: HTMLButtonElement | undefined = $state();

$effect(() => {
  if (asking) confirmButton?.focus();
});

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
      <button
        bind:this={confirmButton}
        type="button"
        class="inline-flex min-h-touch items-center gap-1.5 rounded-md bg-destructive px-2.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-50 sm:min-h-7"
        disabled={busy}
        aria-busy={busy || undefined}
        onclick={confirm}
      >
        {busy ? 'Working…' : confirmLabel}
      </button>
      <Btn variant="ghost" disabled={busy} onclick={() => (asking = false)}>Cancel</Btn>
    </div>
  </div>
{:else}
  <Btn {variant} {disabled} onclick={() => (asking = true)}>{label}</Btn>
{/if}
