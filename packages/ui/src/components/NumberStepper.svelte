<script lang="ts">
/**
 * Labelled numeric stepper with decrement / value / increment. Clamps to
 * min…max by step. Theme tokens only; 44px touch targets on small screens.
 */
import { Minus, Plus } from '@lucide/svelte';
import { cn } from '../lib/cn.ts';

interface Props {
  /** Accessible name (and visible label unless `hideLabel`). */
  label: string;
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  hideLabel?: boolean;
  /** Suffix shown next to the value (for example `guests`). */
  unit?: string;
  class?: string;
  onchange?: (value: number) => void;
}

let {
  label,
  value = $bindable(0),
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  disabled = false,
  hideLabel = false,
  unit,
  class: className,
  onchange,
}: Props = $props();

const uid = $props.id();
const labelId = `stepper-label-${uid}`;

const safeStep = $derived(step > 0 ? step : 1);
const atMin = $derived(value <= min);
const atMax = $derived(value >= max);

function clamp(next: number): number {
  return Math.min(max, Math.max(min, next));
}

function change(next: number): void {
  if (disabled) return;
  const bounded = clamp(next);
  if (bounded === value) return;
  value = bounded;
  onchange?.(bounded);
}

function onSpinKeydown(event: KeyboardEvent): void {
  if (disabled) return;
  if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
    event.preventDefault();
    change(value + safeStep);
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
    event.preventDefault();
    change(value - safeStep);
  } else if (event.key === 'Home') {
    event.preventDefault();
    change(min);
  } else if (event.key === 'End') {
    event.preventDefault();
    change(max);
  }
}
</script>

<div class={cn('grid gap-2', className)}>
  <span id={labelId} class={cn('text-sm font-medium text-foreground', hideLabel && 'sr-only')}>
    {label}
  </span>
  <div
    class={cn(
      'inline-flex max-w-full items-stretch overflow-hidden rounded-lg border border-border bg-surface text-foreground shadow-soft',
      disabled && 'opacity-60'
    )}
  >
    <button
      type="button"
      aria-label={`Decrease ${label}`}
      disabled={disabled || atMin}
      onclick={() => change(value - safeStep)}
      class={cn(
        'inline-flex min-h-touch min-w-[44px] items-center justify-center text-primary transition-colors',
        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:text-muted-foreground sm:min-h-11 sm:min-w-11'
      )}
    >
      <Minus class="size-4" aria-hidden="true" stroke-width={2.5} />
    </button>
    <div
      role="spinbutton"
      tabindex={disabled ? -1 : 0}
      aria-labelledby={labelId}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={Number.isFinite(max) ? max : undefined}
      aria-disabled={disabled || undefined}
      onkeydown={onSpinKeydown}
      class={cn(
        'grid min-w-14 flex-1 place-items-center border-x border-border px-3 text-sm font-semibold tabular-nums outline-none',
        'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
      )}
    >
      <span aria-live="polite">
        {value}{#if unit}<span class="ml-1 font-normal text-muted-foreground">{unit}</span>{/if}
      </span>
    </div>
    <button
      type="button"
      aria-label={`Increase ${label}`}
      disabled={disabled || atMax}
      onclick={() => change(value + safeStep)}
      class={cn(
        'inline-flex min-h-touch min-w-[44px] items-center justify-center text-primary transition-colors',
        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:text-muted-foreground sm:min-h-11 sm:min-w-11'
      )}
    >
      <Plus class="size-4" aria-hidden="true" stroke-width={2.5} />
    </button>
  </div>
</div>
