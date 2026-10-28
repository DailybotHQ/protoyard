<script lang="ts">
import { Button, Input } from '@protoyard/ui';
import { safeHref } from '@protoyard/views/editor';
import { cx } from 'texuli/cx';

/**
 * LinkMenu — small popover to set or clear a link URL. Rejects unsafe schemes
 * with an inline error; never writes storage. Parent applies the chosen href
 * through `onApply` / `onRemove`.
 */
interface Props {
  open?: boolean;
  /** Current or suggested URL. */
  href?: string;
  label?: string;
  class?: string;
  onApply?: (href: string) => void;
  onRemove?: () => void;
  onClose?: () => void;
}

let {
  open = false,
  href = 'https://',
  label = 'Link URL',
  class: className,
  onApply,
  onRemove,
  onClose,
}: Props = $props();

let draft = $state('https://');
let error = $state('');

$effect(() => {
  if (open) {
    draft = href || 'https://';
    error = '';
  }
});

function apply() {
  const safe = safeHref(draft.trim());
  if (!safe) {
    error = 'Enter an http(s), mailto, or relative link';
    return;
  }
  error = '';
  onApply?.(safe);
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    apply();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    onClose?.();
  }
}
</script>

{#if open}
  <div
    class={cx(
      'z-30 w-72 rounded-md border border-border bg-elevated p-3 shadow-float',
      className
    )}
    role="dialog"
    aria-label={label}
  >
    <label class="grid gap-1.5 text-sm">
      <span class="font-medium text-foreground">{label}</span>
      <Input
        type="url"
        class="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        bind:value={draft}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? 'link-menu-error' : undefined}
        onkeydown={onKey}
      />
    </label>
    {#if error}
      <p id="link-menu-error" class="mt-1.5 text-xs text-destructive" role="alert">{error}</p>
    {/if}
    <div class="mt-3 flex flex-wrap gap-2">
      <Button
        type="button"
        class="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onclick={apply}
      >
        Apply
      </Button>
      <Button
        type="button"
        class="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onclick={() => onRemove?.()}
      >
        Remove
      </Button>
      <Button
        type="button"
        class="inline-flex h-8 items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onclick={() => onClose?.()}
      >
        Cancel
      </Button>
    </div>
  </div>
{/if}
