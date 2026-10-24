<script lang="ts">
import type { Snippet } from 'svelte';
import { Button, type ButtonVariant } from 'texuli/button';

/**
 * Compact panel button on Texuli's Button (size sm).
 * Keeps the DevTools variant names (`primary` / `danger`) as a thin adapter.
 */
let {
  variant = 'outline',
  busy = false,
  class: className = '',
  children,
  disabled = false,
  onclick,
  type = 'button',
  id,
  title,
  'aria-label': ariaLabel,
  'aria-expanded': ariaExpanded,
}: {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  busy?: boolean;
  class?: string;
  children: Snippet;
  disabled?: boolean;
  onclick?: (event: MouseEvent) => void | Promise<void>;
  type?: 'button' | 'submit' | 'reset';
  id?: string;
  title?: string;
  'aria-label'?: string;
  'aria-expanded'?: boolean | 'true' | 'false';
} = $props();

const mapped: Record<string, ButtonVariant> = {
  primary: 'default',
  outline: 'outline',
  ghost: 'ghost',
  danger: 'destructive',
};
</script>

<!-- Texuli Button accepts button|anchor handlers; cast keeps the panel API button-only. -->
<Button
  {type}
  {id}
  {title}
  {disabled}
  onclick={onclick as never}
  aria-label={ariaLabel}
  aria-expanded={ariaExpanded as never}
  variant={mapped[variant] ?? 'outline'}
  size="sm"
  loading={busy}
  class={className || undefined}
  data-py-devtools-btn=""
>
  {@render children()}
</Button>
