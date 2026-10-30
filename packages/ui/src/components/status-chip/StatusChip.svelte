<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { Badge } from 'texuli/badge';
import { Icon } from 'texuli/icons';
import type { IconComponent } from '../../lib/types.ts';
import type { StatusChipTone } from './tones.ts';

/**
 * Status chip that always carries a word (never color alone): Texuli's
 * `Badge` (`texuli/badge`) with Protoyard's tone names.
 */
type Props = Omit<HTMLAttributes<HTMLSpanElement>, 'class' | 'children'> & {
  /** Required visible word — color is never the only signal. */
  label: string;
  tone?: StatusChipTone;
  icon?: IconComponent;
  class?: string;
  /** The rendered root element (bindable). */
  ref?: HTMLElement | null;
};

let {
  label,
  tone = 'neutral',
  icon,
  class: className,
  ref = $bindable(null),
  ...rest
}: Props = $props();

const VARIANT = {
  neutral: 'neutral',
  success: 'success',
  warning: 'warning',
  error: 'destructive',
  info: 'info',
  brand: 'default',
} as const;
</script>

<Badge {...rest} bind:ref variant={VARIANT[tone]} class={className} data-py-status-chip="" data-tone={tone}>
  {#if icon}<Icon {icon} size="xs" aria-hidden="true" />{/if}
  {label}
</Badge>
