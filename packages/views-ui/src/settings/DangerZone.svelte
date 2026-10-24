<script lang="ts">
import { Button, Dialog, Input } from '@protoyard/ui';
import { cx } from 'texuli/cx';

interface Props {
  title?: string;
  /** What the action does, in plain words. */
  description: string;
  /** The button, e.g. "Delete workspace". */
  actionLabel: string;
  /** The exact text the person must type to confirm, e.g. the workspace name. */
  confirmText: string;
  /** Runs the action, usually `() => runService(() => services.deleteWorkspace(id))`. A failed result keeps the dialog open. */
  onConfirm: () => unknown;
  disabled?: boolean;
  /** Shown when disabled (a role that cannot do this), instead of a silent no-op. */
  disabledReason?: string;
  class?: string;
}

let {
  title = 'Danger zone',
  description,
  actionLabel,
  confirmText,
  onConfirm,
  disabled = false,
  disabledReason,
  class: className,
}: Props = $props();

const uid = $props.id();
let open = $state(false);
let typed = $state('');
const matches = $derived(typed.trim() === confirmText);

async function confirm() {
  const result = await onConfirm();
  const failed =
    typeof result === 'object' && result !== null && (result as { ok?: unknown }).ok === false;
  if (!failed) {
    open = false;
    typed = '';
  }
}
</script>

<section
  aria-labelledby={`danger-${uid}`}
  class={cx('rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-4 sm:px-6', className)}
>
  <h3 id={`danger-${uid}`} class="text-sm font-semibold text-destructive">{title}</h3>
  <div class="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <p class="text-sm text-muted-foreground">
      {description}
      {#if disabled && disabledReason}<span class="block">{disabledReason}</span>{/if}
    </p>
    <Button variant="destructive" class="shrink-0" {disabled} onclick={() => (open = true)}>{actionLabel}</Button>
  </div>
</section>

<Dialog
  bind:open
  title={actionLabel}
  description={description}
  size="sm"
  onOpenChange={(next) => {
    if (!next) typed = '';
  }}
>
  <label for={`danger-${uid}-input`} class="text-sm">
    Type <strong class="font-mono">{confirmText}</strong> to confirm.
  </label>
  <Input id={`danger-${uid}-input`} bind:value={typed} class="mt-2" autocomplete="off" spellcheck={false} />
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button variant="destructive" disabled={!matches} onclick={() => confirm()}>{actionLabel}</Button>
  {/snippet}
</Dialog>
