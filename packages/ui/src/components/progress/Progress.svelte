<script lang="ts">
import { Progress as ProgressPrimitive } from '@texuli/primitives/progress';
import { cn } from '../../lib/cn.ts';

interface Props {
  /** Current value; `null` renders an indeterminate bar. */
  value?: number | null;
  max?: number;
  /** Visible label; also used as the accessible name. */
  label?: string;
  /** Accessible name when no visible label is shown. */
  ariaLabel?: string;
  showValue?: boolean;
  tone?: 'primary' | 'success' | 'warning' | 'destructive' | 'info';
  size?: 'sm' | 'md';
  class?: string;
}

const uid = $props.id();

let {
  value = 0,
  max = 100,
  label,
  ariaLabel,
  showValue = false,
  tone = 'primary',
  size = 'md',
  class: className,
}: Props = $props();

const tones = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  info: 'bg-info',
};
const percent = $derived(
  value === null ? null : Math.min(100, Math.max(0, (value / (max || 1)) * 100))
);
const labelId = `progress-${uid}`;
</script>

<div class={cn('grid gap-1.5', className)}>
  {#if label || showValue}
    <div class="flex items-center justify-between gap-2 text-sm">
      {#if label}<span id={labelId} class="font-medium text-foreground">{label}</span>{/if}
      {#if showValue && percent !== null}
        <span class="ml-auto text-muted-foreground tabular-nums">{Math.round(percent)}%</span>
      {/if}
    </div>
  {/if}
  <ProgressPrimitive.Root
    {value}
    {max}
    aria-labelledby={label ? labelId : undefined}
    aria-label={label ? undefined : ariaLabel}
    aria-valuetext={percent === null ? 'Loading' : `${Math.round(percent)}%`}
    class={cn('relative w-full overflow-hidden rounded-full bg-muted', size === 'sm' ? 'h-1.5' : 'h-2.5')}
  >
    {#if percent === null}
      <div class={cn('h-full w-1/3 rounded-full ui-progress-indeterminate', tones[tone])}></div>
    {:else}
      <div
        class={cn('h-full rounded-full transition-[width] duration-300', tones[tone])}
        style:width={`${percent}%`}
      ></div>
    {/if}
  </ProgressPrimitive.Root>
</div>
