<script lang="ts">
import { TimeField } from '@texuli/primitives/date-field';
import { dateFieldClass } from 'texuli/date';
import { cn } from '../../../lib/cn.ts';
import { isTimeOfDay, minuteSteps, type TimeFormat, type TimeOfDay } from './time.ts';

/**
 * TimeInput — Texuli's time field (`@texuli/primitives/date-field`
 * `TimeField`, styled with the `texuli/date` recipe): hour and minute
 * spinbuttons and, in the 12-hour format, an AM/PM select, in one labelled
 * group. ArrowUp/ArrowDown spin a segment (the minute by `intervalMinutes`),
 * Home/End jump to the ends, digits type a value. It composes the primitive
 * instead of the styled `TimeField` so it can sit inside FormField (`id`,
 * `aria-describedby`, `aria-invalid`, no second visible label).
 *
 * The value is always 24-hour `HH:mm`, or `null` until hour and minute are
 * chosen; an incomplete entry leaves the value as it was. A value off the
 * minute step shows its own minute.
 */
interface Props {
  value?: TimeOfDay | null;
  format?: TimeFormat;
  /** Minute step of the arrow keys; must divide 60, otherwise 15. */
  intervalMinutes?: number;
  /** Id of the field group, so a `<label for>` or FormField points at it. */
  id?: string;
  /** Group name for assistive tech (FormField's label is linked through `aria-labelledby`). */
  label?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  /** Segment order and digits; `en-US` (hh:mm AM/PM) by default. */
  locale?: string;
  'aria-describedby'?: string;
  /** From FormField; treated like `required`. */
  'aria-required'?: boolean | 'true' | 'false';
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-labelledby'?: string;
  class?: string;
  onValueChange?: (value: TimeOfDay) => void;
}

const uid = $props.id();

let {
  value = $bindable(null),
  format = 12,
  intervalMinutes = 15,
  id = `time-${uid}`,
  label = 'Time',
  name,
  disabled = false,
  required: requiredProp = false,
  locale = 'en-US',
  'aria-describedby': describedBy,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': labelledBy,
  class: className,
  onValueChange,
}: Props = $props();

const required = $derived(requiredProp || ariaRequired === true || ariaRequired === 'true');
const invalid = $derived(ariaInvalid === true || ariaInvalid === 'true');
/** `minuteSteps` falls back to 15 when the interval does not divide 60. */
const minuteStep = $derived(minuteSteps(intervalMinutes)[1] ?? 60);

/** What the field shows; an incomplete entry never reaches `value`. */
let draft = $state<TimeOfDay | null>(null);
$effect(() => {
  draft = value;
});

function change(next: string | null) {
  if (!isTimeOfDay(next) || next === value) return;
  value = next;
  onValueChange?.(next);
}
</script>

<div
  class={cn(dateFieldClass(), 'tx-date--time ui-time-input', className)}
  data-tx-time
  data-invalid={invalid ? 'true' : undefined}
  data-disabled={disabled ? 'true' : undefined}
>
  <div class="tx-date__control">
    <TimeField.Root
      class="tx-date__field"
      bind:value={draft}
      {id}
      {label}
      {locale}
      hourCycle={format}
      {minuteStep}
      {disabled}
      {required}
      {...name ? { name } : {}}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      onValueChange={change}
    />
  </div>
</div>
