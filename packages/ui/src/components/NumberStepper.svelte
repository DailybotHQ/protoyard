<script lang="ts">
/**
 * Labelled numeric stepper with decrement / value / increment, clamped to
 * min…max by step: a thin adapter over Texuli's `NumberField`
 * (`texuli/number-pin`), keeping Protoyard's `label`, `unit` and `onchange`.
 */
import Minus from '@lucide/svelte/icons/minus';
import Plus from '@lucide/svelte/icons/plus';
import { cx } from 'texuli/cx';
import { labelClass } from 'texuli/field';
import { Icon } from 'texuli/icons';
import { NumberField } from 'texuli/number-pin';

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
</script>

<div class={cx('ui-number-stepper', className)}>
  <span id={labelId} class={labelClass({ class: hideLabel ? 'tx-sr-only' : undefined })}>{label}</span>
  <NumberField.Root
    bind:value={() => value, (next) => (value = next ?? min)}
    {min}
    {max}
    step={safeStep}
    {disabled}
    incrementLabel={`Increase ${label}`}
    decrementLabel={`Decrease ${label}`}
    onValueChange={(next) => {
      if (next !== null) onchange?.(next);
    }}
  >
    <NumberField.Decrement><Icon icon={Minus} size="sm" aria-hidden="true" /></NumberField.Decrement>
    <NumberField.Input aria-labelledby={labelId} />
    {#if unit}<span class="ui-number-stepper__unit">{unit}</span>{/if}
    <NumberField.Increment><Icon icon={Plus} size="sm" aria-hidden="true" /></NumberField.Increment>
  </NumberField.Root>
</div>

<style>
  .ui-number-stepper {
    display: grid;
    gap: 0.5rem;
  }
  .ui-number-stepper__unit {
    align-self: center;
    padding-inline-end: 0.5rem;
    color: var(--tx-muted-foreground, GrayText);
    font-size: var(--tx-font-size-sm, 0.875rem);
  }
</style>
