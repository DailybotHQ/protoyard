<script lang="ts">
import type { Snippet } from 'svelte';
import type { HTMLButtonAttributes } from 'svelte/elements';

/** Compact panel button; the app's `@protoyard/ui` Button is sized for products. */
let {
  variant = 'outline',
  busy = false,
  class: className = '',
  children,
  ...rest
}: HTMLButtonAttributes & {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  busy?: boolean;
  children: Snippet;
} = $props();

const variants = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  outline: 'border border-border bg-surface text-surface-foreground hover:bg-muted',
  ghost: 'text-foreground hover:bg-muted',
  danger: 'bg-destructive text-destructive-foreground hover:bg-destructive-hover',
};
</script>

<button
  type="button"
  {...rest}
  class="inline-flex min-h-touch items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 sm:min-h-7 {variants[
    variant
  ]} {className}"
  aria-busy={busy || undefined}
  disabled={busy || rest.disabled}
>
  {#if busy}
    <span
      class="size-3 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
      aria-hidden="true"
    ></span>
  {/if}
  {@render children()}
</button>
