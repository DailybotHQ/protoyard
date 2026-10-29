<script lang="ts">
import type { Snippet } from 'svelte';
import { Button, type ButtonVariant } from 'texuli/button';

/**
 * Compact panel button on Texuli's Button (size sm).
 * Keeps the DevTools variant names (`primary` / `danger`) as a thin adapter.
 * `autoLoading={false}` keeps a button enabled while its `onclick` promise
 * settles: Texuli disables a pending button, and disabling the focused one
 * drops focus to <body>, out of the panel (its Escape handler then misses).
 */
let {
  variant = 'outline',
  busy = false,
  autoLoading = true,
  class: className = '',
  children,
  ref = $bindable(null),
  disabled = false,
  type = 'button',
  id,
  title,
  role,
  tabindex,
  onclick,
  style,
  'aria-label': ariaLabel,
  'aria-expanded': ariaExpanded,
  'aria-pressed': ariaPressed,
  'aria-controls': ariaControls,
  'aria-selected': ariaSelected,
  'aria-checked': ariaChecked,
  'aria-busy': ariaBusy,
  'data-theme-id': dataThemeId,
}: {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  busy?: boolean;
  autoLoading?: boolean;
  class?: string;
  children: Snippet;
  ref?: HTMLElement | null;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  id?: string;
  title?: string;
  role?: string;
  tabindex?: number;
  onclick?: (event: MouseEvent) => unknown;
  style?: string;
  'aria-label'?: string;
  'aria-expanded'?: boolean | 'true' | 'false';
  'aria-pressed'?: boolean | 'true' | 'false';
  'aria-controls'?: string;
  'aria-selected'?: boolean | 'true' | 'false';
  'aria-checked'?: boolean | 'true' | 'false';
  'aria-busy'?: boolean | 'true' | 'false';
  'data-theme-id'?: string;
} = $props();

const mapped: Record<string, ButtonVariant> = {
  primary: 'default',
  outline: 'outline',
  ghost: 'ghost',
  danger: 'destructive',
};
</script>

<Button
  bind:ref
  {disabled}
  {type}
  {id}
  {title}
  {role}
  {tabindex}
  {onclick}
  {style}
  aria-label={ariaLabel}
  aria-expanded={ariaExpanded as never}
  aria-pressed={ariaPressed as never}
  aria-controls={ariaControls}
  aria-selected={ariaSelected as never}
  aria-checked={ariaChecked as never}
  aria-busy={ariaBusy ?? (busy ? 'true' : undefined) as never}
  data-theme-id={dataThemeId}
  variant={mapped[variant] ?? 'outline'}
  size="sm"
  loading={busy}
  {autoLoading}
  class={className || undefined}
  data-py-devtools-btn=""
>
  {@render children()}
</Button>
