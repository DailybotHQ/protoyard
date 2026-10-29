<script lang="ts">
import { Button, Input } from '@protoyard/ui';

import { Icon } from 'texuli/icons';

/** Accessible − n + control. `onchange` fires with the new clamped value. */
let {
  value,
  min = 1,
  max,
  label,
  disabled = false,
  onchange,
}: {
  value: number;
  min?: number;
  max: number;
  label: string;
  disabled?: boolean;
  onchange: (value: number) => void;
} = $props();

const clamp = (n: number) => Math.max(min, Math.min(max, n));
const buttonClass =
  'inline-flex size-9 min-h-touch min-w-[44px] items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring sm:min-h-0 sm:min-w-0';
</script>

<div class="inline-flex items-center overflow-hidden rounded-md border border-input bg-surface" role="group" aria-label={label}>
  <Button type="button" variant="ghost" class={buttonClass} aria-label="Decrease quantity" disabled={disabled || value <= min} onclick={() => onchange(clamp(value - 1))}>
    <Icon icon="minus" class="size-4" aria-hidden="true" />
  </Button>
  <Input
    type="number"
    inputmode="numeric"
    class="h-9 w-12 border-x border-input bg-transparent text-center text-sm tabular-nums outline-none [appearance:textfield] focus-visible:bg-muted [&::-webkit-inner-spin-button]:appearance-none"
    aria-label={`${label} quantity`}
    {min}
    {max}
    {value}
    {disabled}
    onchange={(event) => {
      const next = Number.parseInt(event.currentTarget.value, 10);
      const clamped = Number.isFinite(next) ? clamp(next) : value;
      event.currentTarget.value = String(clamped);
      if (clamped !== value) onchange(clamped);
    }}
  />
  <Button type="button" variant="ghost" class={buttonClass} aria-label="Increase quantity" disabled={disabled || value >= max} onclick={() => onchange(clamp(value + 1))}>
    <Icon icon="plus" class="size-4" aria-hidden="true" />
  </Button>
</div>
